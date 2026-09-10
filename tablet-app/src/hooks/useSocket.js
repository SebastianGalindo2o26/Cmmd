import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(handlers) {
  const handlersRef = useRef(handlers);
  const [connected, setConnected] = useState(false);
  handlersRef.current = handlers;

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket = io(socketUrl, { query: { tipo: 'tablet' } });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    for (const event of [
      'conexion_lista',
      'mesa_actualizada',
      'orden_actualizada',
      'item_estado_cambiado',
      'pago_registrado',
      'orden_cerrada',
    ]) {
      socket.on(event, (payload) => handlersRef.current[event]?.(payload));
    }

    return () => socket.close();
  }, []);

  return connected;
}
