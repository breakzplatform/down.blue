#!/usr/bin/env bash
# Regenerate the vendored, compiled Tailwind CSS from scripts/tailwind-input.css
# and the classes used in index.html. The site ships static CSS (no Play CDN
# runtime), so this must be re-run whenever Tailwind classes change in
# index.html or the design system in scripts/ds/ is replaced.
#
# Dependencies come from the repo's own pnpm lockfile, so a build is
# reproducible down to the transitive packages. node_modules is gitignored and
# pruned at deploy time — nothing here reaches the CDN except the output file.
#
# pnpm's node_modules is a symlink farm over a content-addressed store, and
# Tailwind's resolver follows those symlinks fine — but it does mean a package
# not declared in package.json is genuinely unreachable, unlike with npm's flat
# tree. If an import ever fails to resolve, add the dependency, don't hoist it.
#
# Everything npm-shaped lives under scripts/: package.json, the lockfile,
# node_modules and the .build/ work directory. That is not tidiness — Netlify
# decides whether to run a dependency install by looking for a package.json at
# the SITE ROOT, and scripts/ is already pruned at deploy time. Keeping it here
# means the deploy installs nothing.
#
# .build/ must sit next to node_modules, because Tailwind v4 resolves
# `@import "tailwindcss"` by walking up from the input file looking for one.
#
# Fonts are NOT vendored: tokens/fonts.css points at static.joseli.to, which is
# the same owner's asset host, sends `access-control-allow-origin: *` and caches
# immutably for a year. A declared face costs no download until some text
# actually matches it, so all fourteen can be declared while the page pulls the
# five it uses. Nothing about the CSS needs rewriting for them.
#
# Usage: ./scripts/build-css.sh   (runs from any cwd)
set -euo pipefail

TAILWIND_VERSION="4.3.3"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT="${ROOT_DIR}/assets/tailwind-${TAILWIND_VERSION}.css"
WORK="${SCRIPT_DIR}/.build"

cleanup() { rm -rf "${WORK}"; }
trap cleanup EXIT

if [ ! -x "${SCRIPT_DIR}/node_modules/.bin/tailwindcss" ]; then
  echo "installing pinned dependencies from pnpm-lock.yaml..."
  (cd "${SCRIPT_DIR}" && pnpm install --frozen-lockfile --silent)
fi

rm -rf "${WORK}"
mkdir -p "${WORK}"
cp -R "${SCRIPT_DIR}/ds" "${WORK}/ds"
cp "${SCRIPT_DIR}/tailwind-theme.css" "${WORK}/tailwind-theme.css"

# The entry is compiled from .build/, so @source must become absolute.
sed "s#@source \"../index.html\";#@source \"${ROOT_DIR}/index.html\";#" \
  "${SCRIPT_DIR}/tailwind-input.css" > "${WORK}/input.css"

mkdir -p "$(dirname "${OUTPUT}")"

"${SCRIPT_DIR}/node_modules/.bin/tailwindcss" \
  -i "${WORK}/input.css" \
  -o "${OUTPUT}" \
  --minify

echo "Built ${OUTPUT} ($(wc -c < "${OUTPUT}" | tr -d ' ') bytes)"
echo "Reminder: <link> in index.html must reference assets/tailwind-${TAILWIND_VERSION}.css"
