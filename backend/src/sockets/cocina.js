const deviceRooms = new Set(['kds', 'tablet', 'admin']);

export function configureKitchenSockets(io) {
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

      for (const room of deviceRooms) socket.leave(room);
      socket.join(tipo);
      acknowledge?.({ ok: true, tipo });
    });
  });
}

