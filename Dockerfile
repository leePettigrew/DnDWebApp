# Frontend (Next.js) image. Build context is the REPO ROOT.
#   docker build -t dragons-ledger-web \
#     --build-arg NEXT_PUBLIC_MULTIPLAYER_WS_URL=wss://api.zovxonline.com .
# Or let the root docker-compose.yml do it for you.

# --- deps: install node_modules (cached unless lockfile changes) ------------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: compile the standalone server bundle --------------------------
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time, so the backend URL the client
# talks to is fixed here. Change it => rebuild this image.
ARG NEXT_PUBLIC_MULTIPLAYER_WS_URL
ENV NEXT_PUBLIC_MULTIPLAYER_WS_URL=${NEXT_PUBLIC_MULTIPLAYER_WS_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: minimal runtime -----------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
