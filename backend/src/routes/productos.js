import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/connection.js';
import { HttpError, notFound, parseId, validate } from '../http.js';

export const productosRouter = Router();

const productoSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
  descripcion: z.string().trim().nullable().optional(),
  precio: z.coerce.number().min(0).max(99_999_999.99),
  imagen_url: z.string().trim().max(500).nullable().optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
}).strict();

const selectProductos = `
  SELECT p.id, p.nombre, p.descripcion, p.precio, p.imagen_url,
         p.categoria_id, p.activo, c.nombre AS categoria_nombre
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id`;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return callback(new HttpError(400, 'La imagen debe ser JPG, PNG, WebP o GIF'));
    }
    callback(null, true);
  },
});

function receiveImage(req, res, next) {
  imageUpload.single('imagen')(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen no puede superar 5 MB'
        : 'La imagen debe ser JPG, PNG, WebP o GIF';
      return next(new HttpError(400, message));
    }
    next();
  });
}

productosRouter.get('/', async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.activo !== undefined) {
    if (!['true', 'false'].includes(req.query.activo)) {
      return res.status(400).json({ error: 'activo debe ser true o false' });
    }
    params.push(req.query.activo === 'true');
    conditions.push(`p.activo = $${params.length}`);
  }

  if (req.query.categoria_id !== undefined) {
    params.push(parseId(req.query.categoria_id, 'categoria_id'));
    conditions.push(`p.categoria_id = $${params.length}`);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`${selectProductos}${where} ORDER BY p.nombre`, params);
  res.json(rows);
});

productosRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await pool.query(`${selectProductos} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Producto');
  res.json(rows[0]);
});

productosRouter.post('/', async (req, res) => {
  const data = validate(productoSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO productos
        (nombre, descripcion, precio, imagen_url, categoria_id, activo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
      [
        data.nombre,
        data.descripcion ?? null,
        data.precio,
        data.imagen_url ?? null,
        data.categoria_id ?? null,
        data.activo ?? true,
      ],
    );
    return result.rows[0];
  });
  res.status(201).json(row);
});

productosRouter.post('/:id/imagen', receiveImage, async (req, res) => {
  const id = parseId(req.params.id, 'producto_id');
  if (!req.file) throw new HttpError(400, 'Debes enviar un archivo en el campo imagen');

  const existingResult = await pool.query(
    'SELECT id, imagen_url FROM productos WHERE id = $1',
    [id],
  );
  const existing = existingResult.rows[0];
  if (!existing) throw notFound('Producto');

  const filename = `producto-${id}-${randomUUID()}.webp`;
  const absolutePath = path.join(config.uploadDir, filename);
  await mkdir(config.uploadDir, { recursive: true });
  await sharp(req.file.buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(absolutePath);

  try {
    const row = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE productos SET imagen_url = $1
         WHERE id = $2
         RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
        [`/uploads/${filename}`, id],
      );
      if (result.rowCount === 0) throw notFound('Producto');
      return result.rows[0];
    });

    if (existing.imagen_url?.startsWith('/uploads/')) {
      await unlink(path.join(config.uploadDir, path.basename(existing.imagen_url))).catch(() => {});
    }
    res.json(row);
  } catch (error) {
    await unlink(absolutePath).catch(() => {});
    throw error;
  }
});

productosRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(productoSchema, req.body);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE productos
       SET nombre = $1, descripcion = $2, precio = $3, imagen_url = $4,
           categoria_id = $5, activo = $6
       WHERE id = $7
       RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
      [
        data.nombre,
        data.descripcion ?? null,
        data.precio,
        data.imagen_url ?? null,
        data.categoria_id ?? null,
        data.activo ?? true,
        id,
      ],
    );
    if (result.rowCount === 0) throw notFound('Producto');
    return result.rows[0];
  });
  res.json(row);
});

productosRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const row = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE productos SET activo = false WHERE id = $1
       RETURNING id, nombre, descripcion, precio, imagen_url, categoria_id, activo`,
      [id],
    );
    if (result.rowCount === 0) throw notFound('Producto');
    return result.rows[0];
  });
  res.json(row);
});
