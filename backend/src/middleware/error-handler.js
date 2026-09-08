import { HttpError } from '../http.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: error.message,
      ...(error.details ? { detalles: error.details } : {}),
    });
  }

  if (error.code === '23505') {
    return res.status(409).json({ error: 'El registro ya existe' });
  }

  if (error.code === '23503') {
    return res.status(409).json({ error: 'El registro está siendo utilizado o su referencia no existe' });
  }

  if (error.code === '23514' || error.code === '22P02') {
    return res.status(400).json({ error: 'Los datos no cumplen las reglas del sistema' });
  }

  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

