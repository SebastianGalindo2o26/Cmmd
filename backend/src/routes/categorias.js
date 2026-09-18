import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/connection.js';
import { notFound, parseId, validate } from '../http.js';

export const categoriasRouter = Router();

const categoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  imagen_url: z.string().trim().max(500).nullable().optional(),
  orden: z.number().int().min(0).optional(),
}).strict();

categoriasRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nombre, imagen_url, orden FROM categorias ORDER BY orden, nombre',
  );
  res.json(rows);
});

categoriasRouter.post('/', async (req, res) => {
  const data = validate(categoriaSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO categorias (nombre, imagen_url, orden)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, imagen_url, orden`,
      [data.nombre, data.imagen_url ?? null, data.orden ?? 0],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

categoriasRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(categoriaSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE categorias
       SET nombre = $1, imagen_url = $2, orden = $3
       WHERE id = $4
       RETURNING id, nombre, imagen_url, orden`,
      [data.nombre, data.imagen_url ?? null, data.orden ?? 0, id],
    );
    if (result.rowCount === 0) throw notFound('Categoría');
    return result.rows[0];
  });
  res.json(row);
});

categoriasRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async (client) => {
    const result = await client.query('DELETE FROM categorias WHERE id = $1', [id]);
    if (result.rowCount === 0) throw notFound('Categoría');
  });
  res.status(204).end();
});
