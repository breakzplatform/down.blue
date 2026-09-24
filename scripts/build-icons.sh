#!/usr/bin/env bash
# Renders the icon sources with headless Chrome:
#   scripts/avatar.svg  -> scripts/avatar.png (1000px, Bluesky profile picture)
#                       -> apple-touch-icon.png (180px, opaque, iOS rounds it)
# The favicon is scripts/favicon.svg inlined into index.html; paste it by hand.
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
command -v python3 >/dev/null || { echo "python3 not found; needed to check the output" >&2; exit 1; }

# Prints "<width>x<height>" from a PNG header.
png_size() {
  python3 -c 'import struct,sys; d=open(sys.argv[1],"rb").read(24); print("%dx%d" % struct.unpack(">II", d[16:24]))' "$1"
}

# Headless Chrome clamps small windows to a minimum width, so a small render
# comes out cropped. Always render large, then downscale.
render() {
  local source="$1" size="$2" output="$3"
  rm -f "$output"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$size,$size" \
    --screenshot="$PWD/$output" "file://$PWD/$source" 2>/dev/null
  [[ "$(png_size "$output")" == "${size}x${size}" ]] || { echo "Bad render: $output" >&2; exit 1; }
}

render scripts/avatar.svg 1000 scripts/avatar.png
echo "Wrote scripts/avatar.png"

sips -z 180 180 scripts/avatar.png --out apple-touch-icon.png >/dev/null
[[ "$(png_size apple-touch-icon.png)" == "180x180" ]] || { echo "Bad resize: apple-touch-icon.png" >&2; exit 1; }
echo "Wrote apple-touch-icon.png"
