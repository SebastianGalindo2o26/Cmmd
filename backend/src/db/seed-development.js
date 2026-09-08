import { config } from '../config.js';
import { pool, withTransaction } from './connection.js';

const sampleProducts = [
  ['Nachos de la casa', 'Entradas', '38.00'],
  ['Alitas BBQ', 'Entradas', '52.00'],
  ['Hamburguesa clásica', 'Platos', '48.00'],
  ['Pollo a la plancha', 'Platos', '62.00'],
  ['Limonada', 'Bebidas', '18.00'],
  ['Café americano', 'Bebidas', '15.00'],
  ['Pastel de chocolate', 'Postres', '28.00'],
];

async function seedDevelopment() {
  if (config.nodeEnv === 'production') {
    throw new Error('El seed de desarrollo no puede ejecutarse con NODE_ENV=production');
  }

  const result = await withTransaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol)
       VALUES ('Mesero de prueba', 'mesero_demo', 'AUTH_PENDING', 'mesero')
       ON CONFLICT (usuario) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         rol = EXCLUDED.rol,
         activo = true
       RETURNING id, nombre, usuario, rol, activo`,
    );

    const categoryIds = new Map();
    for (const [index, name] of ['Entradas', 'Platos', 'Bebidas', 'Postres'].entries()) {
      const existing = await client.query(
        'SELECT id FROM categorias WHERE nombre = $1 ORDER BY id LIMIT 1',
        [name],
      );
      const category = existing.rows[0] ?? (await client.query(
        `INSERT INTO categorias (nombre, orden)
         VALUES ($1, $2)
         RETURNING id`,
        [name, index + 1],
      )).rows[0];
      categoryIds.set(name, category.id);
    }

    for (const [name, categoryName, price] of sampleProducts) {
      const existing = await client.query(
        'SELECT id FROM productos WHERE nombre = $1 ORDER BY id LIMIT 1',
        [name],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO productos (nombre, precio, categoria_id)
           VALUES ($1, $2, $3)`,
          [name, price, categoryIds.get(categoryName)],
        );
      }
    }

    await client.query(
      `INSERT INTO mesas (numero)
       SELECT numero FROM generate_series(1, 8) AS numero
       ON CONFLICT (numero) DO NOTHING`,
    );

    return userResult.rows[0];
  });

  console.log('Datos de desarrollo disponibles:', {
    usuario: result,
    mesas: '1-8',
    categorias: ['Entradas', 'Platos', 'Bebidas', 'Postres'],
    productos: sampleProducts.length,
  });
}

seedDevelopment()
  .catch((error) => {
    console.error('No se pudieron crear los datos de desarrollo', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
