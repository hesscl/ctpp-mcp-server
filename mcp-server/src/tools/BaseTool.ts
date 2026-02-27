import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type { CallToolResult };

export abstract class BaseTool<TSchema extends z.ZodTypeAny> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: TSchema;

  /** Set to false for tools that only use the local DB and don't need the CTPP API key. */
  readonly requiresApiKey: boolean = true;

  abstract run(args: z.infer<TSchema>, apiKey: string): Promise<CallToolResult>;

  protected ok(text: string): CallToolResult {
    return { content: [{ type: "text", text }] };
  }

  protected err(message: string): CallToolResult {
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
