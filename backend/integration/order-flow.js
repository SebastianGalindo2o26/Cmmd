import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { pool } from '../src/db/connection.js';

if (process.env.ALLOW_INTEGRATION_DATA !== 'true') {
  throw new Error('Define ALLOW_INTEGRATION_DATA=true; esta prueba crea y elimina datos');
}

const apiUrl = process.env.API_URL ?? 'http://localhost:3000/api';
const socketUrl = process.env.SOCKET_URL ?? 'http://localhost:3000';
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const created = { userId: null, categoryId: null, productId: null, tableIds: [], orderIds: [] };

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function expectStatus(status, action) {
  await assert.rejects(action, (error) => error.status === status);
}

function waitForEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`No se recibió el evento ${event}`));
    }, 5_000);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function createTable(number) {
  const table = await request('/mesas', {
    method: 'POST',
    body: JSON.stringify({ numero: number }),
  });
  created.tableIds.push(table.id);
  return table;
}

async function createReadyOrder(tableId, quantity, openFromTable = false) {
  const order = await request(openFromTable ? `/mesas/${tableId}/abrir` : '/ordenes', {
    method: 'POST',
    body: JSON.stringify(openFromTable
      ? { usuario_id: created.userId }
      : { mesa_id: tableId, usuario_id: created.userId }),
  });
  created.orderIds.push(order.id);
  const added = await request(`/ordenes/${order.id}/items`, {
    method: 'POST',
    body: JSON.stringify({
      items: [{ producto_id: created.productId, cantidad: quantity, notas: null }],
    }),
  });
  return { ...order, total: added.total, item: added.items[0] };
}

async function cleanup() {
  try {
    if (created.orderIds.length) {
      await pool.query('DELETE FROM pagos WHERE orden_id = ANY($1::integer[])', [created.orderIds]);
      await pool.query('DELETE FROM items_orden WHERE orden_id = ANY($1::integer[])', [created.orderIds]);
      await pool.query('DELETE FROM ordenes WHERE id = ANY($1::integer[])', [created.orderIds]);
    }
    if (created.productId) await pool.query('DELETE FROM productos WHERE id = $1', [created.productId]);
    if (created.categoryId) await pool.query('DELETE FROM categorias WHERE id = $1', [created.categoryId]);
    if (created.tableIds.length) await pool.query('DELETE FROM mesas WHERE id = ANY($1::integer[])', [created.tableIds]);
    if (created.userId) await pool.query('DELETE FROM usuarios WHERE id = $1', [created.userId]);
  } finally {
    await pool.end();
  }
}

const kds = io(socketUrl, { query: { tipo: 'kds' } });
const tablet = io(socketUrl, { query: { tipo: 'tablet' } });

