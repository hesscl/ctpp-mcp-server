import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";

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
    .describe("Number of records per page. Max 1000."),
  format: z
    .enum(["list", "array"])
    .optional()
    .default("list")
    .describe("'list' returns objects with named keys (default). 'array' returns header + rows."),
});

type Args = z.infer<typeof schema>;

function buildParams(args: Args): Record<string, string | number> {
  const params: Record<string, string | number> = {
    get: args.get,
    for: args.forGeo,
    page: args.page ?? 1,
    size: args.size ?? 25,
    format: args.format ?? "list",
  };
  if (args.inGeo) params["in"] = args.inGeo;
  if (args.dForGeo) params["d-for"] = args.dForGeo;
  if (args.dInGeo) params["d-in"] = args.dInGeo;
  return params;
}

// R keys that need backtick quoting (reserved words or contain hyphens)
function rKey(k: string): string {
  return k === "for" || k === "in" || k.includes("-") ? `\`${k}\`` : k;
}

function generateR(args: Args): string {
  const params = buildParams(args);
  const yearLabel = YEAR_LABEL[args.year];
  const isFlow = Boolean(args.dForGeo);

  const entries = Object.entries(params);
  const maxKeyLen = Math.max(...entries.map(([k]) => rKey(k).length));
  const paramLines = entries
    .map(([k, v]) => {
      const key = rKey(k).padEnd(maxKeyLen);
      const val = typeof v === "string" ? `"${v}"` : String(v);
      return `    ${key} = ${val}`;
    })
    .join(",\n");

  return `library(httr2)
library(dplyr)

# CTPP API key — set via environment variable:
#   Sys.setenv(CTPP_API_KEY = "your_key_here")
api_key <- Sys.getenv("CTPP_API_KEY")
if (nchar(api_key) == 0) stop("CTPP_API_KEY environment variable is not set")

# ${isFlow ? "Flow (origin-destination) data" : "Data fetch"} — ${yearLabel} CTPP
resp <- request("${BASE_URL}") |>
  req_url_path_append("data/${args.year}") |>
  req_url_query(
${paramLines}
  ) |>
  req_headers("X-API-Key" = api_key) |>
  req_perform()

result <- resp_body_json(resp)
df <- bind_rows(result$data)
`;
}

function generatePython(args: Args): string {
  const params = buildParams(args);
  const yearLabel = YEAR_LABEL[args.year];
  const isFlow = Boolean(args.dForGeo);

  const entries = Object.entries(params);
  const maxValLen = Math.max(...entries.map(([, v]) => JSON.stringify(v).length));
  const paramLines = entries
    .map(([k, v]) => {
      const val = JSON.stringify(v).padEnd(maxValLen);
      return `    "${k}": ${val}`;
    })
    .join(",\n");

  return `import os
import requests
import pandas as pd

# CTPP API key — set via environment variable:
#   export CTPP_API_KEY="your_key_here"
api_key = os.environ.get("CTPP_API_KEY", "")
if not api_key:
    raise ValueError("CTPP_API_KEY environment variable is not set")

# ${isFlow ? "Flow (origin-destination) data" : "Data fetch"} — ${yearLabel} CTPP
params = {
${paramLines},
}

resp = requests.get(
    "${BASE_URL}/data/${args.year}",
    params=params,
    headers={"X-API-Key": api_key},
    timeout=30,
)
resp.raise_for_status()

df = pd.DataFrame(resp.json()["data"])
`;
}

export class GenerateCode extends BaseTool<typeof schema> {
  readonly name = "generate-code";
  readonly description =
    "Generate a self-contained R or Python script that replicates a fetch-ctpp-data query. " +
    "Use the same year/get/forGeo/inGeo/dForGeo/dInGeo parameters as fetch-ctpp-data. " +
    "R output uses httr2 + dplyr; Python output uses requests + pandas. " +
    "The generated script reads CTPP_API_KEY from the environment and returns a data frame.";
  readonly schema = schema;
  override readonly requiresApiKey = false;

  async run(args: Args, _apiKey: string): Promise<CallToolResult> {
    const code = args.language === "r" ? generateR(args) : generatePython(args);
    return this.ok(code);
  }
}
