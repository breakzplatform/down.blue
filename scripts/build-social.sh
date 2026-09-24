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

command -v python3 >/dev/null || { echo "python3 not found; needed to serve the page" >&2; exit 1; }

PORT="${PORT:-8765}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
PAGE="http://127.0.0.1:$PORT/scripts/og.html"
python3 - "$PAGE" <<'EOF' || { echo "Server on port $PORT did not serve the page; set PORT" >&2; exit 1; }
import sys, time, urllib.request
for _ in range(50):
    try:
        urllib.request.urlopen(sys.argv[1], timeout=1); sys.exit(0)
    except Exception:
        time.sleep(0.1)
sys.exit(1)
EOF

# Capture to a temporary file so a failed run never replaces the published image.
# The virtual time budget lets the web fonts finish loading before the capture.
OUTPUT="$(mktemp -t og).png"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=5000 \
  --screenshot="$OUTPUT" "$PAGE" 2>/dev/null

SIZE="$(python3 -c 'import struct,sys; d=open(sys.argv[1],"rb").read(24); print("%dx%d" % struct.unpack(">II", d[16:24]))' "$OUTPUT")"
[[ "$SIZE" == "1200x630" ]] || { echo "Bad render ($SIZE); og.png left unchanged" >&2; exit 1; }
mv "$OUTPUT" og.png
echo "Wrote og.png"
