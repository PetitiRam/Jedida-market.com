FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      clamav-daemon \
      clamav-freshclam \
      libreoffice-writer \
      libreoffice-calc \
      fonts-dejavu \
      curl \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/run/clamav /var/lib/clamav \
    && chown -R clamav:clamav /var/run/clamav /var/lib/clamav

RUN sed -i 's/^Foreground .*/Foreground true/' /etc/clamav/clamd.conf \
    && sed -i 's|^LocalSocket .*|LocalSocket /var/run/clamav/clamd.ctl|' /etc/clamav/clamd.conf \
    && sed -i 's/^#*LocalSocketGroup .*/LocalSocketGroup clamav/' /etc/clamav/clamd.conf

# Bake the virus database into the image at BUILD time (network works
# reliably during build), so boot never depends on a live download
# succeeding. freshclam still refreshes it on every boot too — this is
# just the fallback so clamd always has *something* to load.
RUN freshclam --quiet || echo "freshclam at build time failed — image will rely on boot-time freshclam only"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV CLAMD_SOCKET=/var/run/clamav/clamd.ctl
ENV SOFFICE_BIN=/usr/bin/soffice

EXPOSE 5000

CMD ["/bin/sh", "-c", "freshclam --quiet || echo 'freshclam skipped/failed, continuing with existing database'; clamd & for i in $(seq 1 30); do [ -S \"$CLAMD_SOCKET\" ] && break; sleep 1; done; echo 'starting node app'; exec node src/server.js"]
