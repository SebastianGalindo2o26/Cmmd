import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/connection.js';
import { notFound, parseId, validate } from '../http.js';

export const usuariosRouter = Router();

const userSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
  usuario: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/, 'Usuario inválido'),
  rol: z.enum(['mesero', 'cocina', 'cajero', 'admin']),
  activo: z.boolean().optional(),
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
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo)
       VALUES ($1, $2, 'AUTH_PENDING', $3, $4)
       RETURNING id, nombre, usuario, rol, activo`,
      [data.nombre, data.usuario, data.rol, data.activo ?? true],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

usuariosRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(userSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
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
