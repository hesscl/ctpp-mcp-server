# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for the [Census Transportation Planning Products (CTPP) API](https://ctppdata.transportation.org). Mirrors the architecture of [us-census-bureau-data-api-mcp](https://github.com/uscensusbureau/us-census-bureau-data-api-mcp), adapted for CTPP-specific commuting/journey-to-work data.

## Architecture

Two-package structure inside a Docker Compose project:

```
ctpp-mcp-server/
├── mcp-server/          # TypeScript MCP server (stdio transport)
├── mcp-db/              # PostgreSQL migrations and seeding (geography lookup)
├── scripts/             # mcp-connect.sh launcher + dev helpers
└── docker-compose.yml   # profiles: prod, dev, test
```

### mcp-server/

TypeScript package using `@modelcontextprotocol/sdk` with `StdioServerTransport`. Tools live in `src/tools/`, each extending `BaseTool<Args>`. Zod schemas in `src/schema/`. Vitest for tests.

**MCP Tools:**

| Tool | API/DB | Description |
|------|--------|-------------|
| `list-table-groups` | CTPP API | Lists all CTPP table groups for a given year (`2010`, `2016`, `2021`) |
| `get-table-variables` | CTPP API | Returns variable definitions (estimates + MOE columns) for a specific table |
| `fetch-ctpp-data` | CTPP API | Fetches statistical data; handles both residence/workplace and flow (O-D) tables |
| `resolve-geography-fips` | PostgreSQL | Converts place names to FIPS codes for use in `for`/`in` parameters |

The `BaseTool` class checks for `CTPP_API_KEY` and wraps errors. Tools that only use the local DB set `requiresApiKey = false`.

### mcp-db/

PostgreSQL package with `node-pg-migrate` migrations and seeding scripts. Populates geography tables used by `resolve-geography-fips`. Uses `pg_trgm` trigram extension for fuzzy name matching (same pattern as Census MCP).

## CTPP API Reference

**Base URL:** `https://ctppdata.transportation.org/api/`
(Dev/beta: `https://ctppdata.transportation.dev/api/`)

**Authentication:** HTTP header `x-api-key: {CTPP_API_KEY}` (not a query param — differs from Census API)

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/groups?year={year}` | List all table groups; response: `{ data: [{name, description}] }` |
| `GET /api/groups/{table_code}/variables?year={year}` | Variables for a table; filter to `name` ending in `_e` for estimates |
| `GET /api/data/{year}?get=...&for=...&in=...&format=list` | Fetch data |

**Year values** (always required):

| `year` | ACS Span |
|--------|----------|
| `2010` | 2006–2010 |
| `2016` | 2012–2016 |
| `2021` | 2017–2021 |

**Data fetch parameters:**

| Param | Example | Notes |
|-------|---------|-------|
| `get` | `group%28B202105%29` | URL-encoded `group(TABLE_CODE)` for whole table |
| `for` | `county` | Geography type: `state`, `county`, `place`, `tract` |
| `in` | `state%3A53` | Parent geography filter as `type:FIPS` |
| `d-for` | `county` | Destination geography type (flow tables only) |
| `d-in` | `state%3A53` | Destination parent filter (flow tables only) |
| `format` | `list` | Always required |

**Table code convention:**

- First character: `A` = original suppression-based (2012–2016 only), `B` = perturbed/noise-infused, `C` = condensed (2017–2021 only)
- Second character: `1` = residence table, `2` = workplace table, `3` = flow/O-D table

**Response shape:**
```json
{ "data": [{ "geoid": "C03US53033", "name": "King County, Washington", "b202105_e1": "123", "b202105_m1": "45" }] }
```
Variable columns: `{table_lower}_{e|m}{line}` where `e` = estimate, `m` = margin of error.

## Development Commands

Run from `mcp-server/`:
```bash
npm install
npm run build          # tsc → dist/
npm run watch          # tsc --watch
npm test               # vitest
npm run lint
npm run format
npm run format:check
npm run inspect        # @modelcontextprotocol/inspector
```

Run from `mcp-db/`:
```bash
npm run migrate:up
npm run seed
```

## Environment Variables

```
CTPP_API_KEY=...        # Required for all CTPP API calls
DATABASE_URL=postgresql://mcp_user:mcp_pass@localhost:5432/mcp_db
MCP_TRANSPORT=http      # Optional; enables HTTP transport (default: stdio)
PORT=3000               # Optional; HTTP port when MCP_TRANSPORT=http (default: 3000)
MCP_AUTH_TOKEN=...      # Recommended for HTTP transport; Bearer token auth (see Security)
DEBUG_LOGS=true         # Enables console output (suppressed by default in index.ts)
```

## Security (HTTP Transport)

When `MCP_TRANSPORT=http`, set `MCP_AUTH_TOKEN` — the server checks every request for `Authorization: Bearer <token>`. Without it the endpoint is unauthenticated and any client with network access can call tools and exhaust your CTPP API quota.

Other hardened defaults (all in `index.ts`):
- Request body capped at **1 MB** (HTTP 413 if exceeded)
- Session map capped at **100** concurrent sessions (HTTP 503 if exceeded)
- Startup `stderr` warning emitted when `MCP_AUTH_TOKEN` is unset

The stdio transport (default) runs as a local subprocess and requires no token.

## MCP Client Configuration

**Local (stdio) — default:**
```json
{
  "mcpServers": {
    "ctpp-mcp": {
      "command": "bash",
      "args": ["/path/to/ctpp-mcp-server/scripts/mcp-connect.sh"],
      "env": { "CTPP_API_KEY": "your_api_key" }
    }
  }
}
```

**Remote (HTTP) — set `MCP_TRANSPORT=http`:**
```json
{
  "mcpServers": {
    "ctpp-mcp": {
      "type": "streamable-http",
      "url": "http://your-host:3000/mcp",
      "headers": { "Authorization": "Bearer your_secret_token" }
    }
  }
}
```

Run the HTTP server with Docker Compose:
```bash
CTPP_API_KEY=your_key MCP_AUTH_TOKEN=your_secret_token docker compose --profile prod up
```

Or locally:
```bash
MCP_TRANSPORT=http PORT=3000 CTPP_API_KEY=your_key MCP_AUTH_TOKEN=your_secret_token node mcp-server/dist/index.js
```

## Key Differences from Census MCP

- Auth is via `x-api-key` **header**, not `?key=` query param
- Only three dataset vintages (2010, 2016, 2021) vs hundreds of Census datasets
- No `fetch-dataset-geography` tool needed — geography types are fixed (`state`, `county`, `place`, `tract`)
- Flow (O-D) tables require `d-for`/`d-in` destination params in addition to `for`/`in`
- `list-table-groups` replaces both `list-datasets` and `search-data-tables`
- `get-table-variables` replaces `search-data-tables` for column-level lookup
