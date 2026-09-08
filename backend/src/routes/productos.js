import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/connection.js';
import { notFound, parseId, validate } from '../http.js';

export const productosRouter = Router();

const productoSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
  descripcion: z.string().trim().nullable().optional(),
  precio: z.coerce.number().min(0).max(99_999_999.99),
  imagen_url: z.string().trim().max(500).nullable().optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
}).strict();

const selectProductos = `
  SELECT p.id, p.nombre, p.descripcion, p.precio, p.imagen_url,
         p.categoria_id, p.activo, c.nombre AS categoria_nombre
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id`;

productosRouter.get('/', async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.activo !== undefined) {
    if (!['true', 'false'].includes(req.query.activo)) {
      return res.status(400).json({ error: 'activo debe ser true o false' });
    }
    params.push(req.query.activo === 'true');
    conditions.push(`p.activo = $${params.length}`);
  }

  if (req.query.categoria_id !== undefined) {
    params.push(parseId(req.query.categoria_id, 'categoria_id'));
    conditions.push(`p.categoria_id = $${params.length}`);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`${selectProductos}${where} ORDER BY p.nombre`, params);
  res.json(rows);
});

productosRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(`${selectProductos} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Producto');
  res.json(rows[0]);
});

productosRouter.post('/', async (req, res) => {
  const data = validate(productoSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO productos
        (nombre, descripcion, precio, imagen_url, categoria_id, activo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
      [
        data.nombre,
        data.descripcion ?? null,
        data.precio,
        data.imagen_url ?? null,
        data.categoria_id ?? null,
        data.activo ?? true,
      ],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

productosRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(productoSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE productos
       SET nombre = $1, descripcion = $2, precio = $3, imagen_url = $4,
           categoria_id = $5, activo = $6
       WHERE id = $7
       RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
      [
        data.nombre,
        data.descripcion ?? null,
        data.precio,
        data.imagen_url ?? null,
        data.categoria_id ?? null,
        data.activo ?? true,
        id,
      ],
    );
    if (result.rowCount === 0) throw notFound('Producto');
    return result.rows[0];
  });
  res.json(row);
});

productosRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE productos SET activo = false WHERE id = $1
       RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
      [id],
    );
    if (result.rowCount === 0) throw notFound('Producto');
    return result.rows[0];
  });
  res.json(row);
});

