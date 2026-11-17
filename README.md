# 🎁 Amigo Secreto · Recorrido de Don Lenin

Amigo secreto en tiempo real: el organizador crea una sala, comparte **un solo código**, todos se unen desde su celular y, al sortear, a cada uno le aparece en su pantalla a quién le toca.

- Node.js + Express + Socket.io
- Sin base de datos ni cuentas: la sala vive en la memoria del servidor.
- El servidor le envía a cada participante **solo su resultado**. Nadie (ni el organizador) ve los resultados de los demás.

## Probar en local

```bash
npm install
npm start
# abre http://localhost:3000
```

Para probar con el celular en la misma red Wi-Fi: `http://<IP-de-tu-PC>:3000`.

## Desplegar en Render

1. Sube esta carpeta a un repositorio de GitHub:
   ```bash
   git init && git add . && git commit -m "Amigo secreto"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/amigo-secreto.git
   git push -u origin main
   ```
2. En [render.com](https://render.com) → **New → Web Service** → conecta el repo.
3. Configuración (Render la toma sola del `render.yaml`, pero por si acaso):
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. **Create Web Service**. En 1–2 minutos te da una URL tipo `https://amigo-secreto-don-lenin.onrender.com`.

## Cómo se juega

1. El organizador abre la URL → **Crear una sala** → llena presupuesto/fecha → le sale un código de 5 caracteres.
2. Toca **Enviar al grupo** (WhatsApp) — el mensaje lleva el link con el código ya puesto.
3. Cada uno abre el link, escribe su nombre y queda en la sala de espera. El organizador los ve llegar en vivo.
4. Cuando estén todos → **Hacer el sorteo**. A cada uno le aparece el regalo para abrir.

Si alguien cierra la página o se le apaga el celular, al volver a abrir el link entra solo y ve su resultado (queda guardado en su navegador).

## ⚠️ Plan gratuito de Render

- **Se duerme tras 15 min sin uso.** La primera visita después tarda ~1 minuto en despertar (la app muestra un aviso amarillo mientras tanto).
- **Si el servidor se reinicia o duerme, las salas se borran** (están en memoria). Por eso:
  - Haz la sala y el sorteo **en una misma sesión** (por ejemplo, todos juntos en el recorrido). Mientras la gente esté conectada, el servidor no se duerme.
  - Los resultados ya entregados **no se pierden**: quedan guardados en el celular de cada uno.
- Si quieres que las salas sobrevivan reinicios, se puede añadir una base de datos (Render Postgres, Redis/Upstash o un archivo en un disco persistente de pago).
