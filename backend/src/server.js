import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/connection.js';
import { configureKitchenSockets } from './sockets/cocina.js';

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.set('io', io);
configureKitchenSockets(io);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`API POS escuchando en http://0.0.0.0:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} recibido; cerrando servidor`);
  io.disconnectSockets(true);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
