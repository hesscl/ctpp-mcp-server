#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIST="$PROJECT_DIR/mcp-server/dist/index.js"

# Load .env from project root if it exists
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/.env"
  set +a
fi

# Build if dist is missing
if [ ! -f "$SERVER_DIST" ]; then
  cd "$PROJECT_DIR/mcp-server"
  npm run build >&2
fi

exec node "$SERVER_DIST"
