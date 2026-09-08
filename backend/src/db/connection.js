import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// PostgreSQL DATE representa un día civil, no un instante UTC. Mantenerlo como
// texto evita que la serialización JSON cambie el día según la zona horaria.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  console.error('Error inesperado en el pool de PostgreSQL', error);
});

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
