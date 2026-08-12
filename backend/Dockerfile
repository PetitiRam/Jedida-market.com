

FROM node:20-bookworm-slim

# System packages: LibreOffice for headless doc/spreadsheet -> PDF
# conversion via `soffice`. No ClamAV — the upload security layer
# (backend/src/services/uploadSecurity.js) does MIME allowlisting,
# magic-byte verification, and an in-process heuristic threat scan;
# none of that needs a system AV binary or daemon.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      libreoffice-writer \
      libreoffice-calc \
      fonts-dejavu \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV SOFFICE_BIN=/usr/bin/soffice

EXPOSE 5000

CMD ["node", "src/server.js"]
