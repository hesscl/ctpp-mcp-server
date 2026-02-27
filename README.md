# 🚗 CTPP MCP Server

> **Ask your AI assistant about commuting patterns, journey-to-work data, and transportation statistics — powered by the Census CTPP API.**

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for the [Census Transportation Planning Products (CTPP) API](https://ctppdata.transportation.org). Plug commuting and journey-to-work data directly into Claude Desktop, Claude Code, or any MCP-compatible AI client.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🗺️ What is CTPP?

The CTPP dataset is produced by AASHTO from US Census ACS data. It captures detailed commuting patterns at state, county, place, and tract levels:

- 🏠 **Residence tables (B1xx)** — where workers *live*
- 🏢 **Workplace tables (B2xx)** — where workers *work*
- 🔄 **Flow/O-D tables (B3xx)** — origin-destination *commute pairs*

---

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| 🗂️ `list-datasets` | List all available CTPP dataset vintages (years) |
| 📋 `list-table-groups` | Browse/search tables for a given year |
| 🔬 `get-table-variables` | Get variable names (estimates + MOE) for a specific table |
| 🌍 `get-group-geographies` | Get available geography levels for a table |
| 📊 `fetch-ctpp-data` | Fetch statistical data with geography and variable filters |
| 📍 `resolve-geography-fips` | Convert place names → FIPS codes via fuzzy matching |

### 📅 Dataset Years

| Year | ACS Coverage |
|------|--------------|
| 2000 | 2000 Census |
| 2010 | 2006–2010 ACS |
| 2016 | 2012–2016 ACS |
| 2021 | 2017–2021 ACS |

---

## 🏗️ Architecture

```
ctpp-mcp-server/
├── mcp-server/          # 📦 TypeScript MCP server (stdio transport)
│   └── src/
│       ├── index.ts     # Server entry point
│       ├── apiClient.ts # ctppFetch() with X-API-Key header auth
│       ├── db.ts        # Lazy PostgreSQL pool for geography DB
│       └── tools/       # One file per tool + BaseTool base class
├── mcp-db/              # 🐘 PostgreSQL migrations and seed data
│   ├── migrations/      # node-pg-migrate schema
│   └── seed/seed.ts     # Populates states + counties from TIGERweb
├── scripts/
│   └── mcp-connect.sh   # 🔌 MCP client entry point (auto-builds if needed)
└── docker-compose.yml   # 🐳 Runs postgres:16
```

The server runs over **stdio** — your MCP client launches it as a subprocess. The only external service is PostgreSQL (for geography lookups); all CTPP data queries go directly to the CTPP REST API.

---

## ⚡ Quickstart

### Prerequisites

- **Node.js** 18+
- **Docker** + **Docker Compose**
- **CTPP API key** — request one at [ctppdata.transportation.org](https://ctppdata.transportation.org)

### 1. Install dependencies

```bash
cd mcp-server && npm install
cd ../mcp-db && npm install
```

### 2. Start the database 🐘

```bash
docker compose --profile dev up -d db
```

Starts PostgreSQL 16 on port 5432 (`mcp_db` / `mcp_user` / `mcp_pass`). Wait a few seconds, then verify:

```bash
docker compose ps
```

### 3. Run migrations

```bash
cd mcp-db
DATABASE_URL=postgresql://mcp_user:mcp_pass@localhost:5432/mcp_db npm run migrate:up
```

Creates the `geographies` table and a GIN trigram index for fuzzy name matching.

### 4. Seed geography data

```bash
DATABASE_URL=postgresql://mcp_user:mcp_pass@localhost:5432/mcp_db npm run seed
```

Inserts all 50 states + DC + PR and ~3,200 counties from the Census TIGERweb REST API.

### 5. Build the server

```bash
cd ../mcp-server
npm run build
```

Output lands in `mcp-server/dist/`.

### 6. Configure your MCP client 🤖

Add this to your `claude_desktop_config.json` or Claude Code MCP settings:

```json
{
  "mcpServers": {
    "ctpp-mcp": {
      "command": "bash",
      "args": ["/absolute/path/to/ctpp-mcp-server/scripts/mcp-connect.sh"],
      "env": {
        "CTPP_API_KEY": "your_api_key_here",
        "DATABASE_URL": "postgresql://mcp_user:mcp_pass@localhost:5432/mcp_db"
      }
    }
  }
}
```

The `mcp-connect.sh` script auto-builds `dist/` if it's missing.

---

## 💡 Example Workflow

Find commute mode share for King County, WA in 2021:

1. 🔍 **`list-table-groups`** `year=2021, keyword="means of transportation"` → finds table `B202105`
2. 🔬 **`get-table-variables`** `groupId="B202105", year=2021` → discovers variables like `B202105_e1`
3. 📍 **`resolve-geography-fips`** `name="King County, Washington"` → `forGeo="county:033", inGeo="state:53"`
4. 📊 **`fetch-ctpp-data`** `year=2021, get="B202105_e1,B202105_m1", forGeo="county:033", inGeo="state:53"`

For flow (O-D) tables, add destination params:

```
fetch-ctpp-data: year=2021, get="B302105_e1", forGeo="county:033", inGeo="state:53",
                 dForGeo="county:*", dInGeo="state:53"
```

---

## 🧪 Development

All commands from `mcp-server/`:

```bash
npm test               # 🧪 Run Vitest test suite
npm run watch          # 👀 Rebuild on file changes (tsc --watch)
npm run lint           # 🔍 ESLint (typescript-eslint v8)
npm run format         # ✨ Prettier (auto-fix)
npm run format:check   # ✅ Prettier (CI check)
npm run inspect        # 🔭 MCP Inspector for interactive tool testing
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CTPP_API_KEY` | Yes (API tools) | API key for ctppdata.transportation.org |
| `DATABASE_URL` | Yes (`resolve-geography-fips`) | PostgreSQL connection string |
| `CTPP_API_URL` | No | Override API base URL (e.g., dev/beta endpoint) |
| `MCP_TRANSPORT` | No | Set to `http` to enable HTTP transport (default: `stdio`) |
| `PORT` | No | HTTP port when `MCP_TRANSPORT=http` (default: `3000`) |
| `MCP_AUTH_TOKEN` | No* | Bearer token for HTTP transport. **Strongly recommended when using `MCP_TRANSPORT=http`** — without it the endpoint is unauthenticated and anyone with network access can use your CTPP API key. |
| `DEBUG_LOGS` | No | Set to `true` to enable `console.log` (suppressed by default — stdout carries MCP protocol) |

> **Security note:** When running the HTTP transport, always set `MCP_AUTH_TOKEN` and keep the port off the public internet (or behind a reverse proxy with TLS). The stdio transport (default) is inherently local and does not require a token.

### Interactive Testing

```bash
cd mcp-server
CTPP_API_KEY=your_key DATABASE_URL=postgresql://mcp_user:mcp_pass@localhost:5432/mcp_db npm run inspect
```

Opens a browser UI to call each tool and inspect inputs/outputs.

---

## 🗃️ Database Migrations

```bash
cd mcp-db

# Apply all pending migrations
DATABASE_URL=... npm run migrate:up

# Roll back the last migration
DATABASE_URL=... npm run migrate:down
```

## 🛑 Stopping the Database

```bash
docker compose --profile dev down        # stop (keeps data volume)
docker compose --profile dev down -v     # stop + delete data volume
```

---

## 📋 Changelog

### v1.1.0

- Switch license from CC0 to MIT
- Add HTTP transport support (`MCP_TRANSPORT=http`) with Bearer token auth, 1 MB body cap, and 100-session limit
- Harden input validation across all tools
- Bump `@types/node` to `^22` to match Dockerfile runtime

---

## 📄 License

This project is released under the [MIT License](LICENSE).
