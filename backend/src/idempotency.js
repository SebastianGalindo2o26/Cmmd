import { HttpError } from './http.js';

export function readIdempotencyKey(req) {
  const key = req.get('Idempotency-Key');
  if (!key) return null;
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    throw new HttpError(400, 'Idempotency-Key debe tener entre 8 y 120 caracteres seguros');
  }
  return key;
}

export async function findIdempotentResponse(client, key, endpoint) {
  if (!key) return null;
  const result = await client.query(
    'SELECT endpoint, respuesta FROM idempotency_keys WHERE clave = $1 FOR UPDATE',
    [key],
  );
  const stored = result.rows[0];
  if (!stored) return null;
  if (stored.endpoint !== endpoint) {
    throw new HttpError(409, 'La clave de idempotencia ya fue usada para otra operación');
  }
  return stored.respuesta;
}

export async function saveIdempotentResponse(client, key, endpoint, response) {
  if (!key) return;
  await client.query(
    `INSERT INTO idempotency_keys (clave, endpoint, respuesta)
     VALUES ($1, $2, $3::jsonb)`,
    [key, endpoint, JSON.stringify(response)],
  );
}
