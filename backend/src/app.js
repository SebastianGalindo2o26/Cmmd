import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pool } from './db/connection.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { categoriasRouter } from './routes/categorias.js';
import { mesasRouter } from './routes/mesas.js';
import { ordenesRouter } from './routes/ordenes.js';
import { productosRouter } from './routes/productos.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ estado: 'ok' });
});

app.use('/api/categorias', categoriasRouter);
app.use('/api/productos', productosRouter);
app.use('/api/mesas', mesasRouter);
app.use('/api/ordenes', ordenesRouter);

app.use(notFoundHandler);
app.use(errorHandler);
