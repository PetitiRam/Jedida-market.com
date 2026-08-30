# Jedida-Market — Native Deployment (No Docker)

Docker has been removed from this repo (root `Dockerfile`, `backend/Dockerfile`,
`backend/docker/entrypoint.sh` — the latter only ever started a ClamAV daemon
that nothing in the current upload-security code path calls anymore; see
`uploadSecurity.js`). Everything now runs as native OS processes on a VPS
with `apt` access (Ubuntu/Debian assumed below).

This also means **Nixpacks-only platforms (Render/Railway free/standard
tiers) will no longer work** for the backend, because they don't give you
`apt-get` to install LibreOffice. Use a real VPS (Ubuntu 22.04/24.04
droplet/instance) or any host where you control the OS.

## 1. System packages

```bash
sudo apt-get update
sudo apt-get install -y \
  libreoffice-writer libreoffice-calc fonts-dejavu \
  postgresql redis-server nginx nodejs npm curl ca-certificates
```

`libreoffice-writer`/`-calc` provide the `soffice` binary that
`documentConversionService.js` shells out to for doc/spreadsheet → PDF
conversion. Set `SOFFICE_BIN=/usr/bin/soffice` in the backend's environment
(this was previously baked into the Docker image via `ENV`).

Use Node 20.x (match what the old `node:20-bookworm-slim` image used):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 2. Backend — systemd service

```bash
cd /opt/jedida/backend
npm ci --omit=dev
npm run migrate
```

`/etc/systemd/system/jedida-backend.service`:

```ini
[Unit]
Description=Jedida Marketplace backend
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
WorkingDirectory=/opt/jedida/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=SOFFICE_BIN=/usr/bin/soffice
EnvironmentFile=/opt/jedida/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jedida-backend
journalctl -u jedida-backend -f   # logs
```

## 3. Frontend — static build behind Nginx

```bash
cd /opt/jedida/frontend
npm ci
npm run build      # outputs frontend/dist
```

Serve `frontend/dist` as static files and reverse-proxy `/api` and
`/api/webhooks` to the backend on `:5000`. Example Nginx server block:

```nginx
server {
  listen 443 ssl http2;
  server_name jedidamarketplace.com;

  root /opt/jedida/frontend/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

## 4. Redeploys

```bash
cd /opt/jedida && git pull
cd backend && npm ci --omit=dev && npm run migrate && sudo systemctl restart jedida-backend
cd ../frontend && npm ci && npm run build
```

No image build, no registry push — just pull, install, build, restart.

## 5. Live Shopping — Go service

`services/live-go/` is a separate Go binary, not part of the Node backend.
Same Postgres database, same `JWT_ACCESS_SECRET` (reads the exact tokens
the Node backend issues — see `internal/handlers/auth_middleware.go`), plus
its own Cloudflare Stream credentials.

```bash
# Install Go 1.22+ if not already present:
# https://go.dev/doc/install

cd /opt/jedida/services/live-go
go mod tidy    # resolves and verifies dependencies — needs real network access
go build -o /opt/jedida/bin/jedida-live ./cmd/live
```

Add to `backend/.env` (or a separate `services/live-go/.env` sourced by its
own systemd unit — either works, `internal/config/config.go` reads plain
env vars either way):

```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_API_TOKEN=
CLOUDFLARE_STREAM_CUSTOMER_CODE=
LIVE_SERVICE_PORT=8081
```

`/etc/systemd/system/jedida-live.service`:

```ini
[Unit]
Description=Jedida Live Shopping (Go)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/jedida/services/live-go
ExecStart=/opt/jedida/bin/jedida-live
Restart=always
RestartSec=5
EnvironmentFile=/opt/jedida/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jedida-live
```

Add to the Nginx server block from §3, alongside the existing `/api/`
location (WebSocket upgrade headers are required for the realtime chat
endpoint):

```nginx
  location /api/live/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s; # long-lived WebSocket connections
  }
```

This makes `/api/live/*` work exactly like any other Jedida API path from
the frontend's point of view — Nginx routes it to the Go service instead
of Node, invisibly.

## 6. Go Realtime Chat Engine (`services/go-services`)

A second, independent Go binary — see `services/go-services/README.md`
for what it does and does not include. Same pattern as the Live service
above: build it, run it as its own systemd unit, proxy a path to it.

```
[Unit]
Description=Jedida Go Chat Engine
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/jedida/services/go-services
ExecStart=/opt/jedida/services/go-services/chat-engine
EnvironmentFile=/opt/jedida/backend/.env
Restart=on-failure
User=jedida

[Install]
WantedBy=multi-user.target
```

```nginx
location /ws/chat {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

Not wired to the frontend yet — see the README's "Outstanding" section.
Nothing in this repo currently connects to it; it is present but dormant
until that integration work happens.

## 7. Desktop / mobile shells

Unaffected by this change — `desktop-shell` (Electron) and `mobile-shell`
(Capacitor) are built and distributed separately via their own CI
(`ci/.github/workflows/build-shell.yml`) and just point at the production
URL above.
