# JEDIDA Marketplace backend — Docker build
#
# Why this file exists: Render/Railway's default buildpack (Nixpacks) has
# no apt-get access, so system binaries like ClamAV and LibreOffice can't
# be installed on their standard Node runtime. A Docker-based deploy gives
# full apt access at build time. Everything below runs LOCALLY inside
# this container — no external scanning API, no external conversion API.

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      clamav-daemon \
      clamav-freshclam \
      libreoffice-writer \
      libreoffice-calc \
      fonts-dejavu \
      curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/run/clamav /var/lib/clamav \
    && chown -R clamav:clamav /var/run/clamav /var/lib/clamav

RUN sed -i 's/^Foreground .*/Foreground true/' /etc/clamav/clamd.conf \
    && sed -i 's|^LocalSocket .*|LocalSocket /var/run/clamav/clamd.ctl|' /etc/clamav/clamd.conf \
    && sed -i 's/^#*LocalSocketGroup .*/LocalSocketGroup clamav/' /etc/clamav/clamd.conf

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV CLAMD_SOCKET=/var/run/clamav/clamd.ctl
ENV SOFFICE_BIN=/usr/bin/soffice

EXPOSE 5000

# Startup logic inlined here (not a separate script file) to avoid any
# line-ending/exec-permission issues with a standalone entrypoint.sh.
# 1. Best-effort virus definition update (don't block boot if it fails).
# 2. Start clamd in the background, wait up to 30s for its socket.
# 3. Hand off to Node.
CMD ["/bin/sh", "-c", "freshclam --quiet || echo 'freshclam skipped/failed, continuing'; clamd & for i in $(seq 1 30); do [ -S \"$CLAMD_SOCKET\" ] && break; sleep 1; done; echo 'starting node app'; exec node src/server.js"]
