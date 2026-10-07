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
exec node /app/server.js
