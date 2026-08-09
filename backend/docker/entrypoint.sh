#!/bin/sh
# Container entrypoint: bring up ClamAV's daemon locally, then hand off to
# the Node process. LibreOffice needs no daemon — it's invoked on demand
# per-conversion by documentConversionService.js — so there's nothing to
# start for it here.
set -e

echo "[entrypoint] Updating virus definitions (freshclam)..."
# `|| true`: on a redeploy the definitions from the previous image layer
# are usually still recent; don't block startup if the mirror is slow or
# briefly unreachable. clamd will run with whatever's on disk.
freshclam --quiet || echo "[entrypoint] freshclam failed/skipped, continuing with existing definitions"

echo "[entrypoint] Starting clamd..."
clamd &
CLAMD_PID=$!

# Wait for clamd's socket to actually exist before starting the app —
# uploadSecurity.js fails closed if it can't reach clamd, so a slow first
# boot (definitions loading into memory) shouldn't cause early uploads to
# be wrongly rejected.
echo "[entrypoint] Waiting for clamd socket..."
for i in $(seq 1 60); do
  [ -S "$CLAMD_SOCKET" ] && break
  sleep 1
done

if [ -S "$CLAMD_SOCKET" ]; then
  echo "[entrypoint] clamd is ready."
else
  echo "[entrypoint] WARNING: clamd socket never appeared after 60s — uploads will fail closed until it does."
fi

echo "[entrypoint] Starting Node app..."
exec node src/server.js
