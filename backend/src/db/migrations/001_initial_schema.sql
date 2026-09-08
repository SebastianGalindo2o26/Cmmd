CREATE TABLE categorias (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  imagen_url VARCHAR(500),
  orden INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE productos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  descripcion TEXT,
  precio NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
  imagen_url VARCHAR(500),
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modificadores (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre VARCHAR(120) NOT NULL,
  precio_extra NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (precio_extra >= 0)
);

CREATE TABLE mesas (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada'))
);

CREATE TABLE usuarios (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  usuario VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('mesero', 'cocina', 'cajero', 'admin')),
  activo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE ordenes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  correlativo INTEGER,
  fecha_correlativo DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'pagada', 'cancelada')),
  fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre TIMESTAMPTZ,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  CONSTRAINT ordenes_correlativo_completo CHECK (
    (correlativo IS NULL AND fecha_correlativo IS NULL)
    OR (correlativo IS NOT NULL AND fecha_correlativo IS NOT NULL)
  ),
  CONSTRAINT ordenes_correlativo_positivo CHECK (correlativo IS NULL OR correlativo > 0),
  UNIQUE (fecha_correlativo, correlativo)
);

CREATE UNIQUE INDEX una_orden_abierta_por_mesa
  ON ordenes (mesa_id)
  WHERE estado = 'abierta';

CREATE TABLE items_orden (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  notas TEXT,
  precio_unitario NUMERIC(10, 2) NOT NULL CHECK (precio_unitario >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado')),
  enviado_cocina_at TIMESTAMPTZ
);

CREATE TABLE pagos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta')),
  monto NUMERIC(10, 2) NOT NULL CHECK (monto > 0),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE correlativos_dia (
  fecha DATE PRIMARY KEY,
  ultimo_numero INTEGER NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);

CREATE INDEX productos_categoria_idx ON productos (categoria_id);
CREATE INDEX items_orden_orden_idx ON items_orden (orden_id);
CREATE INDEX pagos_orden_idx ON pagos (orden_id);
CREATE INDEX ordenes_fecha_apertura_idx ON ordenes (fecha_apertura);

