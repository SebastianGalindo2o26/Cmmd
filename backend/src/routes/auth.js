import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, verifyPassword, createToken } from '../auth.js';
import { pool } from '../db/connection.js';
import { HttpError, validate } from '../http.js';

export const authRouter = Router();

const loginSchema = z.object({
  usuario: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
}).strict();

authRouter.post('/login', async (req, res) => {
  const data = validate(loginSchema, req.body);
  const result = await pool.query(
    `SELECT id, nombre, usuario, password_hash, rol, activo
     FROM usuarios WHERE usuario = $1`,
    [data.usuario],
  );
  const user = result.rows[0];
  if (!user || !user.activo || !(await verifyPassword(data.password, user.password_hash))) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }

  res.json({
    token: createToken(user),
    usuario: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
  });
});

authRouter.get('/me', (req, res, next) => {
  requireAuth(req, res, (error) => {
    if (error) return next(error);
    res.json({ autenticado: true, usuario: req.user });
  });
});
