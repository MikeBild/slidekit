#!/usr/bin/env bash
# Build the self-contained slidekit-deck binary.
#
# Bundles the local Node runtime + this project's node_modules + config + themes
# + inlined fonts into a compressed payload, then embeds it in a Bun-compiled
# launcher. dist/slidekit-deck is ONE file: on first run it extracts the runtime
# to ~/.cache/slidekit-deck/<payload-hash> and serves the HTTP deck API.
#
# The cache dir is keyed by a content hash of payload.tgz, so a rebuilt payload
# auto-invalidates the cache (no manual version bump).
#
# Note: the embedded `node` and the rolldown native binary are platform-specific,
# so build on the OS/arch you want to run on (here: macOS arm64).
set -euo pipefail
cd "$(dirname "$0")"

echo "› staging node binary"
cp "$(command -v node)" .node-bin

echo "› cleaning job temp files"
rm -rf .jobs
rm -f .deck-*.md

echo "› packing payload.tgz (node + node_modules + themes + fonts + config)"
tar --use-compress-program 'gzip -1' -cf payload.tgz \
  .node-bin server.mjs src package.json vite.config.ts style.css themes fonts.css docs .env.example node_modules
echo "  payload.tgz: $(du -h payload.tgz | cut -f1)"

echo "› deriving content-hash cache key"
KEY="$(shasum -a 256 payload.tgz | cut -c1-16)"
printf "export default '%s'\n" "$KEY" > bin/cache-key.ts
echo "  cache key: $KEY"

echo "› compiling binary with Bun"
mkdir -p dist
bun build bin/slidekit.ts --compile --outfile dist/slidekit-deck

echo "✓ dist/slidekit-deck ($(du -h dist/slidekit-deck | cut -f1))"
echo "  run:  PORT=4030 ./dist/slidekit-deck   then open http://localhost:4030"
