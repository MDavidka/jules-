import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";

import { loadConnectedGitHubToken } from "@/lib/github-token.server";
import {
  inspectPublicRepository,
  listRepositoryTree,
  readRepositoryFile,
  validateGitHubConnection,
} from "@/lib/nvidia-tools.server";

const SERVER_INFO = { name: "jules-plus-github", version: "1.0.0" };
const REPOSITORY_TOOLS = new Set([
  "inspect_repository",
  "list_repository_files",
  "read_repository_file",
  "githubgetfile",
  "validate_github_connection",
]);

/**
 * Creates the repository MCP server used by the assistant. The server exposes
 * only read-only GitHub tools; it never executes commands from a repository or
 * accepts arbitrary URLs. The connected OAuth token is kept inside the server
 * callback and is never passed through the model or returned to the client.
 */
function createRepositoryMcpServer(accessToken: string | null) {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Read-only GitHub repository context. List files before reading a file, and use repository-relative paths.",
  });

  server.registerTool(
    "validate_github_connection",
    {
      title: "Validate connected GitHub account",
      description: "Verify the connected GitHub token with GitHub and report the account login and repository-read capability.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await validateGitHubConnection(accessToken ?? undefined), null, 2) }],
    }),
  );

  server.registerTool(
    "inspect_repository",
    {
      title: "Inspect GitHub repository",
      description: "Read repository metadata, its README, and common dependency manifests.",
      inputSchema: { repository: z.string().min(1).max(500) },
    },
    async ({ repository }) => ({
      content: [{ type: "text", text: await inspectPublicRepository(repository, accessToken ?? undefined) }],
    }),
  );

  server.registerTool(
    "list_repository_files",
    {
      title: "List GitHub repository files",
      description: "List readable source files in a GitHub repository before selecting files to inspect.",
      inputSchema: {
        repository: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(400).optional(),
      },
    },
    async ({ repository, limit }) => ({
      content: [{ type: "text", text: await listRepositoryTree(repository, limit ?? 400, accessToken ?? undefined) }],
    }),
  );

  server.registerTool(
    "githubgetfile",
    {
      title: "Read GitHub raw file (compatibility)",
      description: "Compatibility alias for reading exact repository file content using the githubgetfile schema.",
      inputSchema: {
        repository: z.string().min(1).max(500),
        filePath: z.string().min(1).max(500),
        ref: z.string().min(1).max(200).optional(),
      },
    },
    async ({ repository, filePath, ref }) => ({
      content: [{ type: "text", text: await readRepositoryFile(repository, filePath, accessToken ?? undefined, ref) }],
    }),
  );

  server.registerTool(
    "read_repository_file",
    {
      title: "Read GitHub repository file",
      description: "Read one repository-relative text file from the selected GitHub repository.",
      inputSchema: {
        repository: z.string().min(1).max(500),
        path: z.string().min(1).max(500),
        ref: z.string().min(1).max(200).optional(),
      },
    },
    async ({ repository, path, ref }) => ({
      content: [{ type: "text", text: await readRepositoryFile(repository, path, accessToken ?? undefined, ref) }],
    }),
  );

  return server;
}

/**
 * Calls a repository tool through MCP's initialize/listTools/callTool
 * protocol, using the official SDK and an in-process linked transport. Keeping
 * the transport in-process avoids starting a child process per request while
 * still exercising the same protocol boundary as an external MCP host.
 */
export async function callRepositoryMcpTool(
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<string> {
  if (!REPOSITORY_TOOLS.has(name)) return `Unknown repository MCP tool: ${name}.`;

  const accessToken = await loadConnectedGitHubToken();
  const server = createRepositoryMcpServer(accessToken);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "jules-plus-agent", version: "1.0.0" });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const available = await client.listTools();
    if (!available.tools.some((tool) => tool.name === name)) {
      throw new Error(`Repository MCP tool is unavailable: ${name}.`);
    }

    const result = await client.callTool({ name, arguments: argumentsValue });
    const content = Array.isArray(result.content)
      ? (result.content as Array<{ type?: unknown; text?: unknown }>)
      : [];
    return content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text as string)
      .join("\n\n") || "The repository MCP tool returned no text.";
  } catch (error) {
    return `Repository MCP request failed: ${error instanceof Error ? error.message : "unknown error"}.`;
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
