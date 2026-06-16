# Dragon's Ledger — Realtime Server (self-hosted)

A standalone Node + TypeScript WebSocket backend that adds real-time
multiplayer, accounts, and per-campaign persistence to Dragon's Ledger.

- **Raw `ws`** (no web framework) + a tiny built-in HTTP server for auth.
- **`node:sqlite`** for storage — file-based, **zero native modules**, nothing
  to compile. The whole persistence layer sits behind a repository abstraction
  ([`src/repositories.ts`](src/repositories.ts)) so it can be swapped for
  Postgres later without touching app logic.
- **Accounts** with bcrypt-hashed passwords and signed **JWT** tokens.
- All permissions enforced **server-side** (the client is never trusted).

It runs independently of the Next.js frontend and persists everything, so a
restart never loses accounts or campaigns.

---

## 1. Configure

```bash
cd server
cp .env.example .env
# Generate a strong secret and put it in .env as AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AUTH_SECRET` | **yes (prod)** | insecure dev value | Signs JWT tokens. Anyone who knows it can forge logins. |
| `PORT` | no | `8787` | Port the server listens on (behind your proxy/tunnel). |
| `DB_PATH` | no | `./data/dragons-ledger.sqlite` | SQLite file. Keep on persistent storage. |
| `CORS_ORIGIN` | no | `*` | Allowed origin(s) for the auth endpoints, comma-separated. Set to your frontend origin in production. |

The SQLite database, `.env`, and `server/data/` are **git-ignored** — never
commit them. Back up by copying the `.sqlite` file.

---

## 2. Run

### Option A — Docker (recommended)

```bash
cd server
docker compose up -d --build
# logs:    docker compose logs -f
# stop:    docker compose down
```

The DB persists in `server/data/` (a mounted volume), so containers can be
rebuilt without data loss.

### Option B — Node directly (Node 24+)

```bash
cd server
npm install
npm start        # production (tsx)
# or: npm run dev # watch mode
```

Verify it's up: `curl http://localhost:8787/health` → `{"ok":true,...}`.

---

## 3. Point the frontend at it

In the **frontend** project root, set the WebSocket URL (git-ignored
`.env.local`):

```bash
# .env.local  (frontend)
NEXT_PUBLIC_MULTIPLAYER_WS_URL=ws://localhost:8787      # local dev
# production:
# NEXT_PUBLIC_MULTIPLAYER_WS_URL=wss://your-server-host
```

Restart `npm run dev`. The app now shows a login → campaign-select flow. With
the variable **unset**, the app stays in Phase-1 local/solo mode. If the server
is unreachable, the app falls back to solo automatically.

> The frontend derives the auth HTTP base from this URL (`ws→http`, `wss→https`,
> same host), so both the WebSocket and `/auth/*` must be reachable at that host.

---

## 4. Exposing it securely

Browsers require **`wss://` (TLS)** whenever the site is served over HTTPS
(mixing `https://` page + `ws://` socket is blocked). So you need TLS in front of
the server. Two good options for a home machine:

### (a) Reverse proxy + TLS

Put the server behind a proxy that terminates TLS and forwards the WebSocket
upgrade. Point a hostname (e.g. `ledger-api.example.com`) at your machine.

**Caddy** (easiest — automatic Let's Encrypt, handles WS out of the box):

```caddyfile
ledger-api.example.com {
    reverse_proxy localhost:8787
}
```

**nginx** (must pass the `Upgrade`/`Connection` headers):

```nginx
server {
    server_name ledger-api.example.com;
    listen 443 ssl;            # certs via certbot/Let's Encrypt
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;   # keep long-lived sockets alive
    }
}
```

Then set `NEXT_PUBLIC_MULTIPLAYER_WS_URL=wss://ledger-api.example.com` and
`CORS_ORIGIN=https://your-frontend-origin` in `server/.env`.

### (b) A tunnel (no port-forwarding, no static IP)

**Cloudflare Tunnel** (free; gives you an HTTPS hostname, supports WebSockets):

```bash
cloudflared tunnel --url http://localhost:8787      # quick ephemeral URL
# or a named tunnel mapped to a hostname you own (recommended, stable):
#   cloudflared tunnel create ledger
#   # route ledger-api.example.com -> http://localhost:8787 in config.yml
```

Use the tunnel's `https` hostname as `wss://…` for the frontend.

**Tailscale** (private — only devices on your tailnet can reach it):

```bash
tailscale serve https / http://localhost:8787
# gives you https://<machine>.<tailnet>.ts.net  (valid TLS, WS supported)
```

Set `NEXT_PUBLIC_MULTIPLAYER_WS_URL=wss://<machine>.<tailnet>.ts.net`. Great for
a private group where everyone installs Tailscale; not reachable by the public
internet, which is a feature.

---

## 5. Home-server tradeoffs (the honest version)

- **Uptime is on you.** The machine must stay on and awake for others to play.
  Laptops sleeping, reboots, and power cuts all drop the game. A small
  always-on box (mini PC / Pi) is ideal.
- **TLS is non-negotiable for remote play.** A browser on `https://…` cannot
  open a plain `ws://`. Use one of the options above — none of them require you
  to hand-roll certificates except bare nginx.
- **Dynamic home IP.** If you port-forward directly, your IP can change — use
  DDNS, or sidestep it entirely with a tunnel/Tailscale.
- **Security.** Set a strong `AUTH_SECRET`, keep the box patched, and prefer a
  tunnel or Tailscale over opening a port to the whole internet. Passwords are
  bcrypt-hashed; tokens are signed and validated on every privileged action.
- **Backups.** Everything lives in one SQLite file (`DB_PATH`). Copy it
  periodically (it's safe to copy while running thanks to WAL; for a perfectly
  consistent copy, stop the server first).
- **Scale.** This is built for a private group (a handful of tables). It holds
  authoritative state in one process with last-write-wins — simple and robust at
  that size, not a horizontally-scaled service.

---

## Architecture quick map

| File | Responsibility |
|------|----------------|
| `src/index.ts` | HTTP (auth + health) + WS upgrade on one port |
| `src/config.ts` | env loading + config |
| `src/auth.ts` / `src/http.ts` | bcrypt + JWT, register/login endpoints |
| `src/db.ts` | open `node:sqlite`, apply schema |
| `src/repositories.ts` | storage interfaces (swap-for-Postgres seam) |
| `src/sqlite-repositories.ts` | SQLite implementation |
| `src/validation.ts` | zod schemas for every inbound message |
| `src/rooms.ts` | per-campaign socket rooms + presence |
| `src/handlers.ts` | sessions, permissions, dice authority, broadcasts |
| `../shared/*` | protocol + domain types shared with the frontend |
