# Hosting Dragon's Ledger on Unraid (with Cloudflare + Nginx Proxy Manager)

This stack is two containers:

| Container | What it is | Port | Public hostname (example) |
|-----------|------------|------|---------------------------|
| `web`     | Next.js frontend | 3000 | `ledger.zovxonline.com` |
| `server`  | Realtime + auth backend (WebSocket + SQLite) | 8787 | `api.zovxonline.com` |

The browser loads `web`, then connects straight to `server` for live data and
logins. The backend URL is **compiled into the web image at build time**
(`NEXT_PUBLIC_MULTIPLAYER_WS_URL`), so the frontend and backend each get their
own hostname. The SQLite database lives on a host folder so it survives updates.

> **Why a domain + HTTPS?** Logins send a password and the realtime link is a
> WebSocket. Over the internet that must be `https`/`wss`. On a trusted LAN/VPN
> you can skip TLS (see [LAN-only](#appendix-lanvpn-only)).

---

## 1. Put the code on Unraid

Open a terminal on Unraid (or use the Community Apps **Compose Manager** plugin)
and clone the repo to a share:

```bash
mkdir -p /mnt/user/appdata/dragons-ledger
cd /mnt/user/appdata/dragons-ledger
git clone https://github.com/leePettigrew/DnDWebApp.git app
cd app
```

## 2. Configure secrets and URLs

```bash
cp .env.deploy.example .env
nano .env
```

Set, at minimum:

```ini
# A long random string — generate with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
AUTH_SECRET=<paste a long random hex string>

NEXT_PUBLIC_MULTIPLAYER_WS_URL=wss://api.zovxonline.com
CORS_ORIGIN=https://ledger.zovxonline.com

DATA_DIR=/mnt/user/appdata/dragons-ledger/data
WEB_PORT=3000
SERVER_PORT=8787
```

`.env` is git-ignored — never commit it.

## 3. Build and start the stack

```bash
docker compose up -d --build
```

This builds both images and starts them. Check they're healthy:

```bash
docker compose ps
curl -s http://localhost:8787/health      # -> {"ok":true} or similar
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000   # -> 200
```

At this point both are reachable on the LAN at `http://<unraid-ip>:3000` and
`:8787`. Now expose them with your domain.

## 4. Cloudflare DNS

In the Cloudflare dashboard for **zovxonline.com**, add two records pointing at
your home/public IP (or your tunnel — see Option B):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `ledger` | your public IP | Proxied (orange) |
| A | `api` | your public IP | Proxied (orange) |

Cloudflare proxies WebSockets fine. Set **SSL/TLS mode → Full (strict)** once NPM
has a valid certificate (next step).

## 5. Option A — Nginx Proxy Manager (port-forward)

Forward router ports **80 → Unraid:80** and **443 → Unraid:443** to your NPM
container. Then in NPM add **two Proxy Hosts**:

**Host 1 — the app**
- Domain: `ledger.zovxonline.com`
- Forward to: `http` → `<unraid-ip>` → `3000`
- **Websockets Support: ON**
- Block Common Exploits: ON
- SSL tab: request a Let's Encrypt cert, Force SSL, HTTP/2.

**Host 2 — the backend**
- Domain: `api.zovxonline.com`
- Forward to: `http` → `<unraid-ip>` → `8787`
- **Websockets Support: ON**  ← required, this is the live link
- SSL tab: Let's Encrypt cert, Force SSL.

> **Certs behind Cloudflare's orange cloud:** the HTTP-01 challenge can fail when
> proxied. Easiest fix — in NPM's SSL step choose **"Use a DNS Challenge" →
> Cloudflare** and paste a Cloudflare API token (Zone:DNS:Edit for the zone).
> That issues certs without opening the challenge to the internet.

Now browse to **https://ledger.zovxonline.com**, register the first account
(it becomes a campaign's DM), and share the join code with your players.

## 6. Option B — Cloudflare Tunnel (no port-forwarding)

If you can't/won't forward ports (CGNAT, ISP blocks 80/443), use a tunnel
instead of Option A — NPM isn't required.

1. Install the **cloudflared** container from Community Apps (or `docker run`),
   log in, and create a tunnel.
2. Add two public hostnames on the tunnel:
   - `ledger.zovxonline.com` → `http://<unraid-ip>:3000`
   - `api.zovxonline.com` → `http://<unraid-ip>:8787`
3. Cloudflare creates the DNS records and terminates TLS for you; WebSockets are
   supported automatically.

Values in `.env` are the same as Option A (`wss://api.zovxonline.com`).

---

## Updating

```bash
cd /mnt/user/appdata/dragons-ledger/app
git pull
docker compose up -d --build
```

The database in `DATA_DIR` is untouched by rebuilds.

## Backups

Back up the single SQLite file (and `.env`):

```
/mnt/user/appdata/dragons-ledger/data/dragons-ledger.sqlite
```

Add that folder to an Unraid **Appdata Backup** schedule.

## Troubleshooting

- **App loads but stays "offline" / can't log in** — the browser can't reach the
  backend. Check `https://api.zovxonline.com/health` returns OK, that
  **Websockets Support** is ON for the `api` host, and that
  `NEXT_PUBLIC_MULTIPLAYER_WS_URL` matches the api hostname. Changing that value
  requires `docker compose up -d --build` (it's baked into the web image).
- **CORS error on login** — set `CORS_ORIGIN=https://ledger.zovxonline.com` in
  `.env` and `docker compose up -d` to restart `server`.
- **"AUTH_SECRET is not set" warning in logs** — set a real `AUTH_SECRET`; never
  run exposed with the insecure default.
- **502 from NPM** — the container isn't reachable; confirm `docker compose ps`
  shows both healthy and the forward IP/port are right.

---

## Appendix: LAN/VPN only

No domain, no TLS. In `.env` set:

```ini
NEXT_PUBLIC_MULTIPLAYER_WS_URL=ws://<unraid-ip>:8787
CORS_ORIGIN=*
```

`docker compose up -d --build`, then use the app at `http://<unraid-ip>:3000`.
Reach it remotely over WireGuard/Tailscale rather than exposing it raw.
