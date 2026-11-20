import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://unused:unused@localhost:5432/unused';
const { formatKitchenTicket, sendKitchenTicket } = await import('../src/services/kitchen-printer.js');

const sampleTicket = {
  orden_id: 12,
  mesa_numero: 4,
  nueva_ronda: true,
  enviado_at: '2026-11-20T12:00:00.000Z',
  items: [{ cantidad: 2, producto_nombre: 'Café', notas: 'Sin azúcar',
    modificadores: [{ nombre: 'Leche extra' }] }],
};

test('ticket de ronda adicional contiene solo los items nuevos y sus indicaciones', () => {
  const output = formatKitchenTicket(sampleTicket).toString('ascii');

  assert.match(output, /Mesa 4  Orden #12/);
  assert.match(output, /NUEVA RONDA/);
  assert.match(output, /2 x Cafe/);
  assert.match(output, /\+ Leche extra/);
  assert.match(output, /Nota: Sin azucar/);
  assert.ok(!output.includes('Hamburguesa'));
});

test('envía el ticket ESC/POS a una impresora TCP simulada', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const received = new Promise((resolve) => {
    server.once('connection', (socket) => {
      const chunks = [];
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });

  try {
    await sendKitchenTicket(sampleTicket, { host: '127.0.0.1', port: server.address().port });
    assert.deepEqual(await received, formatKitchenTicket(sampleTicket));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
