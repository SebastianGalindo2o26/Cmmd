import { Router } from 'express';
import { z } from 'zod';
import { requireRoleIfEnabled } from '../auth.js';
import { pool, withTransaction } from '../db/connection.js';
import { HttpError, notFound, parseId, validate } from '../http.js';

export const modificadoresRouter = Router();

const modifierSchema = z.object({
  producto_id: z.number().int().positive(),
  nombre: z.string().trim().min(1).max(120),
  precio_extra: z.coerce.number().min(0).max(99_999_999.99),
  activo: z.boolean().optional(),
}).strict();

function parseActive(value) {
  if (value === undefined) return undefined;
  if (!['true', 'false'].includes(value)) {
    throw new HttpError(400, 'activo debe ser true o false');
  }
  return value === 'true';
}

const selectModifiers = `
  SELECT m.id, m.producto_id, p.nombre AS producto_nombre,
         m.nombre, m.precio_extra, m.activo
  FROM modificadores m
  JOIN productos p ON p.id = m.producto_id`;

modificadoresRouter.get('/', async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.producto_id !== undefined) {
    params.push(parseId(req.query.producto_id, 'producto_id'));
    conditions.push(`m.producto_id = $${params.length}`);
  }
  const activo = parseActive(req.query.activo);
  if (activo !== undefined) {
    params.push(activo);
    conditions.push(`m.activo = $${params.length}`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`${selectModifiers}${where} ORDER BY m.nombre`, params);
  res.json(rows);
});

modificadoresRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'modificador_id');
  const { rows } = await pool.query(`${selectModifiers} WHERE m.id = $1`, [id]);
  if (!rows[0]) throw notFound('Modificador');
  res.json(rows[0]);
});

async function ensureProduct(client, productId) {
  const result = await client.query('SELECT id FROM productos WHERE id = $1', [productId]);
  if (result.rowCount === 0) throw notFound('Producto');
}

modificadoresRouter.post('/', requireRoleIfEnabled('admin'), async (req, res) => {
  const data = validate(modifierSchema, req.body);
  const row = await withTransaction(async (client) => {
    await ensureProduct(client, data.producto_id);
    const result = await client.query(
      `INSERT INTO modificadores (producto_id, nombre, precio_extra, activo)
       VALUES ($1, $2, $3, $4)
       RETURNING id, producto_id, nombre, precio_extra, activo`,
      [data.producto_id, data.nombre, data.precio_extra, data.activo ?? true],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

modificadoresRouter.put('/:id', requireRoleIfEnabled('admin'), async (req, res) => {
  const id = parseId(req.params.id, 'modificador_id');
  const data = validate(modifierSchema, req.body);
  const row = await withTransaction(async (client) => {
    await ensureProduct(client, data.producto_id);
    const result = await client.query(
      `UPDATE modificadores
       SET producto_id = $1, nombre = $2, precio_extra = $3, activo = $4
       WHERE id = $5
       RETURNING id, producto_id, nombre, precio_extra, activo`,
      [data.producto_id, data.nombre, data.precio_extra, data.activo ?? true, id],
    );
    if (result.rowCount === 0) throw notFound('Modificador');
    return result.rows[0];
  });
  res.json(row);
});

modificadoresRouter.delete('/:id', requireRoleIfEnabled('admin'), async (req, res) => {
  const id = parseId(req.params.id, 'modificador_id');
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE modificadores SET activo = false
       WHERE id = $1
       RETURNING id, producto_id, nombre, precio_extra, activo`,
      [id],
    );
    if (result.rowCount === 0) throw notFound('Modificador');
    return result.rows[0];
  });
  res.json(row);
});
