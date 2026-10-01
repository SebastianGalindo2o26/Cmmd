CREATE TABLE idempotency_keys (
  clave VARCHAR(120) PRIMARY KEY,
  endpoint VARCHAR(180) NOT NULL,
  respuesta JSONB NOT NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idempotency_keys_creado_idx ON idempotency_keys (creado_at);
