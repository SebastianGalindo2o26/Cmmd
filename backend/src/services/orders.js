import { withTransaction } from '../db/connection.js';
import { HttpError, notFound } from '../http.js';

export async function createOrder({ mesaId, usuarioId }) {
  return withTransaction(async (client) => {
    const mesaResult = await client.query(
      'SELECT id, numero, estado FROM mesas WHERE id = $1 FOR UPDATE',
      [mesaId],
    );
    const mesa = mesaResult.rows[0];
    if (!mesa) throw notFound('Mesa');
    if (mesa.estado !== 'libre') {
      throw new HttpError(409, 'La mesa ya está ocupada');
    }

    const usuarioResult = await client.query(
      `SELECT id, nombre, rol
       FROM usuarios
       WHERE id = $1 AND activo = true`,
      [usuarioId],
    );
    const usuario = usuarioResult.rows[0];
    if (!usuario) throw notFound('Usuario activo');
    if (!['mesero', 'cajero', 'admin'].includes(usuario.rol)) {
      throw new HttpError(409, 'El usuario no puede abrir órdenes');
    }

    const orderResult = await client.query(
      `INSERT INTO ordenes (mesa_id, usuario_id)
       VALUES ($1, $2)
       RETURNING id, mesa_id, usuario_id, correlativo, fecha_correlativo,
                 estado, fecha_apertura, fecha_cierre, total`,
      [mesaId, usuarioId],
    );

    await client.query(
      "UPDATE mesas SET estado = 'ocupada' WHERE id = $1",
      [mesaId],
    );

    return {
      ...orderResult.rows[0],
      mesa_numero: mesa.numero,
      usuario_nombre: usuario.nombre,
      items: [],
      pagos: [],
      total_pagado: '0.00',
      saldo: '0.00',
    };
  });
}

export async function fetchOrder(db, orderId) {
  const orderResult = await db.query(
    `SELECT o.id, o.mesa_id, m.numero AS mesa_numero,
            o.usuario_id, u.nombre AS usuario_nombre,
            o.correlativo, o.fecha_correlativo, o.estado,
            o.fecha_apertura, o.fecha_cierre, o.total,
            COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS total_pagado,
            o.total - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS saldo
     FROM ordenes o
     JOIN mesas m ON m.id = o.mesa_id
     JOIN usuarios u ON u.id = o.usuario_id
     WHERE o.id = $1`,
    [orderId],
  );
  if (!orderResult.rows[0]) throw notFound('Orden');

  const itemsResult = await db.query(
    `SELECT i.id, i.producto_id, p.nombre AS producto_nombre,
            i.cantidad, i.notas, i.precio_unitario,
            (i.cantidad * i.precio_unitario)::numeric(10,2) AS subtotal,
            i.estado, i.enviado_cocina_at
     FROM items_orden i
     JOIN productos p ON p.id = i.producto_id
     WHERE i.orden_id = $1
     ORDER BY i.id`,
    [orderId],
  );
  const paymentsResult = await db.query(
    `SELECT id, metodo, monto, creado_at
     FROM pagos
     WHERE orden_id = $1
     ORDER BY id`,
    [orderId],
  );

  return {
    ...orderResult.rows[0],
    items: itemsResult.rows,
    pagos: paymentsResult.rows,
  };
}
