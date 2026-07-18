#!/usr/bin/env bash
# Build the self-contained slidekit-deck binary.
#
# Bundles a pinned official Node runtime + this project's node_modules + config + themes
# + inlined fonts into a compressed payload, then embeds it in a Bun-compiled
# launcher. dist/slidekit-deck is ONE file: on first run it extracts the runtime
# to ~/.cache/slidekit-deck/<payload-hash> and serves the HTTP deck API.
#
# The cache dir is keyed by a content hash of payload.tgz, so a rebuilt payload
# auto-invalidates the cache (no manual version bump).
#
# Note: the embedded `node` and native npm dependencies are platform-specific,
# so build on the OS/arch you want to run on.
set -euo pipefail
cd "$(dirname "$0")"

NODE_RUNTIME_VERSION="22.23.1"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  darwin-arm64) NODE_TARGET="darwin-arm64"; NODE_SHA256="ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953" ;;
  darwin-x86_64) NODE_TARGET="darwin-x64"; NODE_SHA256="b8da981b8a0b1241b70249204916da76c63573ddf5814dbd2d1e41069105cb81" ;;
  linux-aarch64|linux-arm64) NODE_TARGET="linux-arm64"; NODE_SHA256="543fa39e57d4c07855939459a323f4deb9a79dd1bb45e6e99458b0f2de10db8d" ;;
  linux-x86_64) NODE_TARGET="linux-x64"; NODE_SHA256="7a8cb04b4a1df4eaf432125324b81b29a088e73570a23259a8de1c65d07fc129" ;;
  *) echo "Unsupported binary target: $OS-$ARCH" >&2; exit 1 ;;
esac

NODE_ARCHIVE="node-v${NODE_RUNTIME_VERSION}-${NODE_TARGET}.tar.gz"
RUNTIME_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/slidekit-build"
RUNTIME_TMP="$(mktemp -d)"
trap 'rm -rf "$RUNTIME_TMP"' EXIT
mkdir -p "$RUNTIME_CACHE"

if [[ ! -f "$RUNTIME_CACHE/$NODE_ARCHIVE" ]]; then
  echo "› downloading official Node.js v${NODE_RUNTIME_VERSION} runtime ($NODE_TARGET)"
  curl --fail --location --silent --show-error \
    "https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}/${NODE_ARCHIVE}" \
    --output "$RUNTIME_TMP/$NODE_ARCHIVE"
  mv "$RUNTIME_TMP/$NODE_ARCHIVE" "$RUNTIME_CACHE/$NODE_ARCHIVE"
fi

if command -v shasum >/dev/null 2>&1; then
  NODE_ACTUAL_SHA256="$(shasum -a 256 "$RUNTIME_CACHE/$NODE_ARCHIVE" | awk '{print $1}')"
else
  NODE_ACTUAL_SHA256="$(sha256sum "$RUNTIME_CACHE/$NODE_ARCHIVE" | awk '{print $1}')"
fi
if [[ "$NODE_ACTUAL_SHA256" != "$NODE_SHA256" ]]; then
  echo "Node.js runtime checksum mismatch for $NODE_ARCHIVE" >&2
  exit 1
fi

echo "› staging verified official Node.js v${NODE_RUNTIME_VERSION} runtime"
tar -xzf "$RUNTIME_CACHE/$NODE_ARCHIVE" -C "$RUNTIME_TMP"
rm -f .node-bin
cp "$RUNTIME_TMP/node-v${NODE_RUNTIME_VERSION}-${NODE_TARGET}/bin/node" .node-bin
chmod 0755 .node-bin

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
