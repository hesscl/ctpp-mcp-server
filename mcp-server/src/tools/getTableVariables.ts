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

interface Variable {
  name: string;
  label: string;
  group: string;
}

interface VariablesResponse {
  size: number;
  page: number;
  total: number;
  data: Variable[];
}

export class GetTableVariables extends BaseTool<typeof schema> {
  readonly name = "get-table-variables";
  readonly description =
    "Get variable definitions for a CTPP table group. Returns both estimate variables " +
    "(suffix _e, e.g. B101100_e1) and margin-of-error variables (suffix _m, e.g. B101100_m1). " +
    "Use variable names in the 'get' parameter of fetch-ctpp-data.";
  readonly schema = schema;

  async run(args: z.infer<typeof schema>, apiKey: string): Promise<CallToolResult> {
    const resp = await ctppFetch<VariablesResponse>(
      `/groups/${args.groupId}/variables`,
      { year: args.year },
      apiKey,
    );
    return this.ok(JSON.stringify(resp.data, null, 2));
  }
}
