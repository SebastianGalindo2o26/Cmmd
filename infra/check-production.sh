#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
COMPOSE_FILE="$PROJECT_DIR/infra/docker-compose.yml"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  node -e "fetch('http://localhost:3000/api/health').then(async r => { const body = await r.text(); console.log(body); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
