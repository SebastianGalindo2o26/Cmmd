CREATE TABLE kitchen_print_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id),
  ticket JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at TIMESTAMPTZ
);

CREATE INDEX kitchen_print_jobs_pending_idx
  ON kitchen_print_jobs (id) WHERE status = 'pending';
