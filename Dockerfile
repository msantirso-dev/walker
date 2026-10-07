# syntax=docker/dockerfile:1.7
# Camada — imagen de producción (Next.js standalone + Prisma migrate deploy al iniciar)

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1) Dependencias
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2) Build: cliente Prisma, Next standalone y seed empaquetado
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# "prisma generate" no necesita el motor de migraciones: se evita su descarga en esta etapa
RUN printf '#!/bin/sh\nexit 1\n' > /tmp/no-engine && chmod +x /tmp/no-engine \
 && PRISMA_SCHEMA_ENGINE_BINARY=/tmp/no-engine DATABASE_URL=postgresql://build@localhost/build npx prisma generate \
 && npx next build \
 && npx esbuild prisma/seed.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/seed.mjs \
      --external:sharp --external:@prisma/client --external:pg-native \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

# 3) CLI de Prisma para "migrate deploy" (descarga su motor durante el build)
FROM base AS migrator
WORKDIR /opt/prisma
RUN npm init -y >/dev/null && npm i --no-audit --no-fund prisma@7.10.0 \
 && DATABASE_URL=postgresql://build@localhost/build npx prisma version >/dev/null \
 && ls node_modules/@prisma/engines/ | grep -q schema-engine

# 4) Runtime
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/prisma/schema.prisma /app/prisma/docker.config.mjs ./prisma/
COPY --from=builder --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=node:node /app/dist/seed.mjs ./prisma/seed.mjs
COPY --from=migrator --chown=node:node /opt/prisma /opt/prisma
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
