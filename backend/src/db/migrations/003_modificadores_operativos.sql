ALTER TABLE modificadores
  ADD COLUMN activo BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX modificadores_producto_activo_idx
  ON modificadores (producto_id, activo);

CREATE TABLE item_modificadores (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items_orden(id) ON DELETE CASCADE,
  modificador_id INTEGER NOT NULL REFERENCES modificadores(id),
  nombre VARCHAR(120) NOT NULL,
  precio_extra NUMERIC(10, 2) NOT NULL CHECK (precio_extra >= 0),
  UNIQUE (item_id, modificador_id)
);

CREATE INDEX item_modificadores_item_idx ON item_modificadores (item_id);
