


# JEDIDA Marketplace backend — Docker build
#
# Lives at the REPO ROOT on purpose: Render/Railway default to looking
# for "Dockerfile" here with the whole repo as build context, so this
# works even if the platform's "Dockerfile Path" override isn't honored.
# All COPY paths below are prefixed with backend/ to account for that.
#
# Why this file exists: Render/Railway's default buildpack (Nixpacks) has
# no apt-get access, so system binaries like LibreOffice can't be
# installed on their standard Node runtime. A Docker-based deploy gives
# full apt access at build time. Everything below runs LOCALLY inside
# this container — no external conversion API.
#
# No ClamAV here. Upload safety (backend/src/services/uploadSecurity.js)
# is handled entirely in-process: MIME allowlist + magic-byte
# verification + a heuristic threat scan (executable signatures /
# embedded script markers). That needs no system AV binary or daemon,
# so the image stays smaller and there's nothing to keep updated or
# wait on at boot.

FROM node:20-bookworm-slim

# ---- System packages -------------------------------------------------
# libreoffice-* : headless doc/spreadsheet -> PDF conversion via `soffice`
#   (the -writer/-calc subsets keep the image smaller than the full
#   `libreoffice` metapackage; add libreoffice-impress if you need
#   .ppt/.pptx conversion too)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-calc \
      fonts-dejavu \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only copy the backend's package files first (better layer caching —
# npm ci only reruns when these actually change).
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Now copy the rest of the backend only — NOT the whole repo, so
# frontend/mobile/desktop-shell source never ends up in this image.
COPY backend/ .

ENV NODE_ENV=production
ENV SOFFICE_BIN=/usr/bin/soffice

EXPOSE 5000

CMD ["node", "src/server.js"]
