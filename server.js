// Amigo Secreto en tiempo real — Express + Socket.io
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

/* ---------- Estado en memoria ---------- */
// rooms: code -> { code, ev, status, hostToken, players: Map<id, player>, excl: [[idA,idB]], result: Map<giverId, receiverId>, created }
// player: { id, name, token, isHost, sockets: Set<socketId> }
const rooms = new Map();
const MAX_PLAYERS = 80;
const ROOM_TTL_MS = 1000 * 60 * 60 * 24 * 21; // 21 días

const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randCode = (n) => [...crypto.randomBytes(n)].map((b) => ALPH[b % ALPH.length]).join('');
const newToken = () => crypto.randomBytes(16).toString('hex');
const newId = () => crypto.randomBytes(6).toString('hex');
const clean = (s, max = 40) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Preferencias de medias
const SIZES = ['8-10', '9-11', '10-12', '10-13'];
const STYLES = ['Navideñas', 'Divertidas / estampadas', 'Deportivas', 'Tobilleras', 'Largas', 'Térmicas / gruesas', 'Lisas / elegantes', 'Antideslizantes'];
function cleanPrefs(p = {}) {
  return {
    size: clean(p.size, 20),
    styles: Array.isArray(p.styles) ? [...new Set(p.styles.filter((s) => STYLES.includes(s)))] : [],
    notes: clean(p.notes, 120),
  };
}

function newRoomCode() {
  let c;
  do c = randCode(5); while (rooms.has(c));
  return c;
}

function publicState(r) {
  return {
    code: r.code,
    ev: r.ev,
    status: r.status,
    players: [...r.players.values()].map((p) => ({
      id: p.id, name: p.name, isHost: p.isHost, online: p.sockets.size > 0,
    })),
  };
}
const hostState = (r) => ({ ...publicState(r), excl: r.excl });

function broadcast(r) {
  io.to('room:' + r.code).emit('room', publicState(r));
  io.to('host:' + r.code).emit('hostRoom', hostState(r));
}

function getHostRoom(code, hostToken) {
  const r = rooms.get(String(code || '').toUpperCase());
  if (!r || !hostToken || r.hostToken !== hostToken) return null;
  return r;
}

function attachPlayer(socket, r, p) {
  p.sockets.add(socket.id);
  socket.data.code = r.code;
  socket.data.playerId = p.id;
  socket.join('room:' + r.code);
  socket.join('player:' + r.code + ':' + p.id);
}

function resultFor(r, p) {
  if (r.status !== 'drawn' || !r.result) return null;
  const rec = r.players.get(r.result.get(p.id));
  return rec ? { name: rec.name, prefs: rec.prefs } : null;
}
// Si alguien cambia sus preferencias después del sorteo, su amigo secreto lo ve al instante
function notifyGiverOf(r, receiverId) {
  if (r.status !== 'drawn' || !r.result) return;
  for (const [giverId, recId] of r.result) {
    if (recId !== receiverId) continue;
    const giver = r.players.get(giverId);
    if (giver) io.to('player:' + r.code + ':' + giverId).emit('result', { receiver: resultFor(r, giver) });
  }
}

/* ---------- Sorteo: un solo círculo, respetando restricciones ---------- */
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function draw(ids, excl) {
  const blocked = (a, b) => a === b || excl.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let attempt = 0; attempt < 60; attempt++) {
    const start = shuffle(ids)[0];
    const used = new Set([start]);
    const pathArr = [start];
    let steps = 0;
    const bt = () => {
      if (++steps > 30000) return false;
      if (pathArr.length === ids.length) return !blocked(pathArr[pathArr.length - 1], pathArr[0]);
      for (const c of shuffle(ids)) {
        if (used.has(c) || blocked(pathArr[pathArr.length - 1], c)) continue;
        used.add(c); pathArr.push(c);
        if (bt()) return true;
        used.delete(c); pathArr.pop();
      }
      return false;
    };
    if (bt()) {
      const m = new Map();
      pathArr.forEach((g, i) => m.set(g, pathArr[(i + 1) % pathArr.length]));
      return m;
    }
  }
  // Respaldo: cualquier asignación válida (puede formar varios círculos)
  for (let t = 0; t < 20000; t++) {
    const rec = shuffle(ids);
    if (ids.every((g, i) => !blocked(g, rec[i]))) return new Map(ids.map((g, i) => [g, rec[i]]));
  }
  return null;
}

