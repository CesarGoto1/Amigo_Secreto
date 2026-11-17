# Amigo Secreto - Recorrido de Don Lenin

Intercambio de medias con sala en tiempo real. El organizador crea una sala, comparte el código y cada participante se une desde su celular con su nombre y su talla. Al hacer el sorteo, a cada uno le aparece a quién le toca regalar.

Hecho con Node.js, Express y Socket.io. Las salas se guardan en memoria.

## Correr en local

```bash
npm install
npm start
```

Abrir http://localhost:3000

## Despliegue en Render

1. Subir el repo a GitHub.
2. En Render: New > Web Service > conectar el repo.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Instance Type: Free

## Uso

1. Crear una sala y compartir el link o el código por WhatsApp.
2. Cada participante entra, escribe su nombre, su talla y, si quiere, colores o detalles.
3. Cuando estén todos, el organizador hace el sorteo.
4. Cada uno ve a quién le toca y la talla de esa persona.

## Notas

- En el plan gratuito, Render apaga el servicio después de 15 minutos sin uso y tarda cerca de un minuto en volver a encender.
- Si el servidor se reinicia, las salas se pierden. Conviene crear la sala y sortear el mismo día.
- Los resultados ya mostrados quedan guardados en el navegador de cada participante.
