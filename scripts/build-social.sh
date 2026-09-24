#!/usr/bin/env bash
# Renders the HTML social images with headless Chrome:
#   scripts/og.html     -> og.png (1200x630, link preview, deployed)
#   scripts/banner.html -> scripts/banner.png (3000x1000, @down.blue profile banner)
# The pages need an HTTP origin: fonts come from static.joseli.to under CORS.
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

command -v python3 >/dev/null || { echo "python3 not found; needed to serve the pages" >&2; exit 1; }

PORT="${PORT:-8765}"
BASE="http://127.0.0.1:$PORT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER"' EXIT
python3 - "$BASE/scripts/og.html" <<'EOF' || { echo "Server on port $PORT did not answer; set PORT" >&2; exit 1; }
import sys, time, urllib.request
for _ in range(50):
    try:
        urllib.request.urlopen(sys.argv[1], timeout=1); sys.exit(0)
    except Exception:
        time.sleep(0.1)
sys.exit(1)
EOF

# Captures to a temporary file so a failed run never replaces a published image.
# The virtual time budget lets the web fonts finish loading before the capture.
render() {
  local page="$1" width="$2" height="$3" output="$4" capture size
  capture="$(mktemp -t social).png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$width,$height" \
    --virtual-time-budget=5000 \
    --screenshot="$capture" "$BASE/$page" 2>/dev/null
  size="$(python3 -c 'import struct,sys; d=open(sys.argv[1],"rb").read(24); print("%dx%d" % struct.unpack(">II", d[16:24]))' "$capture")"
  [[ "$size" == "${width}x${height}" ]] || { echo "Bad render of $page ($size); $output left unchanged" >&2; exit 1; }
  mv "$capture" "$output"
  echo "Wrote $output"
}

render scripts/og.html 1200 630 og.png
render scripts/banner.html 3000 1000 scripts/banner.png
