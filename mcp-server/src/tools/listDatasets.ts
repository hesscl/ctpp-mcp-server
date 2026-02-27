import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { ctppFetch } from "../apiClient.js";

const schema = z.object({});

interface Dataset {
  year: number;
  title: string;
  description: string;
  source: string;
}

interface DatasetsResponse {
  size: number;
  page: number;
  total: number;
  data: Dataset[];
}

export class ListDatasets extends BaseTool<typeof schema> {
  readonly name = "list-datasets";
  readonly description =
    "List all available CTPP dataset vintages with their year ranges, titles, and source descriptions. " +
    "Use this to discover which dataset years are available before querying data.";
  readonly schema = schema;

  async run(_args: z.infer<typeof schema>, apiKey: string): Promise<CallToolResult> {
    const resp = await ctppFetch<DatasetsResponse>("/datasets", {}, apiKey);
    return this.ok(JSON.stringify(resp.data, null, 2));
  }
}
