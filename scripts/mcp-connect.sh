#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIST="$PROJECT_DIR/mcp-server/dist/index.js"

# Build if dist is missing
if [ ! -f "$SERVER_DIST" ]; then
  cd "$PROJECT_DIR/mcp-server"
  npm run build >&2
fi

exec node "$SERVER_DIST"
