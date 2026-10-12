#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
COMPOSE_FILE="$PROJECT_DIR/infra/docker-compose.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Falta el archivo de producción: $ENV_FILE" >&2
  echo "Copia .env.production.example a .env y cambia todos los secretos." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose no está disponible para este usuario." >&2
  exit 1
fi

echo "Levantando POS desde $PROJECT_DIR"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "Comprobando salud del backend"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  node -e "fetch('http://localhost:3000/api/health').then(async r => { if (!r.ok) process.exit(1); console.log(await r.text()); }).catch(() => process.exit(1))"

echo "Despliegue listo. No se ejecuta seed de desarrollo en producción."
