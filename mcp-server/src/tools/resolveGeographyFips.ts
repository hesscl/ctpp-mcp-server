import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { searchGeographies } from "../geo.js";

const schema = z.object({
  name: z
    .string()
    .max(200, "Name must be 200 characters or fewer")
    .describe(
      "Place name to search for, e.g. 'California', 'Los Angeles County', 'Seattle city'.",
    ),
  type: z
    .enum(["state", "county"])
    .optional()
    .describe("Optional geography type to restrict search: state or county."),
  limit: z
    .number()
    .int()
    .positive()
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of matches to return (default 5, max 10)."),
});

export class ResolveGeographyFips extends BaseTool<typeof schema> {
  readonly name = "resolve-geography-fips";
  readonly description =
    "Convert a place name to FIPS codes using fuzzy matching against a bundled geography database. " +
    "Returns pre-formatted 'forGeo' and 'inGeo' values ready to paste into fetch-ctpp-data. " +
    "Supports states and counties. No external database required.";
  readonly schema = schema;
  readonly requiresApiKey = false;

  async run(args: z.infer<typeof schema>, _apiKey: string): Promise<CallToolResult> {
    const matches = searchGeographies(args.name, args.type, args.limit ?? 5);

    if (matches.length === 0) {
      return this.ok(
        `No geography matches found for "${args.name}". Try a different spelling.`,
      );
    }

    return this.ok(JSON.stringify(matches, null, 2));
  }
}
