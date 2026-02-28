import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { ctppFetch } from "../apiClient.js";

const GEO_UNIT = /^(state|county|place|tract)(:[0-9*]+)?$/;
const GEO_LIST =
  /^(state|county|place|tract)(:[0-9*]+)?( (state|county|place|tract)(:[0-9*]+)?)*$/;

const BASE_URL = "https://ctppdata.transportation.org/api";

const YEAR_LABEL: Record<number, string> = {
  2000: "2000",
  2010: "2006–2010 ACS 5-Year",
  2016: "2012–2016 ACS 5-Year",
  2021: "2017–2021 ACS 5-Year",
};

const schema = z.object({
  language: z
    .enum(["r", "python"])
    .describe(
      "Target language for the generated code. 'r' uses httr2 + dplyr; 'python' uses requests + pandas.",
    ),
  year: z
    .union([z.literal(2000), z.literal(2010), z.literal(2016), z.literal(2021)])
    .describe("Dataset year. One of: 2000, 2010, 2016, 2021."),
  get: z
    .string()
    .max(500)
    .regex(/^[A-Za-z0-9_,()\s]+$/)
    .describe(
      "Comma-separated variable names to retrieve, e.g. 'B101100_e1,B101100_m1'. " +
        "Use get-table-variables to discover variable names.",
    ),
  forGeo: z
    .string()
    .regex(GEO_UNIT)
    .describe(
      "Geography level and optional FIPS for the 'for' parameter. " +
        "Format: '<level>:<fips>' or '<level>:*' for all. Examples: 'county:*', 'county:033', 'state:06'.",
    ),
  inGeo: z
    .string()
    .regex(GEO_LIST)
    .optional()
    .describe(
      "Parent geography constraint. Format: '<level>:<fips>' or space-separated, e.g. 'state:53'.",
    ),
  dForGeo: z
    .string()
    .regex(GEO_UNIT)
    .optional()
    .describe(
      "Destination geography for flow/O-D tables (B3xx), maps to 'd-for'. Same format as forGeo.",
    ),
  dInGeo: z
    .string()
    .regex(GEO_LIST)
    .optional()
    .describe("Destination parent geography for flow/O-D tables, maps to 'd-in'."),
  page: z.number().int().positive().max(10_000).optional().default(1),
  size: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .default(25)
    .describe("Records per page. Max 1000. Ignored when fetchAll is true."),
  format: z
    .enum(["list", "array"])
    .optional()
    .default("list")
    .describe("'list' returns objects with named keys (default). 'array' returns header + rows."),
  annotate: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Fetch variable labels from the CTPP API and embed them as comments. Uses your API key.",
    ),
  fetchAll: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Generate a pagination loop that fetches all records instead of a single page. Sets page size to 1000.",
    ),
});

type Args = z.infer<typeof schema>;

interface Variable {
  name: string;
  label: string;
}

interface VariablesResponse {
  data: Variable[];
}

// Extract the table code from the 'get' parameter.
// Handles both group(TABLE_CODE) and variable-name (TABLE_CODE_e1,...) syntax.
function extractTableCode(get: string): string | null {
  const groupMatch = get.match(/group\(([A-Za-z][A-Za-z0-9]+)\)/i);
  if (groupMatch) return groupMatch[1].toUpperCase();
  const varMatch = get.match(/([A-Za-z][A-Za-z0-9]+)_[em]\d/i);
  if (varMatch) return varMatch[1].toUpperCase();
  return null;
}

async function fetchLabels(
  tableCode: string,
  year: number,
  apiKey: string,
): Promise<Map<string, string>> {
  try {
    const resp = await ctppFetch<VariablesResponse>(
      `/groups/${tableCode}/variables`,
      { year },
      apiKey,
    );
    const map = new Map<string, string>();
    for (const v of resp.data ?? []) {
      if (v.name && v.label) map.set(v.name.toLowerCase(), v.label);
    }
    return map;
  } catch {
    return new Map();
  }
}

