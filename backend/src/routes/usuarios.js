import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/connection.js';
import { HttpError, notFound, parseId, validate } from '../http.js';

export const usuariosRouter = Router();

const userSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
  usuario: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/, 'Usuario inválido'),
  rol: z.enum(['mesero', 'cocina', 'cajero', 'admin']),
  activo: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
}).strict();

const selectUsers = `
  SELECT id, nombre, usuario, rol, activo
  FROM usuarios`;

usuariosRouter.get('/', async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.activo !== undefined) {
    if (!['true', 'false'].includes(req.query.activo)) {
      return res.status(400).json({ error: 'activo debe ser true o false' });
    }
    params.push(req.query.activo === 'true');
    conditions.push(`activo = $${params.length}`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`${selectUsers}${where} ORDER BY nombre`, params);
  res.json(rows);
});

usuariosRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(`${selectUsers} WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Usuario');
  res.json(rows[0]);
});

usuariosRouter.post('/', async (req, res) => {
  const data = validate(userSchema, req.body);
  if (config.authRequired && !data.password) {
    throw new HttpError(400, 'La contraseña es obligatoria cuando la autenticación está activa');
  }
  const passwordHash = await hashPassword(data.password ?? 'dev-only-password');
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, usuario, rol, activo`,
      [data.nombre, data.usuario, passwordHash, data.rol, data.activo ?? true],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

usuariosRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(userSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = data.password
      ? await client.query(
        `UPDATE usuarios
         SET nombre = $1, usuario = $2, password_hash = $3, rol = $4, activo = $5
         WHERE id = $6
         RETURNING id, nombre, usuario, rol, activo`,
        [data.nombre, data.usuario, await hashPassword(data.password), data.rol, data.activo ?? true, id],
      )
      : await client.query(
        `UPDATE usuarios
         SET nombre = $1, usuario = $2, rol = $3, activo = $4
         WHERE id = $5
         RETURNING id, nombre, usuario, rol, activo`,
        [data.nombre, data.usuario, data.rol, data.activo ?? true, id],
      );
    if (result.rowCount === 0) throw notFound('Usuario');
    return result.rows[0];
  });
  res.json(row);
});

usuariosRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE usuarios SET activo = false WHERE id = $1
       RETURNING id, nombre, usuario, rol, activo`,
      [id],
    );
    if (result.rowCount === 0) throw notFound('Usuario');
    return result.rows[0];
  });
  res.json(row);
});
