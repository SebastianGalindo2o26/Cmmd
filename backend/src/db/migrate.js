import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './connection.js';

const migrationsDirectory = fileURLToPath(new URL('./migrations', import.meta.url));

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [9032026]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nombre TEXT PRIMARY KEY,
        aplicado_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const exists = await client.query(
        'SELECT 1 FROM schema_migrations WHERE nombre = $1',
        [file],
      );

      if (exists.rowCount > 0) continue;

      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (nombre) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`Migración aplicada: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [9032026]);
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('No se pudieron aplicar las migraciones', error);
  process.exitCode = 1;
});

