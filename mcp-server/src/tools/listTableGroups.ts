import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { ctppFetch } from "../apiClient.js";

const schema = z.object({
  year: z
    .union([z.literal(2000), z.literal(2010), z.literal(2016), z.literal(2021)])
    .describe(
      "Dataset year. One of: 2000 (2000 data), 2010 (2006-2010 ACS), 2016 (2012-2016 ACS), 2021 (2017-2021 ACS).",
    ),
  keyword: z
    .string()
    .optional()
    .describe("Optional keyword to filter groups by name or description."),
  page: z.number().int().positive().max(10_000).optional().default(1),
  size: z.number().int().positive().max(200).optional().default(50),
});

interface Group {
  name: string;
  description: string;
  universe?: string;
  category?: string;
  summaryLevels?: string[];
}

interface GroupsResponse {
  size: number;
  page: number;
  total: number;
  data: Group[];
}

export class ListTableGroups extends BaseTool<typeof schema> {
  readonly name = "list-table-groups";
  readonly description =
    "List CTPP table groups (tables) available for a given dataset year. " +
    "Each group corresponds to a thematic table (e.g., means of transportation, travel time, occupation). " +
    "Table name prefix conventions: B1xx = residence, B2xx = workplace, B3xx = flow/O-D. " +
    "Supports keyword search and pagination.";
  readonly schema = schema;

  async run(args: z.infer<typeof schema>, apiKey: string): Promise<CallToolResult> {
    const params: Record<string, string | number> = {
      page: args.page ?? 1,
      size: args.size ?? 50,
    };
    if (args.keyword) params.keyword = args.keyword;

    const resp = await ctppFetch<GroupsResponse>(
      `/datasets/${args.year}/groups`,
      params,
      apiKey,
    );

    return this.ok(
      JSON.stringify(
        {
          total: resp.total,
          page: resp.page,
          size: resp.size,
          groups: resp.data,
        },
        null,
        2,
      ),
    );
  }
}
