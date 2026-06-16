# Build context is the REPO ROOT (so the shared/ folder is available).
# Build from the repo root:  docker build -f server/Dockerfile -t dragons-ledger-server .
# Or just use server/docker-compose.yml, which sets the context for you.
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app/server

# Install dependencies first for better layer caching. tsx is the runtime
# (no compile step, no native modules — node:sqlite is built in).
COPY server/package.json server/package-lock.json ./
RUN npm ci && npm cache clean --force

# App source + the shared single source of truth (imported via ../../shared).
COPY server/tsconfig.json ./
COPY server/src ./src
COPY shared /app/shared

# Persistent data directory (mount a volume here in compose).
RUN mkdir -p /app/server/data && chown -R node:node /app
USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