try {
  await Promise.all([
    new Promise((resolve, reject) => kds.once('connect', resolve).once('connect_error', reject)),
    new Promise((resolve, reject) => tablet.once('connect', resolve).once('connect_error', reject)),
  ]);

  const health = await request('/health');
  assert.equal(health.estado, 'ok');

  const userResult = await pool.query(
    `INSERT INTO usuarios (nombre, usuario, password_hash, rol)
     VALUES ($1, $2, 'AUTH_PENDING', 'mesero') RETURNING id`,
    ['Mesero integración', `mesero-${suffix}`],
  );
  created.userId = userResult.rows[0].id;

  const category = await request('/categorias', {
    method: 'POST',
    body: JSON.stringify({ nombre: `Categoría ${suffix}`, orden: 1 }),
  });
  created.categoryId = category.id;

  const product = await request('/productos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: `Producto ${suffix}`,
      precio: '10.00',
      categoria_id: category.id,
    }),
  });
  created.productId = product.id;

  const tableBase = 100_000 + Math.floor(Math.random() * 800_000);
  const [tableOne, tableTwo] = await Promise.all([
    createTable(tableBase),
    createTable(tableBase + 1),
  ]);
  const [orderOne, orderTwo] = await Promise.all([
    createReadyOrder(tableOne.id, 3),
    createReadyOrder(tableTwo.id, 2, true),
  ]);

  await expectStatus(409, () => request('/ordenes', {
    method: 'POST',
    body: JSON.stringify({ mesa_id: tableOne.id, usuario_id: created.userId }),
  }));

  const firstKitchenEvent = waitForEvent(kds, 'nueva_orden', (payload) => payload.id === orderOne.id);
  await request(`/ordenes/${orderOne.id}/enviar-cocina`, { method: 'POST' });
  assert.equal((await firstKitchenEvent).items.length, 1);
  await expectStatus(409, () => request(`/ordenes/${orderOne.id}/enviar-cocina`, { method: 'POST' }));

  const extra = await request(`/ordenes/${orderOne.id}/items`, {
    method: 'POST',
    body: JSON.stringify({ items: [{ producto_id: product.id, cantidad: 1, notas: 'Ronda 2' }] }),
  });
  const updatedKitchenEvent = waitForEvent(kds, 'orden_actualizada', (payload) => payload.id === orderOne.id);
  const updatedTabletEvent = waitForEvent(tablet, 'orden_actualizada', (payload) => payload.id === orderOne.id);
  await request(`/ordenes/${orderOne.id}/enviar-cocina`, { method: 'POST' });
  assert.equal((await updatedKitchenEvent).items[0].id, extra.items[0].id);
  assert.equal((await updatedTabletEvent).items[0].id, extra.items[0].id);

  await expectStatus(409, () => request(`/ordenes/${orderOne.id}/items/${orderOne.item.id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'listo' }),
  }));

  for (const estado of ['preparando', 'listo', 'entregado']) {
    const stateEvent = waitForEvent(
      tablet,
      'item_estado_cambiado',
      (payload) => payload.item_id === orderOne.item.id && payload.nuevo_estado === estado,
    );
    await request(`/ordenes/${orderOne.id}/items/${orderOne.item.id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    });
    await stateEvent;
  }
  const repeatedState = await request(`/ordenes/${orderOne.id}/items/${orderOne.item.id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'entregado' }),
  });
  assert.equal(repeatedState.cambio, false);

  const partial = await request(`/ordenes/${orderOne.id}/pagos`, {
    method: 'POST',
    body: JSON.stringify({ metodo: 'efectivo', monto: '10.00' }),
  });
  assert.equal(partial.saldo, '30.00');
  assert.equal(partial.orden_cerrada, null);
  await expectStatus(409, () => request(`/ordenes/${orderOne.id}/pagos`, {
    method: 'POST',
    body: JSON.stringify({ metodo: 'tarjeta', monto: '30.01' }),
  }));

  const orderTwoKitchenEvent = waitForEvent(kds, 'nueva_orden', (payload) => payload.id === orderTwo.id);
  await request(`/ordenes/${orderTwo.id}/enviar-cocina`, { method: 'POST' });
  await orderTwoKitchenEvent;

  const kitchenOrders = await request('/ordenes/cocina/activas');
  assert.equal(kitchenOrders.find((order) => order.id === orderOne.id).items.length, 2);
  assert.equal(kitchenOrders.find((order) => order.id === orderTwo.id).items.length, 1);

  const closeOneEvent = waitForEvent(tablet, 'orden_cerrada', (payload) => payload.id === orderOne.id);
  const closeTwoEvent = waitForEvent(kds, 'orden_cerrada', (payload) => payload.id === orderTwo.id);
  const [paymentOne, paymentTwo] = await Promise.all([
    request(`/ordenes/${orderOne.id}/pagos`, {
      method: 'POST',
      body: JSON.stringify({ metodo: 'tarjeta', monto: '30.00' }),
    }),
    request(`/ordenes/${orderTwo.id}/pagos`, {
      method: 'POST',
      body: JSON.stringify({ metodo: 'efectivo', monto: '20.00' }),
    }),
  ]);
  await Promise.all([closeOneEvent, closeTwoEvent]);

  const closures = [paymentOne.orden_cerrada, paymentTwo.orden_cerrada];
  assert.equal(new Set(closures.map((order) => order.correlativo)).size, 2);
  assert.equal(Math.abs(closures[0].correlativo - closures[1].correlativo), 1);
  assert.equal(closures[0].fecha_correlativo, closures[1].fecha_correlativo);

  const finalOrder = await request(`/ordenes/${orderOne.id}`);
  assert.equal(finalOrder.estado, 'pagada');
  assert.equal(finalOrder.total, '40.00');
  assert.equal(finalOrder.total_pagado, '40.00');
  assert.equal(finalOrder.saldo, '0.00');
  assert.equal(finalOrder.pagos.length, 2);

  const tables = await request('/mesas');
  assert.equal(tables.find((table) => table.id === tableOne.id).estado, 'libre');
  assert.equal(tables.find((table) => table.id === tableTwo.id).estado, 'libre');

  const history = await request(`/ordenes/dia/${closures[0].fecha_correlativo}`);
  assert.ok(history.some((order) => order.id === orderOne.id));
  assert.ok(history.some((order) => order.id === orderTwo.id));

  console.log('Flujo integral aprobado:', {
    ordenes: created.orderIds,
    correlativos: closures.map((order) => order.correlativo),
    eventos: ['nueva_orden', 'orden_actualizada', 'item_estado_cambiado', 'orden_cerrada'],
  });
} finally {
  kds.close();
  tablet.close();
  await cleanup();
}
