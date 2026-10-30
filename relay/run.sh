#!/bin/bash
# Starts the upload relay. Used by the background service, and works by hand too.
DIR="$(cd "$(dirname "$0")" && pwd)"
export HOME="${HOME:-/Users/$(id -un)}"

find_node() {
  local n=""
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
    n="$(nvm which default 2>/dev/null || true)"
  fi
  for c in "$n" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -n "$c" ] && [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  # Last resort: newest Node that nvm has installed
  ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1
}

NODE="$(find_node)"
if [ "${1:-}" = "--which-node" ]; then echo "$NODE"; exit 0; fi
[ -x "$NODE" ] || { echo "$(date): Node.js not found" >&2; exit 1; }

# Use the same address the TV build was given, so the QR code always matches it.
HOST_IP="$(grep "^window.CleanFrameRelay" "$DIR/../app/assets/relay.js" | sed -n "s|.*http://\([0-9.]*\):.*|\1|p")"
[ -n "$HOST_IP" ] && export CLEANFRAME_HOST="$HOST_IP"

echo "$(date): starting relay with $NODE (address ${HOST_IP:-auto})"
exec "$NODE" "$DIR/server.js"
