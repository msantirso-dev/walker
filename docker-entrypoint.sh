#!/bin/sh
set -e
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "Aplicando migraciones…"
  /opt/prisma/node_modules/.bin/prisma migrate deploy --config /app/prisma/docker.config.mjs
fi
if [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "Cargando datos de demostración (solo si la base está vacía)…"
  node /app/prisma/seed.mjs
fi
# Docker define HOSTNAME con el nombre del contenedor y pisa el de la imagen: Next escucharía solo en esa IP
# y el healthcheck (127.0.0.1) fallaría, dejando el contenedor "unhealthy" y sin tráfico del proxy.
export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"
exec node /app/server.js
