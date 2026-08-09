import { NextResponse } from "next/server";

import { buildSystemPrompt, describePendingAction } from "@/lib/agent-prompt.server";
import {
  AGENT_TOOLS,
  executeTool,
  getToolSpec,
  type AgentContext,
} from "@/lib/agent-tools.server";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import {
  chatCompletion,
  type ChatToolCall,
  type ChatTranscriptMessage,
} from "@/lib/nvidia-client.server";
import { findModel, isKnownModel } from "@/lib/nvidia-models";
import { chatRequestSchema } from "@/lib/validators";
import type { AgentChatResponse, AgentToolTrace } from "@/types/agent";

export const dynamic = "force-dynamic";

/**
 * Per-turn budget for round trips to the model. Each iteration either answers an
 * outstanding tool call or spends one model call, so this bounds both latency and
 * token spend while still allowing a real investigate-then-propose sequence.
 */
const MAX_MODEL_CALLS = 6;

/** Caps how much of a tool result is fed back into the context. */
const MAX_TOOL_RESULT_CHARS = 24_000;

/**
 * POST /api/chat
 *
 * Runs one turn of the NVIDIA agent loop.
 *
 * The client owns the transcript and posts it back each turn, so this handler is
 * stateless. Read-only and memory tools execute automatically; a tool marked
 * `requiresConfirmation` pauses the loop and is returned as `pendingAction` for the
 * UI to accept or skip. The user's decision comes back as `resolvedAction`.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("The chat request was invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const { model, messages, source, branch, resolvedAction } = parsed.data;

    if (!isKnownModel(model)) {
      return jsonError("That model is not in the supported catalog.", 422, {
        code: "UNKNOWN_MODEL",
      });
    }

    const modelSpec = findModel(model);
    const sourceFullName = source
      ? source.replace(/^sources\/github\//, "").replace(/^sources\//, "")
      : null;

    const context: AgentContext = {
      source: source ?? null,
      branch: branch ?? null,
      signal: request.signal,
    };

    const systemPrompt = buildSystemPrompt({
      sourceFullName,
      branch: branch ?? null,
      modelLabel: modelSpec ? `${modelSpec.label} (${modelSpec.vendorLabel})` : model,
    });

    // The transcript the client sent, which this handler appends to.
    const working: ChatTranscriptMessage[] = messages as ChatTranscriptMessage[];
    const traces: AgentToolTrace[] = [];

    /* ------------------- 1. Apply the user's confirmation ------------------- */

    if (resolvedAction) {
      const outstanding = unansweredToolCalls(working);
      const call = outstanding.find((candidate) => candidate.id === resolvedAction.toolCallId);

      if (!call) {
        return jsonError(
          "That action is no longer pending. Send your message again.",
          409,
          { code: "STALE_ACTION" },
        );
      }

      if (resolvedAction.approved) {
        // Re-read the arguments from the transcript, not from the client payload, so
        // an edited client cannot swap in a different prompt or repository.
        const args = parseToolArguments(call);
        const outcome = await executeTool(call.function.name, args, context);

        working.push(toolMessage(call.id, outcome.data));
        traces.push({
          toolCallId: call.id,
          name: call.function.name,
          label: getToolSpec(call.function.name)?.label ?? call.function.name,
          status: outcome.ok ? "done" : "failed",
          summary: outcome.summary,
        });
      } else {
        working.push(
          toolMessage(call.id, {
            skipped: true,
            reason: "The user declined this action. Do not retry it unless they ask.",
          }),
        );
        traces.push({
          toolCallId: call.id,
          name: call.function.name,
          label: getToolSpec(call.function.name)?.label ?? call.function.name,
          status: "skipped",
          summary: "Skipped by you.",
        });
      }
    }

    /* --------------------------- 2. The agent loop -------------------------- */

    let modelCalls = 0;

    for (;;) {
      // 2a. Satisfy every outstanding tool call before asking the model again -
      // the wire protocol requires each tool_call to have a matching tool message.
      const outstanding = unansweredToolCalls(working);

      if (outstanding.length > 0) {
        const call = outstanding[0]!;
        const spec = getToolSpec(call.function.name);

        if (!spec) {
          working.push(
            toolMessage(call.id, {
              error: `Unknown tool "${call.function.name}". Available tools are listed in your schema.`,
            }),
          );
          traces.push({
            toolCallId: call.id,
            name: call.function.name,
            label: call.function.name,
            status: "failed",
            summary: `Unknown tool "${call.function.name}".`,
          });
          continue;
        }

        const args = parseToolArguments(call);

        // Gated action: stop here and let the user decide.
        if (spec.requiresConfirmation) {
          return respond({
            status: "awaiting_confirmation",
            messages: working,
            traces,
            pendingAction: describePendingAction(call, args, {
              sourceFullName,
              branch: branch ?? null,
            }),
            model,
          });
        }

        const outcome = await executeTool(call.function.name, args, context);

        working.push(toolMessage(call.id, outcome.data));
        traces.push({
          toolCallId: call.id,
          name: call.function.name,
          label: spec.label,
          status: outcome.ok ? "done" : "failed",
          summary: outcome.summary,
        });
        continue;
      }

      // 2b. Out of budget: close the turn honestly rather than looping forever.
      if (modelCalls >= MAX_MODEL_CALLS) {
        working.push({
          role: "assistant",
          content:
            "I used up this turn's tool budget while investigating. Ask me to continue and I'll " +
            "pick up where I left off.",
        });

        return respond({ status: "complete", messages: working, traces, model, truncated: true });
      }

      // 2c. Ask the model what to do next.
      modelCalls += 1;
      const result = await chatCompletion({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...working],
        tools: AGENT_TOOLS,
        signal: request.signal,
      });

      if (result.toolCalls.length > 0) {
        working.push({
          role: "assistant",
          content: result.content ?? null,
          tool_calls: result.toolCalls,
        });
        continue;
      }

      working.push({
        role: "assistant",
        content:
          result.content?.trim() ||
          "I don't have anything to add. Could you rephrase what you need?",
      });

      return respond({ status: "complete", messages: working, traces, model });
    }
  } catch (error) {
    return handleRouteError(error);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function respond(payload: AgentChatResponse) {
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Tool calls that have been requested but not yet answered, in request order.
 * A model can emit several calls in one assistant message, so this is a set
 * difference rather than a look at the last message alone.
 */
function unansweredToolCalls(messages: ChatTranscriptMessage[]): ChatToolCall[] {
  const answered = new Set<string>();

  for (const message of messages) {
    if (message.role === "tool") answered.add(message.tool_call_id);
  }

  const pending: ChatToolCall[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;

    for (const call of message.tool_calls) {
      if (!answered.has(call.id)) pending.push(call);
    }
  }

  return pending;
}

/**
 * Models emit tool arguments as a JSON *string*, and smaller models sometimes emit
 * malformed JSON. Returning `{}` lets per-tool validation produce a useful error
 * message the model can recover from, instead of failing the whole request.
 */
function parseToolArguments(call: ChatToolCall): Record<string, unknown> {
  const raw = call.function.arguments?.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function toolMessage(toolCallId: string, data: unknown): ChatTranscriptMessage {
  let content: string;

  try {
    content = JSON.stringify(data);
  } catch {
    content = JSON.stringify({ error: "The tool result could not be serialized." });
  }

  if (content.length > MAX_TOOL_RESULT_CHARS) {
    content = `${content.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`;
  }

  return { role: "tool", content, tool_call_id: toolCallId };
}