/* ---------- Sockets ---------- */
io.on('connection', (socket) => {
  const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };

  // Organizador crea la sala
  socket.on('create', (data = {}, ack) => {
    const ev = {
      name: clean(data.ev?.name, 60) || 'Amigo Secreto',
      budget: clean(data.ev?.budget, 30),
      date: clean(data.ev?.date, 10),
      place: clean(data.ev?.place, 60),
    };
    const r = {
      code: newRoomCode(), ev, status: 'lobby', hostToken: newToken(),
      players: new Map(), excl: [], result: null, created: Date.now(),
    };
    rooms.set(r.code, r);
    socket.join('host:' + r.code);
    socket.join('room:' + r.code);

    let playerId = null, playerToken = null;
    const hostName = clean(data.hostName);
    if (hostName) {
      const p = { id: newId(), name: hostName, token: newToken(), isHost: true, prefs: cleanPrefs(data.hostPrefs), sockets: new Set() };
      r.players.set(p.id, p);
      attachPlayer(socket, r, p);
      playerId = p.id; playerToken = p.token;
    }
    reply(ack, { ok: true, code: r.code, hostToken: r.hostToken, playerId, playerToken, state: hostState(r) });
    broadcast(r);
  });

  // Organizador vuelve a conectarse (recarga, se cayó el internet, etc.)
  socket.on('hostRejoin', ({ code, hostToken } = {}, ack) => {
    const r = getHostRoom(code, hostToken);
    if (!r) return reply(ack, { ok: false, err: 'La sala ya no existe.' });
    socket.join('host:' + r.code);
    socket.join('room:' + r.code);
    reply(ack, { ok: true, state: hostState(r) });
  });

  // Participante se une (o se reconecta con su token)
  socket.on('join', ({ code, name, token, prefs } = {}, ack) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return reply(ack, { ok: false, err: 'No existe una sala con ese código.', gone: true });

    const existing = token && [...r.players.values()].find((p) => p.token === token);
    if (existing) {
      attachPlayer(socket, r, existing);
      reply(ack, { ok: true, playerId: existing.id, token: existing.token, name: existing.name, prefs: existing.prefs, state: publicState(r), result: resultFor(r, existing) });
      return broadcast(r);
    }

    if (r.status !== 'lobby') return reply(ack, { ok: false, err: 'El sorteo de esta sala ya se hizo. Pídele al organizador que lo rehaga si te faltó unirte.' });
    const nm = clean(name);
    if (!nm) return reply(ack, { ok: false, err: 'Escribe tu nombre.' });
    if ([...r.players.values()].some((p) => p.name.toLowerCase() === nm.toLowerCase()))
      return reply(ack, { ok: false, err: 'Ya hay alguien con ese nombre en la sala. Agrega tu apellido o una inicial.' });
    if (r.players.size >= MAX_PLAYERS) return reply(ack, { ok: false, err: 'La sala está llena.' });

    const p = { id: newId(), name: nm, token: newToken(), isHost: false, prefs: cleanPrefs(prefs), sockets: new Set() };
    r.players.set(p.id, p);
    attachPlayer(socket, r, p);
    reply(ack, { ok: true, playerId: p.id, token: p.token, name: p.name, prefs: p.prefs, state: publicState(r), result: null });
    broadcast(r);
  });

  // Participante actualiza su talla / gustos (antes o después del sorteo)
  socket.on('prefs', ({ code, token, prefs } = {}, ack) => {
    const r = rooms.get(String(code || '').toUpperCase());
    const p = r && token && [...r.players.values()].find((x) => x.token === token);
    if (!p) return reply(ack, { ok: false, err: 'No se encontró tu registro en la sala.' });
    p.prefs = cleanPrefs(prefs);
    reply(ack, { ok: true, prefs: p.prefs });
    notifyGiverOf(r, p.id);
  });

  // Participante sale de la sala (solo antes del sorteo)
  socket.on('leave', ({ code, token } = {}, ack) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return reply(ack, { ok: true });
    const p = [...r.players.values()].find((x) => x.token === token);
    if (p && r.status === 'lobby') {
      r.players.delete(p.id);
      r.excl = r.excl.filter(([a, b]) => a !== p.id && b !== p.id);
      socket.leave('player:' + r.code + ':' + p.id);
      broadcast(r);
    }
    socket.leave('room:' + r.code);
    reply(ack, { ok: true });
  });

  socket.on('kick', ({ code, hostToken, playerId } = {}, ack) => {
    const r = getHostRoom(code, hostToken);
    if (!r || r.status !== 'lobby') return reply(ack, { ok: false });
    if (!r.players.has(playerId)) return reply(ack, { ok: false });
    r.players.delete(playerId);
    r.excl = r.excl.filter(([a, b]) => a !== playerId && b !== playerId);
    io.to('player:' + r.code + ':' + playerId).emit('kicked');
    reply(ack, { ok: true });
    broadcast(r);
  });

  socket.on('exclAdd', ({ code, hostToken, a, b } = {}, ack) => {
    const r = getHostRoom(code, hostToken);
    if (!r || r.status !== 'lobby' || a === b || !r.players.has(a) || !r.players.has(b)) return reply(ack, { ok: false });
    if (!r.excl.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) r.excl.push([a, b]);
    reply(ack, { ok: true });
    broadcast(r);
  });

  socket.on('exclRemove', ({ code, hostToken, index } = {}, ack) => {
    const r = getHostRoom(code, hostToken);
    if (!r) return reply(ack, { ok: false });
    r.excl.splice(Number(index), 1);
    reply(ack, { ok: true });
    broadcast(r);
  });

  socket.on('draw', ({ code, hostToken } = {}, ack) => {
    const r = getHostRoom(code, hostToken);
    if (!r) return reply(ack, { ok: false, err: 'Sala no encontrada.' });
    if (r.players.size < 3) return reply(ack, { ok: false, err: 'Se necesitan al menos 3 personas.' });
    const m = draw([...r.players.keys()], r.excl);
    if (!m) return reply(ack, { ok: false, err: 'No hay forma de sortear con esas restricciones. Quita alguna.' });
    r.result = m;
    r.status = 'drawn';
    // Cada participante recibe SOLO su resultado
    for (const p of r.players.values()) {
      io.to('player:' + r.code + ':' + p.id).emit('result', { receiver: resultFor(r, p) });
    }
    reply(ack, { ok: true });
    broadcast(r);
  });

  socket.on('reset', ({ code, hostToken } = {}, ack) => {
    const r = getHostRoom(code, hostToken);
    if (!r) return reply(ack, { ok: false });
    r.status = 'lobby';
    r.result = null;
    io.to('room:' + r.code).emit('reset');
    reply(ack, { ok: true });
    broadcast(r);
  });

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    const r = code && rooms.get(code);
    const p = r && r.players.get(playerId);
    if (p) { p.sockets.delete(socket.id); broadcast(r); }
  });
});

// Limpieza de salas viejas
setInterval(() => {
  const now = Date.now();
  for (const [c, r] of rooms) if (now - r.created > ROOM_TTL_MS) rooms.delete(c);
}, 1000 * 60 * 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Amigo secreto escuchando en http://localhost:${PORT}`));
