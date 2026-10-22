import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(handlers, { token, onAuthRequired } = {}) {
  const handlersRef = useRef(handlers);
  const authRequiredRef = useRef(onAuthRequired);
  const [connected, setConnected] = useState(false);
  handlersRef.current = handlers;
  authRequiredRef.current = onAuthRequired;

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket = io(socketUrl, {
      query: { tipo: 'tablet' },
      auth: token ? { token } : {},
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error) => {
      setConnected(false);
      if (error.message === 'auth_required' || error.message === 'role_forbidden') {
        authRequiredRef.current?.();
      }
    });
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
  }, [token]);

  return connected;
}
