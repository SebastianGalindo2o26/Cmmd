import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/connection.js';
import { HttpError, notFound, parseId, validate } from '../http.js';
import { createOrder, fetchOrder } from '../services/orders.js';

export const ordenesRouter = Router();

const createOrderSchema = z.object({
  mesa_id: z.number().int().positive(),
  usuario_id: z.number().int().positive(),
}).strict();

const orderItemSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().int().min(1).max(99),
  notas: z.string().trim().max(500).nullable().optional(),
}).strict();

const addItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(100),
}).strict();

const moneyNumberSchema = z.number()
  .positive()
  .max(99_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
    message: 'El monto admite como máximo dos decimales',
  });

const moneyStringSchema = z.string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, 'Monto inválido')
  .refine((value) => Number(value) > 0, 'El monto debe ser mayor que cero');

const paymentSchema = z.object({
  metodo: z.enum(['efectivo', 'tarjeta']),
  monto: z.union([moneyNumberSchema, moneyStringSchema])
    .transform((value) => Number(value).toFixed(2)),
}).strict();

const itemStateSchema = z.object({
  estado: z.enum(['preparando', 'listo', 'entregado']),
}).strict();

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
  }, 'La fecha no existe');

function ensureOpen(order) {
  if (order.estado !== 'abierta') {
    throw new HttpError(409, `La orden está ${order.estado} y ya no puede modificarse`);
  }
}

function emitTo(io, room, event, payload) {
  io?.to(room).emit(event, payload);
}

ordenesRouter.post('/', async (req, res) => {
  const data = validate(createOrderSchema, req.body);
  const order = await createOrder({ mesaId: data.mesa_id, usuarioId: data.usuario_id });
  emitTo(req.app.get('io'), 'tablet', 'mesa_actualizada', {
    mesa_id: data.mesa_id,
    estado: 'ocupada',
    orden_abierta_id: order.id,
  });
  res.status(201).json(order);
});

