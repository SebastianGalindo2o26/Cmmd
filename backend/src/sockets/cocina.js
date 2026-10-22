import { config } from '../config.js';
import { verifyToken } from '../auth.js';

const deviceRooms = new Set(['kds', 'tablet', 'admin']);
const roomRoles = {
  kds: new Set(['cocina', 'admin']),
  tablet: new Set(['mesero', 'cajero', 'admin']),
  admin: new Set(['cajero', 'admin']),
};

export function configureKitchenSockets(io) {
  io.use((socket, next) => {
    const device = socket.handshake.query?.tipo;
    if (!config.authRequired) return next();

    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    const user = verifyToken(token);
    if (!user) return next(new Error('auth_required'));
    if (!roomRoles[device]?.has(user.rol)) return next(new Error('role_forbidden'));
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    socket.emit('conexion_lista', { socket_id: socket.id });

    const queryDevice = socket.handshake.query?.tipo;
    if (deviceRooms.has(queryDevice)) socket.join(queryDevice);

    socket.on('registrar_dispositivo', (payload, acknowledge) => {
      const tipo = payload?.tipo;
      if (!deviceRooms.has(tipo)) {
        acknowledge?.({ ok: false, error: 'Tipo de dispositivo inválido' });
        return;
      }

      if (config.authRequired && !roomRoles[tipo]?.has(socket.user?.rol)) {
        acknowledge?.({ ok: false, error: 'El rol no puede usar este dispositivo' });
        return;
      }

      for (const room of deviceRooms) socket.leave(room);
      socket.join(tipo);
      acknowledge?.({ ok: true, tipo });
    });
  });
}

