import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/connection.js';
import { HttpError, notFound, parseId, validate } from '../http.js';
import { createOrder } from '../services/orders.js';

export const mesasRouter = Router();

const mesaSchema = z.object({
  numero: z.number().int().positive(),
}).strict();

mesasRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.id, m.numero, m.estado, o.id AS orden_abierta_id
     FROM mesas m
     LEFT JOIN ordenes o ON o.mesa_id = m.id AND o.estado = 'abierta'
     ORDER BY m.numero`,
  );
  res.json(rows);
});

mesasRouter.post('/', async (req, res) => {
  const data = validate(mesaSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO mesas (numero) VALUES ($1)
       RETURNING id, numero, estado`,
      [data.numero],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

const abrirMesaSchema = z.object({
  usuario_id: z.number().int().positive(),
}).strict();

mesasRouter.post('/:id/abrir', async (req, res) => {
  const mesaId = parseId(req.params.id, 'mesa_id');
  const data = validate(abrirMesaSchema, req.body);
  const order = await createOrder({ mesaId, usuarioId: data.usuario_id });
  req.app.get('io')?.to('tablet').emit('mesa_actualizada', {
    mesa_id: mesaId,
    estado: 'ocupada',
    orden_abierta_id: order.id,
  });
  res.status(201).json(order);
});

mesasRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(mesaSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE mesas SET numero = $1 WHERE id = $2
       RETURNING id, numero, estado`,
      [data.numero, id],
    );
    if (result.rowCount === 0) throw notFound('Mesa');
    return result.rows[0];
  });
  res.json(row);
});

mesasRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async (client) => {
    const mesa = await client.query('SELECT estado FROM mesas WHERE id = $1 FOR UPDATE', [id]);
    if (!mesa.rows[0]) throw notFound('Mesa');
    if (mesa.rows[0].estado === 'ocupada') {
      throw new HttpError(409, 'No se puede eliminar una mesa ocupada');
    }
    await client.query('DELETE FROM mesas WHERE id = $1', [id]);
  });
  res.status(204).end();
});
