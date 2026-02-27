import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { ctppFetch } from "../apiClient.js";

const schema = z.object({
  groupId: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid group ID — must contain only letters, digits, hyphens, and underscores")
    .describe("Table/group ID (e.g. 'B101100')."),
  year: z
    .union([z.literal(2000), z.literal(2010), z.literal(2016), z.literal(2021)])
    .describe("Dataset year. One of: 2000, 2010, 2016, 2021."),
});

interface Geography {
  geoType: string;
  level: string;
  name: string;
  category: string;
}

interface GeographiesResponse {
  size: number;
  page: number;
  total: number;
  data: Geography[];
}

export class GetGroupGeographies extends BaseTool<typeof schema> {
  readonly name = "get-group-geographies";
  readonly description =
    "Get available geography summary levels for a CTPP table group (e.g., state, county, tract). " +
    "Use the 'level' field value in the 'forGeo' parameter of fetch-ctpp-data.";
  readonly schema = schema;

  async run(args: z.infer<typeof schema>, apiKey: string): Promise<CallToolResult> {
    const resp = await ctppFetch<GeographiesResponse>(
      `/groups/${args.groupId}/geographies`,
      { year: args.year },
      apiKey,
    );
    return this.ok(JSON.stringify(resp.data, null, 2));
  }
}
