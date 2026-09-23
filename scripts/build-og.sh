#!/usr/bin/env bash
# Renders scripts/og.html to og.png (1200x630) with headless Chrome.
# The page needs an HTTP origin: fonts come from static.joseli.to under CORS.
set -euo pipefail

cd "$(dirname "$0")/.."

CHROME="${CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
    "$(command -v chromium || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then CHROME="$candidate"; break; fi
  done
fi
[[ -n "$CHROME" ]] || { echo "Chrome not found; set CHROME=/path/to/chrome" >&2; exit 1; }

PORT="${PORT:-8765}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
sleep 1

# The virtual time budget lets the web fonts finish loading before the capture.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=5000 \
  --screenshot="$PWD/og.png" \
  "http://127.0.0.1:$PORT/scripts/og.html" 2>/dev/null

echo "Wrote og.png"