ordenesRouter.get('/cocina/activas', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.mesa_id, m.numero AS mesa_numero, o.total,
            o.fecha_apertura,
            i.id AS item_id, i.producto_id, p.nombre AS producto_nombre,
            i.cantidad, i.notas, i.precio_unitario, i.estado,
            i.enviado_cocina_at
     FROM ordenes o
     JOIN mesas m ON m.id = o.mesa_id
     JOIN items_orden i ON i.orden_id = o.id AND i.enviado_cocina_at IS NOT NULL
     JOIN productos p ON p.id = i.producto_id
     WHERE o.estado = 'abierta'
     ORDER BY o.fecha_apertura, i.id`,
  );

  const orders = new Map();
  for (const row of rows) {
    if (!orders.has(row.id)) {
      orders.set(row.id, {
        id: row.id,
        mesa_id: row.mesa_id,
        mesa_numero: row.mesa_numero,
        total: row.total,
        fecha_apertura: row.fecha_apertura,
        items: [],
      });
    }
    orders.get(row.id).items.push({
      id: row.item_id,
      producto_id: row.producto_id,
      producto_nombre: row.producto_nombre,
      cantidad: row.cantidad,
      notas: row.notas,
      precio_unitario: row.precio_unitario,
      estado: row.estado,
      enviado_cocina_at: row.enviado_cocina_at,
    });
  }

  res.json([...orders.values()]);
});

ordenesRouter.get('/dia/:fecha', async (req, res) => {
  const fecha = validate(dateSchema, req.params.fecha);
  const { rows } = await pool.query(
    `SELECT o.id, o.correlativo, o.fecha_correlativo, o.estado,
            o.fecha_apertura, o.fecha_cierre, o.total,
            o.mesa_id, m.numero AS mesa_numero,
            o.usuario_id, u.nombre AS usuario_nombre,
            COUNT(DISTINCT i.id)::integer AS cantidad_items,
            COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS total_pagado
     FROM ordenes o
     JOIN mesas m ON m.id = o.mesa_id
     JOIN usuarios u ON u.id = o.usuario_id
     LEFT JOIN items_orden i ON i.orden_id = o.id
     WHERE o.fecha_correlativo = $1
     GROUP BY o.id, m.numero, u.nombre
     ORDER BY o.correlativo`,
    [fecha],
  );
  res.json(rows);
});

ordenesRouter.get('/:id', async (req, res) => {
  const orderId = parseId(req.params.id, 'orden_id');
  const order = await withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return fetchOrder(client, orderId);
  });
  res.json(order);
});

ordenesRouter.post('/:id/items', async (req, res) => {
  const orderId = parseId(req.params.id, 'orden_id');
  const data = validate(addItemsSchema, req.body);

  const result = await withTransaction(async (client) => {
    const orderResult = await client.query(
      'SELECT id, estado FROM ordenes WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) throw notFound('Orden');
    ensureOpen(order);

    const productIds = [...new Set(data.items.map((item) => item.producto_id))];
    const productsResult = await client.query(
      `SELECT id, nombre, precio
       FROM productos
       WHERE id = ANY($1::integer[]) AND activo = true`,
      [productIds],
    );
    if (productsResult.rowCount !== productIds.length) {
      throw new HttpError(409, 'Uno o más productos no existen o están inactivos');
    }
    const products = new Map(productsResult.rows.map((product) => [product.id, product]));

    const inserted = [];
    for (const item of data.items) {
      const product = products.get(item.producto_id);
      const insertResult = await client.query(
        `INSERT INTO items_orden
          (orden_id, producto_id, cantidad, notas, precio_unitario)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, producto_id, cantidad, notas, precio_unitario,
                   (cantidad * precio_unitario)::numeric(10,2) AS subtotal,
                   estado, enviado_cocina_at`,
        [orderId, item.producto_id, item.cantidad, item.notas ?? null, product.precio],
      );
      inserted.push({ ...insertResult.rows[0], producto_nombre: product.nombre });
    }

    const totalResult = await client.query(
      `UPDATE ordenes
       SET total = (
         SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
         FROM items_orden
         WHERE orden_id = $1
       )
       WHERE id = $1
       RETURNING total`,
      [orderId],
    );

    return { orden_id: orderId, total: totalResult.rows[0].total, items: inserted };
  });

  res.status(201).json(result);
});

ordenesRouter.post('/:id/enviar-cocina', async (req, res) => {
  const orderId = parseId(req.params.id, 'orden_id');

  const round = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `SELECT o.id, o.mesa_id, m.numero AS mesa_numero, o.estado, o.total,
              o.fecha_apertura
       FROM ordenes o
       JOIN mesas m ON m.id = o.mesa_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) throw notFound('Orden');
    ensureOpen(order);

    const previousResult = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM items_orden
         WHERE orden_id = $1 AND enviado_cocina_at IS NOT NULL
       ) AS tenia_rondas`,
      [orderId],
    );

    const updatedResult = await client.query(
      `UPDATE items_orden
       SET enviado_cocina_at = now()
       WHERE orden_id = $1 AND enviado_cocina_at IS NULL
       RETURNING id`,
      [orderId],
    );
    if (updatedResult.rowCount === 0) {
      throw new HttpError(409, 'La orden no tiene ítems nuevos para enviar a cocina');
    }

    const itemIds = updatedResult.rows.map((item) => item.id);
    const itemsResult = await client.query(
      `SELECT i.id, i.producto_id, p.nombre AS producto_nombre,
              i.cantidad, i.notas, i.precio_unitario, i.estado,
              i.enviado_cocina_at
       FROM items_orden i
       JOIN productos p ON p.id = i.producto_id
       WHERE i.id = ANY($1::integer[])
       ORDER BY i.id`,
      [itemIds],
    );

    return {
      event: previousResult.rows[0].tenia_rondas ? 'orden_actualizada' : 'nueva_orden',
      payload: { ...order, items: itemsResult.rows },
    };
  });

  const io = req.app.get('io');
  emitTo(io, 'kds', round.event, round.payload);
  if (round.event === 'orden_actualizada') {
    emitTo(io, 'tablet', round.event, round.payload);
  }
  res.json({ evento: round.event, ...round.payload });
});

ordenesRouter.patch('/:id/items/:itemId/estado', async (req, res) => {
  const orderId = parseId(req.params.id, 'orden_id');
  const itemId = parseId(req.params.itemId, 'item_id');
  const data = validate(itemStateSchema, req.body);

  const item = await withTransaction(async (client) => {
    const orderResult = await client.query(
      'SELECT id, estado FROM ordenes WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    if (!orderResult.rows[0]) throw notFound('Orden');
    ensureOpen(orderResult.rows[0]);

    const result = await client.query(
      `SELECT i.id, i.orden_id, i.estado, i.enviado_cocina_at
       FROM items_orden i
       WHERE i.id = $1 AND i.orden_id = $2
       FOR UPDATE`,
      [itemId, orderId],
    );
    const current = result.rows[0];
    if (!current) throw notFound('Ítem de orden');
    if (!current.enviado_cocina_at) {
      throw new HttpError(409, 'El ítem todavía no fue enviado a cocina');
    }

    if (current.estado === data.estado) return { item: current, changed: false };

    const nextState = {
      pendiente: 'preparando',
      preparando: 'listo',
      listo: 'entregado',
    }[current.estado];
    if (data.estado !== nextState) {
      throw new HttpError(409, `El ítem debe pasar de ${current.estado} a ${nextState ?? 'ningún otro estado'}`);
    }

    const updateResult = await client.query(
      `UPDATE items_orden SET estado = $1 WHERE id = $2
       RETURNING id, orden_id, estado, enviado_cocina_at`,
      [data.estado, itemId],
    );
    return { item: updateResult.rows[0], changed: true };
  });

  const payload = {
    orden_id: orderId,
    item_id: itemId,
    nuevo_estado: item.item.estado,
    cambio: item.changed,
  };
  if (item.changed) {
    emitTo(req.app.get('io'), 'tablet', 'item_estado_cambiado', payload);
  }
  res.json(payload);
});

ordenesRouter.post('/:id/pagos', async (req, res) => {
  const orderId = parseId(req.params.id, 'orden_id');
  const data = validate(paymentSchema, req.body);

  const result = await withTransaction(async (client) => {
    const orderResult = await client.query(
      `SELECT id, mesa_id, estado, total
       FROM ordenes
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) throw notFound('Orden');
    ensureOpen(order);
    if (order.total === '0.00') {
      throw new HttpError(409, 'No se puede pagar una orden sin productos');
    }

    const paidResult = await client.query(
      'SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos WHERE orden_id = $1',
      [orderId],
    );
    const comparisonResult = await client.query(
      `SELECT ($1::numeric + $2::numeric)::numeric(10,2) AS nuevo_total_pagado,
              ($1::numeric + $2::numeric) > $3::numeric AS excede,
              ($1::numeric + $2::numeric) = $3::numeric AS completa,
              ($3::numeric - ($1::numeric + $2::numeric))::numeric(10,2) AS saldo`,
      [paidResult.rows[0].total_pagado, data.monto, order.total],
    );
    const comparison = comparisonResult.rows[0];
    if (comparison.excede) {
      throw new HttpError(409, 'El pago excede el saldo pendiente');
    }

    const paymentResult = await client.query(
      `INSERT INTO pagos (orden_id, metodo, monto)
       VALUES ($1, $2, $3)
       RETURNING id, orden_id, metodo, monto, creado_at`,
      [orderId, data.metodo, data.monto],
    );

    let closure = null;
    if (comparison.completa) {
      const dateResult = await client.query(
        'SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date AS fecha',
        [config.restaurantTimezone],
      );
      const fecha = dateResult.rows[0].fecha;

      await client.query(
        `INSERT INTO correlativos_dia (fecha, ultimo_numero)
         VALUES ($1, 0)
         ON CONFLICT (fecha) DO NOTHING`,
        [fecha],
      );
      await client.query(
        'SELECT ultimo_numero FROM correlativos_dia WHERE fecha = $1 FOR UPDATE',
        [fecha],
      );
      const sequenceResult = await client.query(
        `UPDATE correlativos_dia
         SET ultimo_numero = ultimo_numero + 1
         WHERE fecha = $1
         RETURNING ultimo_numero`,
        [fecha],
      );
      const correlativo = sequenceResult.rows[0].ultimo_numero;

      const closeResult = await client.query(
        `UPDATE ordenes
         SET estado = 'pagada', correlativo = $1, fecha_correlativo = $2,
             fecha_cierre = now()
         WHERE id = $3
         RETURNING id, mesa_id, estado, correlativo, fecha_correlativo,
                   fecha_cierre, total`,
        [correlativo, fecha, orderId],
      );
      await client.query(
        "UPDATE mesas SET estado = 'libre' WHERE id = $1",
        [order.mesa_id],
      );
      closure = closeResult.rows[0];
    }

    return {
      pago: paymentResult.rows[0],
      total: order.total,
      total_pagado: comparison.nuevo_total_pagado,
      saldo: comparison.saldo,
      orden_cerrada: closure,
    };
  });

  if (result.orden_cerrada) {
    const io = req.app.get('io');
    emitTo(io, 'tablet', 'orden_cerrada', result.orden_cerrada);
    emitTo(io, 'kds', 'orden_cerrada', result.orden_cerrada);
  }
  res.status(201).json(result);
});
