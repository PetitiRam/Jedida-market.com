FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      clamav \
      clamav-freshclam \
      libreoffice-writer \
      libreoffice-calc \
      fonts-dejavu \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Bake the virus database into the image at BUILD time — network is
# reliable during build, so this is the primary source. Boot-time
# freshclam (in CMD below) is best-effort on top of this, not required.
RUN freshclam --quiet || echo "freshclam at build time failed — image will rely on boot-time freshclam only"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV SOFFICE_BIN=/usr/bin/soffice
ENV CLAMSCAN_BIN=/usr/bin/clamscan

EXPOSE 5000

# No resident daemon anymore — clamscan loads the virus DB fresh per
# scan and exits, so nothing sits in memory between uploads. Freshclam
# at boot is fire-and-forget (best-effort refresh), doesn't block startup.
CMD ["/bin/sh", "-c", "freshclam --quiet || echo 'freshclam skipped/failed, continuing with existing database'; echo 'starting node app'; exec node src/server.js"]
