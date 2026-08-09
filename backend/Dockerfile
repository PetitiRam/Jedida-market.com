# JEDIDA Marketplace backend — Docker build
#
# Why this file exists: Railway/Render's default buildpack (Nixpacks) has
# no apt-get access, so system binaries like ClamAV and LibreOffice can't
# be installed on their standard Node runtime. Pointing Railway/Render at
# this Dockerfile instead (both support "Docker" as a deploy method) gives
# full apt access at build time. Everything below runs LOCALLY inside this
# container — no external scanning API, no external conversion API.

FROM node:20-bookworm-slim

# ---- System packages -------------------------------------------------
# clamav-daemon : clamd, the scanning daemon (kept warm/loaded — fast)
# clamav-freshclam : keeps virus definitions updated
# libreoffice-* : headless doc/spreadsheet -> PDF conversion via `soffice`
#   (the -writer/-calc/-impress subsets keep the image smaller than the
#   full `libreoffice` metapackage; add libreoffice-impress back if you
#   need .ppt/.pptx conversion too)
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

# clamd config: listen on a local unix socket, not TCP — nothing outside
# this container can ever reach it.
RUN sed -i 's/^Foreground .*/Foreground true/' /etc/clamav/clamd.conf \
    && sed -i 's|^LocalSocket .*|LocalSocket /var/run/clamav/clamd.ctl|' /etc/clamav/clamd.conf \
    && sed -i 's/^#*LocalSocketGroup .*/LocalSocketGroup clamav/' /etc/clamav/clamd.conf

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV CLAMD_SOCKET=/var/run/clamav/clamd.ctl
ENV SOFFICE_BIN=/usr/bin/soffice

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
