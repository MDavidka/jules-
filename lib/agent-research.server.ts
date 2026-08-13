import {
  readWebPage,
  searchWeb,
} from "@/lib/nvidia-tools.server";
import { callRepositoryMcpTool } from "@/lib/repository-mcp.server";
import { NVIDIA_CHAT_COMPLETIONS_URL } from "@/lib/nvidia.server";
import { rateLimitedFetch } from "@/lib/rate-limiter.server";
import type { AgentActivity } from "@/lib/agent-activity";

/** Hard ceiling on tool-calling rounds, so a confused model cannot loop forever. */
const MAX_STEPS = 4;
const MAX_TOOL_CALLS_PER_STEP = 2;
const STEP_TIMEOUT_MS = 25_000;

const TOOL_ACTIVITIES: Record<string, AgentActivity> = {
  search_web: "searching",
  read_web_page: "reading",
  list_repository_files: "inspecting",
  read_repository_file: "inspecting",
  githubgetfile: "inspecting",
  inspect_repository: "inspecting",
  validate_github_connection: "inspecting",
};

/** OpenAI-compatible tool definitions advertised to the model. */
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the public web for current information, documentation, or error messages. Returns titles, URLs, and snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_web_page",
      description: "Fetch a public web page and return its readable text. Use after search_web to read a promising result.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) URL." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_repository_files",
      description:
        "List the file tree of a public GitHub repository. Use this first when exploring a repository, then read the files that matter.",
      parameters: {
        type: "object",
        properties: {
          repository: {
            type: "string",
            description: "A GitHub URL, `owner/repo`, or a Jules source name.",
          },
        },
        required: ["repository"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_repository_file",
      description: "Read one exact raw file from a public GitHub repository. For compatibility, incoming githubgetfile calls with filePath are also accepted.",
      parameters: {
        type: "object",
        properties: {
          repository: { type: "string", description: "A GitHub URL, `owner/repo`, or a Jules source name." },
          path: { type: "string", description: "Repository-relative file path." },
          ref: { type: "string", description: "Optional branch, tag, or commit SHA. Defaults to the repository default branch." },
        },
        required: ["repository", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_github_connection",
      description: "Validate the connected GitHub account and confirm it has repository-read capability before private-repository investigation.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_repository",
      description: "Get a repository overview: metadata, README, and dependency manifests.",
      parameters: {
        type: "object",
        properties: {
          repository: { type: "string", description: "A GitHub URL, `owner/repo`, or a Jules source name." },
        },
        required: ["repository"],
      },
    },
  },
] as const;

interface ToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ResearchStep {
  tool: string;
  input: Record<string, unknown>;
  output: string;
}

export interface DeepResearchOptions {
  apiKey: string;
  model: string;
  /** The user's request, already including any repository/memory context. */
  prompt: string;
  /** Currently selected repository, used as the default research target. */
  source?: string;
  /** Reports the current phase so the UI can update its status row. */
  onActivity?: (activity: AgentActivity) => void;
  /** Reports each completed tool call, for transcript/debug purposes. */
  onStep?: (step: ResearchStep) => void;
}

/**
 * Multi-step research pass. The model is given web-search and repository tools
 * and loops until it stops requesting calls, then its notes are returned as
 * context for the main streamed answer.
 *
 * Failures degrade to an empty string: research is an enhancement, never a
 * hard requirement for replying to the user.
 */
export async function runDeepResearch(options: DeepResearchOptions): Promise<string> {
  const { apiKey, model, prompt, source, onActivity, onStep } = options;

  const messages: AgentMessage[] = [
    {
      role: "system",
      content: [
        "You are the research stage of a coding assistant.",
        "Investigate the user's request using the provided tools before anyone answers.",
        "Work in small steps: validate the connected GitHub account when repository access matters, list repository files before reading them, and search the web before reading a page.",
        "When checking code, use read_repository_file to retrieve the exact raw file content and include the ref returned by the tool in your reasoning; do not infer file contents from filenames or summaries.",
        source ? `The user's currently selected repository is: ${source}` : "",
        "When you have enough evidence, stop calling tools and reply with concise bullet-point findings.",
        "Include concrete file paths, versions, commands, and URLs you actually saw. Never invent details.",
      ]
        .filter(Boolean)
        .join(" "),
    },
    { role: "user", content: prompt.slice(0, 8000) },
  ];

  const steps: ResearchStep[] = [];

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      onActivity?.(step === 0 ? "thinking" : "reading");

      const choice = await requestCompletion({ apiKey, model, messages });
      if (!choice) break;

      const toolCalls = (choice.message?.tool_calls ?? []).slice(0, MAX_TOOL_CALLS_PER_STEP);

      // No tool calls means the model is done researching.
      if (toolCalls.length === 0) {
        const findings = typeof choice.message?.content === "string" ? choice.message.content.trim() : "";
        return formatFindings(findings, steps);
      }

      messages.push({
        role: "assistant",
        content: choice.message?.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call.function?.name ?? "";
        onActivity?.(TOOL_ACTIVITIES[name] ?? "working");

        const input = parseArguments(call.function?.arguments);
        const output = await executeTool(name, input, source);

        steps.push({ tool: name, input, output });
        onStep?.({ tool: name, input, output });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: output.slice(0, 12000),
        });
      }
    }

    // Ran out of steps: hand over whatever the tools produced.
    return formatFindings("", steps);
  } catch {
    return formatFindings("", steps);
  }
}

async function requestCompletion({
  apiKey,
  model,
  messages,
}: {
  apiKey: string;
  model: string;
  messages: AgentMessage[];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

  try {
    const response = await rateLimitedFetch(NVIDIA_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        temperature: 0.1,
        max_tokens: 700,
      }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
    };
    return payload.choices?.[0] ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  source: string | undefined,
): Promise<string> {
  // A scoped run must stay on its assigned repository even if the model
  // supplies a different repository argument in a tool call.
  const repository = source || asString(input.repository);

  switch (name) {
    case "search_web":
      return searchWeb(asString(input.query));
    case "read_web_page":
      return readWebPage(asString(input.url));
    case "list_repository_files":
    case "read_repository_file":
    case "githubgetfile":
    case "inspect_repository":
    case "validate_github_connection":
      if (name === "validate_github_connection") return callRepositoryMcpTool(name, {});
      if (name === "githubgetfile") {
        return callRepositoryMcpTool("githubgetfile", {
          repository,
          filePath: asString(input.filePath) || asString(input.path),
          ...(typeof input.ref === "string" ? { ref: input.ref } : {}),
        });
      }
      return callRepositoryMcpTool(name, { ...input, repository });
    default:
      return `Unknown tool: ${name || "(unnamed)"}.`;
  }
}

/** Combines the model's summary with a compact log of what was actually fetched. */
function formatFindings(summary: string, steps: ResearchStep[]): string {
  if (!summary && steps.length === 0) return "";

  const sections: string[] = [];
  if (summary) sections.push(`Research findings:\n${summary}`);

  if (steps.length > 0) {
    const log = steps
      .map((step) => `- ${step.tool}(${describeInput(step.input)}): ${firstLines(step.output)}`)
      .join("\n");
    sections.push(`Research trace:\n${log}`);
  }

  return sections.join("\n\n").slice(0, 24000);
}

function describeInput(input: Record<string, unknown>) {
  return Object.entries(input)
    .map(([key, value]) => `${key}=${String(value).slice(0, 120)}`)
    .join(", ");
}

function firstLines(output: string, limit = 600) {
  return output.replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}
