import { createConnection } from 'node:net';
import { config } from '../config.js';
import { withTransaction } from '../db/connection.js';

function printable(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

export function formatKitchenTicket(ticket) {
  const lines = [
    '*** COCINA ***',
    `Mesa ${printable(ticket.mesa_numero)}  Orden #${printable(ticket.orden_id)}`,
    ticket.nueva_ronda ? 'NUEVA RONDA' : 'PRIMER ENVIO',
    printable(new Date(ticket.enviado_at).toLocaleString('es-GT', { timeZone: config.restaurantTimezone })),
    '--------------------------------',
  ];
  for (const item of ticket.items) {
    lines.push(`${item.cantidad} x ${printable(item.producto_nombre)}`);
    for (const modifier of item.modificadores ?? []) lines.push(`  + ${printable(modifier.nombre)}`);
    if (item.notas) lines.push(`  Nota: ${printable(item.notas)}`);
  }
  lines.push('--------------------------------', '', '', '');
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from(lines.join('\n'), 'ascii'),
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
}

export function sendKitchenTicket(ticket, { host = config.kitchenPrinterHost, port = config.kitchenPrinterPort } = {}) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let finished = false;
    function done(error) {
      if (finished) return;
      finished = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    }
    socket.setTimeout(5000, () => done(new Error('Tiempo de espera agotado')));
    socket.once('error', done);
    socket.once('connect', () => socket.end(formatKitchenTicket(ticket), () => done()));
  });
}

export async function processKitchenPrintJobs() {
  if (!config.kitchenPrinterHost) return;
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, ticket FROM kitchen_print_jobs
       WHERE status = 'pending' AND (attempts = 0 OR created_at + attempts * interval '10 seconds' <= now())
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const job = rows[0];
    if (!job) return;
    try {
      await sendKitchenTicket(job.ticket);
      await client.query(
        `UPDATE kitchen_print_jobs SET status = 'printed', printed_at = now(), attempts = attempts + 1,
         last_error = NULL WHERE id = $1`, [job.id],
      );
    } catch (error) {
      await client.query(
        `UPDATE kitchen_print_jobs SET attempts = attempts + 1, last_error = $2 WHERE id = $1`,
        [job.id, String(error.message).slice(0, 500)],
      );
      console.error(`Impresion de cocina pendiente (ticket ${job.id}):`, error.message);
    }
  });
}

export function startKitchenPrintWorker() {
  if (!config.kitchenPrinterHost) return () => {};
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await processKitchenPrintJobs(); }
    catch (error) { console.error('Error del trabajador de impresion:', error); }
    finally { running = false; }
  }, 2000);
  timer.unref();
  return () => clearInterval(timer);
}
