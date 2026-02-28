# 🚗 CTPP MCP Server

> **Ask your AI assistant about commuting patterns, journey-to-work data, and transportation statistics — powered by the Census CTPP API.**

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for the [Census Transportation Planning Products (CTPP) API](https://ctppdata.transportation.org). Plug commuting and journey-to-work data directly into any MCP-compatible AI client. A `generate-code` tool exports any query as a self-contained R or Python script, so analyses are easy to share and reproduce outside of the AI client.

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
| 📍 `resolve-geography-fips` | Convert place names → FIPS codes via fuzzy matching (no DB required) |
| 💻 `generate-code` | Export a `fetch-ctpp-data` query as a self-contained R or Python script; optionally annotates variables with labels (`annotate=true`) and generates a pagination loop to fetch all records (`fetchAll=true`) |

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
│       ├── index.ts         # Server entry point
│       ├── apiClient.ts     # ctppFetch() with X-API-Key header auth
│       ├── geo.ts           # In-memory geography search (trigram similarity)
│       ├── data/
│       │   └── geographies.ts  # Bundled states + counties (3,287 records)
│       └── tools/           # One file per tool + BaseTool base class
├── scripts/
│   ├── mcp-connect.sh       # 🔌 MCP client entry point (auto-builds if needed)
│   └── generate-geo-data.ts # Refreshes geographies.ts from TIGERweb
└── docker-compose.yml       # 🐳 HTTP transport only (no database)
```

The server runs over **stdio** — your MCP client launches it as a subprocess. Geography lookups are resolved in-memory from bundled data; no database is required. All CTPP data queries go directly to the CTPP REST API.

---

## ⚡ Quickstart

### Prerequisites

- **Node.js** 18+
- **CTPP API key** — request one at [ctppdata.transportation.org](https://ctppdata.transportation.org)

### 1. Install and build

```bash
cd mcp-server && npm install && npm run build
```

Output lands in `mcp-server/dist/`.

### 2. Set your API key

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
# then edit .env and set CTPP_API_KEY=your_api_key_here
```

### 3. Configure your MCP client 🤖

Add this to your MCP client config (e.g. `claude_desktop_config.json`, Cursor settings, or equivalent):

**Unix/Mac** — use `mcp-connect.sh`, which auto-loads `.env` and auto-builds `dist/` if needed:

```json
{
  "mcpServers": {
    "ctpp-mcp": {
      "command": "bash",
      "args": ["/absolute/path/to/ctpp-mcp-server/scripts/mcp-connect.sh"]
    }
  }
}
```

**Windows / without `.env`** — pass the key directly in the config:

```json
{
  "mcpServers": {
    "ctpp-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/ctpp-mcp-server/mcp-server/dist/index.js"],
      "env": {
        "CTPP_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

---

## 💡 Example Workflow

Find commute mode share for King County, WA in 2021:

1. 🔍 **`list-table-groups`** `year=2021, keyword="means of transportation"` → finds table `B202105`
2. 🔬 **`get-table-variables`** `groupId="B202105", year=2021` → discovers variables like `B202105_e1`
3. 📍 **`resolve-geography-fips`** `name="King County, Washington"` → `forGeo="county:033", inGeo="state:53"`
4. 📊 **`fetch-ctpp-data`** `year=2021, get="B202105_e1,B202105_m1", forGeo="county:033", inGeo="state:53"`
5. 💻 **`generate-code`** `language="r", year=2021, get="B202105_e1,B202105_m1", forGeo="county:033", inGeo="state:53"` → runnable `httr2` script

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
npm run generate-geo-data  # 🗺️ Refresh bundled geography data from TIGERweb
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CTPP_API_KEY` | Yes (API tools) | API key for ctppdata.transportation.org |
| `CTPP_API_URL` | No | Override API base URL (e.g., dev/beta endpoint) |
| `MCP_TRANSPORT` | No | Set to `http` to enable HTTP transport (default: `stdio`) |
| `PORT` | No | HTTP port when `MCP_TRANSPORT=http` (default: `3000`) |
| `MCP_AUTH_TOKEN` | No* | Bearer token for HTTP transport. **Strongly recommended when using `MCP_TRANSPORT=http`** — without it the endpoint is unauthenticated and anyone with network access can use your CTPP API key. |
| `DEBUG_LOGS` | No | Set to `true` to enable `console.log` (suppressed by default — stdout carries MCP protocol) |

> **Security note:** When running the HTTP transport, always set `MCP_AUTH_TOKEN` and keep the port off the public internet (or behind a reverse proxy with TLS). The stdio transport (default) is inherently local and does not require a token.

### Interactive Testing

```bash
cd mcp-server
# If you have a .env in the project root:
source ../.env && npm run inspect

# Or pass the key inline:
CTPP_API_KEY=your_key npm run inspect
```

> **Windows (PowerShell):** `$env:CTPP_API_KEY = "your_key"; npm run inspect`

Opens a browser UI to call each tool and inspect inputs/outputs.

---

## 🗺️ Geography Data

`resolve-geography-fips` uses a bundled dataset of all US states and ~3,200 counties, searched in-memory using trigram similarity (same algorithm as PostgreSQL's `pg_trgm`). No database is required.

To refresh the bundled data from Census TIGERweb (e.g. after county boundary changes):

```bash
cd mcp-server && npm run generate-geo-data && npm run build
```

---

## 📋 Changelog

### v1.3.0

- Remove PostgreSQL / Docker dependency: `resolve-geography-fips` now uses a bundled dataset searched in-memory with a JS trigram similarity implementation (replicates `pg_trgm`)
- Remove `mcp-db/` package, `docker-compose.yml` `db` service, and `pg` dependency from `mcp-server`
- Add `scripts/generate-geo-data.ts` to refresh the bundled geography data from TIGERweb
- Setup is now just `npm install && npm run build` — no database required

### v1.2.0

- Add `generate-code` tool — exports any `fetch-ctpp-data` query as a self-contained R (`httr2` + `dplyr`) or Python (`requests` + `pandas`) script
  - `annotate=true`: fetches variable labels from the CTPP API and embeds them as comments in the generated script
  - `fetchAll=true`: generates a pagination loop (page size 1000) that fetches all records instead of a single page
- Update install instructions to be platform-agnostic (Windows PowerShell notes, `node` instead of `bash` in MCP client config)

### v1.1.0

- Switch license from CC0 to MIT
- Add HTTP transport support (`MCP_TRANSPORT=http`) with Bearer token auth, 1 MB body cap, and 100-session limit
- Harden input validation across all tools
- Bump `@types/node` to `^22` to match Dockerfile runtime

---

## 📄 License

This project is released under the [MIT License](LICENSE).
