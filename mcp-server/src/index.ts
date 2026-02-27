import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "./tools/index.js";
import { createServer as httpCreateServer, IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

// Suppress stdout logging — stdio transport uses stdout for MCP protocol messages.
// Route debug output to stderr instead.
if (process.env.DEBUG_LOGS !== "true") {
  console.log = (...args: unknown[]) =>
    process.stderr.write("[ctpp-mcp] " + args.join(" ") + "\n");
}

const CTPP_API_KEY = process.env.CTPP_API_KEY ?? "";
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_SESSIONS = 100;

function createMcpServer(): Server {
  const server = new Server(
    { name: "ctpp-mcp", version: "1.1.0" },
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

  return server;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString();
  return raw ? (JSON.parse(raw) as unknown) : undefined;
}

const mcpTransport = process.env.MCP_TRANSPORT ?? "stdio";

if (mcpTransport === "http") {
  const port = parseInt(process.env.PORT ?? "3000", 10);

  if (!MCP_AUTH_TOKEN) {
    process.stderr.write(
      "[ctpp-mcp] WARNING: MCP_AUTH_TOKEN is not set — HTTP endpoint is unauthenticated\n",
    );
  }

  type Session = { server: Server; transport: StreamableHTTPServerTransport };
  const sessions = new Map<string, Session>();

  const httpServer = httpCreateServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Bearer token authentication (opt-in via MCP_AUTH_TOKEN).
    if (MCP_AUTH_TOKEN) {
      const authHeader = req.headers["authorization"];
      if (authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Route to an existing session.
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }
      let body: unknown;
      try {
        body = req.method === "POST" ? await readBody(req) : undefined;
      } catch {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request body too large" }));
        return;
      }
      await session.transport.handleRequest(req, res, body);
      return;
    }

    // Only POST is allowed for new sessions (initialize request).
    if (req.method !== "POST") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session ID required" }));
      return;
    }

    // Reject new sessions when at capacity.
    if (sessions.size >= MAX_SESSIONS) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many sessions" }));
      return;
    }

    // New session.
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request body too large" }));
      return;
    }
    const sessionTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = createMcpServer();
    await server.connect(sessionTransport);
    await sessionTransport.handleRequest(req, res, body);

    if (sessionTransport.sessionId) {
      sessions.set(sessionTransport.sessionId, {
        server,
        transport: sessionTransport,
      });
      sessionTransport.onclose = () =>
        sessions.delete(sessionTransport.sessionId!);
    }
  });

  httpServer.listen(port, () => {
    process.stderr.write(`CTPP MCP server (HTTP) listening on port ${port}\n`);
  });
} else {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("CTPP MCP server started\n");
}