// Build a "# Variable labels:" comment block.
// For group() syntax, lists all labels; for explicit variables, lists only the requested ones.
function buildLabelComments(get: string, labels: Map<string, string>): string {
  if (labels.size === 0) return "";

  const isGroup = /^group\(/i.test(get.trim());
  let entries: [string, string][];

  if (isGroup) {
    entries = [...labels.entries()];
  } else {
    entries = get
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .flatMap((v) => {
        const label = labels.get(v);
        return label ? ([[v, label]] as [string, string][]) : [];
      });
  }

  if (entries.length === 0) return "";

  return (
    "# Variable labels:\n" +
    entries.map(([k, v]) => `#   ${k}: ${v}`).join("\n") +
    "\n\n"
  );
}

// Core API params — geography and format, no page/size (handled per-mode).
function coreParams(args: Args): [string, string][] {
  const entries: [string, string][] = [
    ["get", args.get],
    ["for", args.forGeo],
  ];
  if (args.inGeo) entries.push(["in", args.inGeo]);
  if (args.dForGeo) entries.push(["d-for", args.dForGeo]);
  if (args.dInGeo) entries.push(["d-in", args.dInGeo]);
  entries.push(["format", args.format ?? "list"]);
  return entries;
}

// R keys that need backtick quoting (reserved words or hyphens).
function rKey(k: string): string {
  return k === "for" || k === "in" || k.includes("-") ? `\`${k}\`` : k;
}

function generateR(args: Args, labels: Map<string, string>): string {
  const yearLabel = YEAR_LABEL[args.year];
  const isFlow = Boolean(args.dForGeo);
  const labelBlock = buildLabelComments(args.get, labels);
  const core = coreParams(args);

  const header =
    `library(httr2)\n` +
    `library(dplyr)\n\n` +
    `# CTPP API key — set via environment variable:\n` +
    `#   Sys.setenv(CTPP_API_KEY = "your_key_here")\n` +
    `api_key <- Sys.getenv("CTPP_API_KEY")\n` +
    `if (nchar(api_key) == 0) stop("CTPP_API_KEY environment variable is not set")\n\n`;

  if (args.fetchAll) {
    // Inside the repeat block: resp at 2-space indent, pipes at 4, params at 6.
    const allEntries: [string, string][] = [
      ...core,
      ["page", "page"],
      ["size", "1000L"],
    ];
    const maxKeyLen = Math.max(...allEntries.map(([k]) => rKey(k).length));
    const paramLines = allEntries
      .map(([k, v]) => {
        const key = rKey(k).padEnd(maxKeyLen);
        // 'page' and 'size' are bare R expressions, everything else is a string literal.
        const val = k === "page" || k === "size" ? v : `"${v}"`;
        return `      ${key} = ${val}`;
      })
      .join(",\n");

    const desc = isFlow ? "Flow (origin-destination) — all pages" : "Fetch all pages";
    return (
      header +
      labelBlock +
      `# ${desc} — ${yearLabel} CTPP\n` +
      `all_data <- list()\n` +
      `page <- 1L\n\n` +
      `repeat {\n` +
      `  resp <- request("${BASE_URL}") |>\n` +
      `    req_url_path_append("data/${args.year}") |>\n` +
      `    req_url_query(\n` +
      paramLines + "\n" +
      `    ) |>\n` +
      `    req_headers("X-API-Key" = api_key) |>\n` +
      `    req_perform()\n\n` +
      `  result <- resp_body_json(resp)\n` +
      `  all_data <- c(all_data, result$data)\n` +
      `  if (length(result$data) < 1000L) break\n` +
      `  page <- page + 1L\n` +
      `}\n\n` +
      `df <- bind_rows(all_data)\n`
    );
  } else {
    // Single page: resp at column 0, pipes at 2-space indent, params at 4.
    const allEntries: [string, string | number][] = [
      ...core,
      ["page", args.page ?? 1],
      ["size", args.size ?? 25],
    ];
    const maxKeyLen = Math.max(...allEntries.map(([k]) => rKey(k as string).length));
    const paramLines = allEntries
      .map(([k, v]) => {
        const key = rKey(k as string).padEnd(maxKeyLen);
        const val = typeof v === "number" ? String(v) : `"${v}"`;
        return `    ${key} = ${val}`;
      })
      .join(",\n");

    const desc = isFlow ? "Flow (origin-destination) data" : "Data fetch";
    return (
      header +
      labelBlock +
      `# ${desc} — ${yearLabel} CTPP\n` +
      `resp <- request("${BASE_URL}") |>\n` +
      `  req_url_path_append("data/${args.year}") |>\n` +
      `  req_url_query(\n` +
      paramLines + "\n" +
      `  ) |>\n` +
      `  req_headers("X-API-Key" = api_key) |>\n` +
      `  req_perform()\n\n` +
      `result <- resp_body_json(resp)\n` +
      `df <- bind_rows(result$data)\n`
    );
  }
}

function generatePython(args: Args, labels: Map<string, string>): string {
  const yearLabel = YEAR_LABEL[args.year];
  const isFlow = Boolean(args.dForGeo);
  const labelBlock = buildLabelComments(args.get, labels);
  const core = coreParams(args);

  const header =
    `import os\n` +
    `import requests\n` +
    `import pandas as pd\n\n` +
    `# CTPP API key — set via environment variable:\n` +
    `#   export CTPP_API_KEY="your_key_here"\n` +
    `api_key = os.environ.get("CTPP_API_KEY", "")\n` +
    `if not api_key:\n` +
    `    raise ValueError("CTPP_API_KEY environment variable is not set")\n\n`;

  if (args.fetchAll) {
    // fetchAll: page/size managed in the loop, not in static params.
    const maxValLen = Math.max(...core.map(([, v]) => JSON.stringify(v).length));
    const paramLines = core
      .map(([k, v]) => `    "${k}": ${JSON.stringify(v).padEnd(maxValLen)}`)
      .join(",\n");

    const desc = isFlow ? "Flow (origin-destination) — all pages" : "Fetch all pages";
    return (
      header +
      labelBlock +
      `# ${desc} — ${yearLabel} CTPP\n` +
      `params = {\n${paramLines},\n}\n\n` +
      `all_data = []\n` +
      `page = 1\n` +
      `size = 1000\n\n` +
      `while True:\n` +
      `    resp = requests.get(\n` +
      `        "${BASE_URL}/data/${args.year}",\n` +
      `        params={**params, "page": page, "size": size},\n` +
      `        headers={"X-API-Key": api_key},\n` +
      `        timeout=30,\n` +
      `    )\n` +
      `    resp.raise_for_status()\n` +
      `    result = resp.json()\n` +
      `    batch = result["data"]\n` +
      `    all_data.extend(batch)\n` +
      `    if len(batch) < size:\n` +
      `        break\n` +
      `    page += 1\n\n` +
      `df = pd.DataFrame(all_data)\n`
    );
  } else {
    const allEntries: [string, string | number][] = [
      ...core,
      ["page", args.page ?? 1],
      ["size", args.size ?? 25],
    ];
    const maxValLen = Math.max(...allEntries.map(([, v]) => JSON.stringify(v).length));
    const paramLines = allEntries
      .map(([k, v]) => `    "${k}": ${JSON.stringify(v).padEnd(maxValLen)}`)
      .join(",\n");

    const desc = isFlow ? "Flow (origin-destination) data" : "Data fetch";
    return (
      header +
      labelBlock +
      `# ${desc} — ${yearLabel} CTPP\n` +
      `params = {\n${paramLines},\n}\n\n` +
      `resp = requests.get(\n` +
      `    "${BASE_URL}/data/${args.year}",\n` +
      `    params=params,\n` +
      `    headers={"X-API-Key": api_key},\n` +
      `    timeout=30,\n` +
      `)\n` +
      `resp.raise_for_status()\n\n` +
      `df = pd.DataFrame(resp.json()["data"])\n`
    );
  }
}

export class GenerateCode extends BaseTool<typeof schema> {
  readonly name = "generate-code";
  readonly description =
    "Generate a self-contained R or Python script that replicates a fetch-ctpp-data query. " +
    "Use the same year/get/forGeo/inGeo/dForGeo/dInGeo parameters as fetch-ctpp-data. " +
    "R output uses httr2 + dplyr; Python output uses requests + pandas. " +
    "Set annotate=true to embed variable labels as comments (requires API key). " +
    "Set fetchAll=true to generate a pagination loop that fetches all records.";
  readonly schema = schema;
  override readonly requiresApiKey = false;

  async run(args: Args, apiKey: string): Promise<CallToolResult> {
    let labels = new Map<string, string>();
    if (args.annotate && apiKey) {
      const tableCode = extractTableCode(args.get);
      if (tableCode) {
        labels = await fetchLabels(tableCode, args.year, apiKey);
      }
    }
    const code = args.language === "r" ? generateR(args, labels) : generatePython(args, labels);
    return this.ok(code);
  }
}
