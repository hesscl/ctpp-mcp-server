import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { ctppFetch } from "../apiClient.js";

const schema = z.object({
  year: z
    .union([z.literal(2000), z.literal(2010), z.literal(2016), z.literal(2021)])
    .describe("Dataset year. One of: 2000, 2010, 2016, 2021."),
  get: z
    .string()
    .describe(
      "Comma-separated variable names to retrieve, e.g. 'B101100_e1,B101100_m1'. " +
        "Use get-table-variables to discover variable names for a group.",
    ),
  forGeo: z
    .string()
    .describe(
      "Geography level and optional FIPS filter for the 'for' parameter. " +
        "Format: '<level>:<fips>' or '<level>:*' for all. " +
        "Examples: 'county:*' (all counties), 'county:037' (specific county), 'state:06'.",
    ),
  inGeo: z
    .string()
    .optional()
    .describe(
      "Parent geography constraint for the 'in' parameter. " +
        "Format: '<level>:<fips>' or multiple space-separated, e.g. 'state:06' or 'state:06 county:037'. " +
        "Use resolve-geography-fips to look up FIPS codes by name.",
    ),
  dForGeo: z
    .string()
    .optional()
    .describe(
      "Destination geography for flow/O-D tables (maps to 'd-for' API param). " +
        "Same format as forGeo. Required for B3xx flow tables.",
    ),
  dInGeo: z
    .string()
    .optional()
    .describe(
      "Destination parent geography for flow/O-D tables (maps to 'd-in' API param). " +
        "Same format as inGeo.",
    ),
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
    .describe(
      "'list' returns objects with named keys (default). " +
        "'array' returns a header row followed by data rows.",
    ),
});

export class FetchCtppData extends BaseTool<typeof schema> {
  readonly name = "fetch-ctpp-data";
  readonly description =
    "Fetch CTPP statistical data for a given year, variables, and geography. " +
    "Supports residence (B1xx), workplace (B2xx), and flow/origin-destination (B3xx) tables. " +
    "For flow tables, provide dForGeo and optionally dInGeo. " +
    "Results are paginated — use page/size to navigate large result sets. " +
    "Tip: For large tract-to-tract flow queries, batch by origin county to avoid timeouts.";
  readonly schema = schema;

  async run(args: z.infer<typeof schema>, apiKey: string): Promise<CallToolResult> {
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

    const data = await ctppFetch<unknown>(`/data/${args.year}`, params, apiKey);
    return this.ok(JSON.stringify(data, null, 2));
  }
}
