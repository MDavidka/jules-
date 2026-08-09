import "server-only";

import type { AgentPendingAction } from "@/types/agent";
import type { ChatToolCall } from "@/lib/nvidia-client.server";

/** System prompt and pending-action presentation for the NVIDIA agent. */

export interface PromptContext {
  sourceFullName: string | null;
  branch: string | null;
  modelLabel: string;
}

/**
 * The agent is a *planner and context-gatherer*, not a coder. Jules writes the code.
 * The prompt leans hard on that split, because the most common failure mode is the
 * model trying to output patches instead of handing a brief to Jules.
 */
export function buildSystemPrompt(context: PromptContext): string {
  const lines = [
    "You are the Jules+ planning agent. You talk directly to the user in a chat panel on a phone-sized screen.",
    "",
    "# Division of labour",
    "You do NOT write or edit code yourself. Jules, an autonomous coding agent, does that.",
    "Your job is to understand the user's problem well enough to hand Jules a brief it can act on alone.",
    "",
    "# Your primary task: gather and persist context",
    "1. Call `list_memory` early so you never re-ask something the user already told you.",
    "2. Read the actual code before forming an opinion. Use `get_repository_overview`, then",
    "   `list_repository_files` and `read_repository_file`. `list_repository_issues` finds real",
    "   reported bugs. These read PUBLIC repositories only.",
    "3. Persist what you learn as you learn it. `save_memory` for durable facts about the user,",
    "   their stack, and their preferences. `save_project_info` for the project's goal, working",
    "   branch, and structured facts. Do this without being asked - it is the point of the role.",
    "4. Never invent file paths, function names, or behaviour. If you have not read it, say so.",
    "",
    "# Handing work to Jules",
    "When you have a concrete, well-scoped change, call `start_jules`.",
    "The `prompt` you pass is the ONLY thing Jules sees - it cannot read this conversation. Write it",
    "as a standalone brief: the problem, the files you verified, the expected behaviour, and any",
    "constraint the user stated.",
    "`start_jules` and `stop_jules` are gated: the user sees a confirmation card and accepts or",
    "skips. Just call the tool - do not ask 'shall I?' in prose first, and do not claim the task",
    "started until the tool result says it did.",
    "Jules has no hard cancel. `stop_jules` sends a stop instruction and untracks the run; be honest",
    "about that limit if the user expects an immediate kill.",
    "",
    "# Style",
    "Be brief and concrete - short paragraphs, no headers, no bullet-point walls, no emoji.",
    "Lead with the answer. Name the specific file or line when you have one.",
    "Report tool failures plainly and say what you will try instead.",
  ];

  lines.push("", "# Current context");
  lines.push(
    context.sourceFullName
      ? `Selected repository: ${context.sourceFullName}${context.branch ? ` (branch ${context.branch})` : ""}.`
      : "No repository is selected in the composer. Ask which one to use, or call `list_repositories`.",
  );
  lines.push(`You are running as ${context.modelLabel} via NVIDIA.`);

  return lines.join("\n");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

/**
 * Turns a confirmation-required tool call into the card the user sees.
 * Keep it factual: this text is the user's only basis for approving the action.
 */
export function describePendingAction(
  call: ChatToolCall,
  args: Record<string, unknown>,
  fallbackContext: { sourceFullName: string | null; branch: string | null },
): AgentPendingAction {
  if (call.function.name === "start_jules") {
    const prompt = asString(args.prompt) ?? "(no brief provided)";
    const repo = asString(args.repo) ?? fallbackContext.sourceFullName;
    const branch = asString(args.branch) ?? fallbackContext.branch;
    const title = asString(args.title);

    const details: { label: string; value: string }[] = [];
    if (repo) details.push({ label: "Repo", value: repo });
    if (branch) details.push({ label: "Branch", value: branch });

    return {
      toolCallId: call.id,
      name: "start_jules",
      title: title ? `Assign Jules: ${truncate(title, 60)}` : "Assign Jules to this task?",
      description: truncate(prompt, 400),
      confirmLabel: "Yes, do it!",
      arguments: args,
      details,
    };
  }

  if (call.function.name === "stop_jules") {
    const session = asString(args.session) ?? "(unknown session)";
    const reason = asString(args.reason);

    return {
      toolCallId: call.id,
      name: "stop_jules",
      title: "Stop this Jules task?",
      description:
        reason ??
        "Jules will be told to stop and will no longer be tracked as running. Any step already " +
          "in flight may still finish.",
      confirmLabel: "Yes, stop it",
      arguments: args,
      details: [{ label: "Session", value: session.replace(/^sessions\//, "") }],
    };
  }

  // Defensive default so a newly gated tool still renders a usable card.
  return {
    toolCallId: call.id,
    name: call.function.name,
    title: `Run ${call.function.name}?`,
    description: truncate(JSON.stringify(args), 400),
    confirmLabel: "Yes, do it!",
    arguments: args,
    details: [],
  };
}
