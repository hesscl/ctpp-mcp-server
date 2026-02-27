import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "./tools/index.js";

// Suppress stdout logging — stdio transport uses stdout for MCP protocol messages.
// Route debug output to stderr instead.
if (process.env.DEBUG_LOGS !== "true") {
  console.log = (...args: unknown[]) =>
    process.stderr.write("[ctpp-mcp] " + args.join(" ") + "\n");
}

const CTPP_API_KEY = process.env.CTPP_API_KEY ?? "";

const server = new Server(
  { name: "ctpp-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.schema) as Record<string, unknown>,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  if (tool.requiresApiKey && !CTPP_API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: "Error: CTPP_API_KEY environment variable is not set. Provide it via the MCP client config or environment.",
        },
      ],
      isError: true,
    };
  }

  try {
    const parsed = tool.schema.parse(args ?? {});
    return await tool.run(parsed, CTPP_API_KEY);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("CTPP MCP server started\n");
