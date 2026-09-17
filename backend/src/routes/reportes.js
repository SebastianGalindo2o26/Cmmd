import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db/connection.js';
import { HttpError, validate } from '../http.js';
import { z } from 'zod';

export const reportesRouter = Router();

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
  }, 'La fecha no existe');

const limitSchema = z.coerce.number().int().min(1).max(50).default(10);

function currentRestaurantDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.restaurantTimezone }).format(new Date());
}

function readDate(value) {
  return validate(dateSchema, value ?? currentRestaurantDate());
}

async function fetchTopProducts(fecha, limite) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, c.nombre AS categoria_nombre,
            SUM(i.cantidad)::integer AS cantidad,
            SUM(i.cantidad * i.precio_unitario)::numeric(10,2) AS total
     FROM items_orden i
     JOIN ordenes o ON o.id = i.orden_id
     JOIN productos p ON p.id = i.producto_id
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE o.estado = 'pagada' AND o.fecha_correlativo = $1
     GROUP BY p.id, p.nombre, c.nombre
     ORDER BY cantidad DESC, total DESC, p.nombre
     LIMIT $2`,
    [fecha, limite],
  );
  return rows;
}

reportesRouter.get('/ventas-dia', async (req, res) => {
  const fecha = readDate(req.query.fecha);
  const limite = validate(limitSchema, req.query.limite ?? 10);

  const [summaryResult, methodsResult, topProducts] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::integer AS ordenes,
              COALESCE(SUM(total), 0)::numeric(10,2) AS ventas,
              COALESCE(SUM(total_pagado), 0)::numeric(10,2) AS cobrado
       FROM (
         SELECT o.id, o.total,
                COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS total_pagado
         FROM ordenes o
         WHERE o.estado = 'pagada' AND o.fecha_correlativo = $1
       ) AS cerradas`,
      [fecha],
    ),
    pool.query(
      `SELECT p.metodo, COUNT(*)::integer AS pagos,
              SUM(p.monto)::numeric(10,2) AS total
       FROM pagos p
       JOIN ordenes o ON o.id = p.orden_id
       WHERE o.estado = 'pagada' AND o.fecha_correlativo = $1
       GROUP BY p.metodo
       ORDER BY p.metodo`,
      [fecha],
    ),
    fetchTopProducts(fecha, limite),
  ]);

  res.json({
    fecha,
    resumen: summaryResult.rows[0],
    por_metodo: methodsResult.rows,
    productos_top: topProducts,
  });
});

reportesRouter.get('/productos-top', async (req, res) => {
  const fecha = readDate(req.query.fecha);
  const limite = validate(limitSchema, req.query.limite ?? 10);
  res.json({ fecha, productos: await fetchTopProducts(fecha, limite) });
});

reportesRouter.use((error, req, res, next) => {
  if (error instanceof HttpError) return next(error);
  next(error);
});
