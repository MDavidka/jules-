import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";

import { loadConnectedGitHubToken } from "@/lib/github-token.server";
import { createSshAction } from "@/lib/ssh.server";
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
  "ssh_execute_command",
  "ssh_write_file",
  "mcpsshconnect",
  "mcpsshexec",
]);

/**
 * Creates the MCP server used by the assistant. GitHub tools are read-only;
 * SSH tools operate only on explicitly saved instances and queue critical work
 * for approval before execution. Secrets never pass through the model.
 */
function createRepositoryMcpServer(accessToken: string | null) {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "GitHub context is read-only. SSH actions target saved instances only. Read-only commands may run directly; privileged commands and file edits must remain pending until explicitly approved.",
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

  server.registerTool(
    "mcpsshconnect",
    {
      title: "Connect to VPS instance",
      description: "Verify SSH access to a saved VPS instance before a multi-step task.",
      inputSchema: { instanceId: z.string().min(1).max(100) },
    },
    async ({ instanceId }) => ({
      content: [{ type: "text", text: JSON.stringify(await createSshAction({ instanceId, kind: "command", command: "printf connected" }), null, 2) }],
    }),
  );

  server.registerTool(
    "mcpsshexec",
    {
      title: "Execute VPS command",
      description: "Execute a command on a saved VPS instance. Critical commands return a pending approval request.",
      inputSchema: {
        instanceId: z.string().min(1).max(100),
        command: z.string().min(1).max(10000),
        runAsRoot: z.boolean().optional(),
      },
    },
    async ({ instanceId, command, runAsRoot }) => ({
      content: [{ type: "text", text: JSON.stringify(await createSshAction({ instanceId, kind: "command", command, runAsRoot: runAsRoot === true }), null, 2) }],
    }),
  );

  server.registerTool(
    "ssh_execute_command",
    {
      title: "Execute an SSH command",
      description: "Run a command on a saved SSH instance. Privileged or destructive commands return a pending approval request.",
      inputSchema: {
        instanceId: z.string().min(1).max(100),
        command: z.string().min(1).max(10000),
        runAsRoot: z.boolean().optional(),
      },
    },
    async ({ instanceId, command, runAsRoot }) => ({
      content: [{ type: "text", text: JSON.stringify(await createSshAction({ instanceId, kind: "command", command, runAsRoot: runAsRoot === true }), null, 2) }],
    }),
  );

  server.registerTool(
    "ssh_write_file",
    {
      title: "Write a remote file",
      description: "Request a full file replacement on a saved SSH instance. Always requires explicit approval.",
      inputSchema: {
        instanceId: z.string().min(1).max(100),
        path: z.string().startsWith("/").max(2000),
        content: z.string().max(200000),
        runAsRoot: z.boolean().optional(),
      },
    },
    async ({ instanceId, path, content, runAsRoot }) => ({
      content: [{ type: "text", text: JSON.stringify(await createSshAction({ instanceId, kind: "write_file", path, content, runAsRoot: runAsRoot === true }), null, 2) }],
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

  const accessToken = name.startsWith("ssh_") ? null : await loadConnectedGitHubToken();
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
