/** Client-facing shapes for the NVIDIA agent chat. */

export interface AgentToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Transcript entry. Mirrors the OpenAI-compatible wire format because the client
 * owns the history and posts it back verbatim on every turn.
 */
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AgentToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

/** One executed tool call, rendered as a step in the UI's action trail. */
export interface AgentToolTrace {
  toolCallId: string;
  name: string;
  /** Human verb phrase, e.g. "Reading a file". */
  label: string;
  status: "done" | "failed" | "skipped";
  summary: string;
}

/** A confirmation-required action, rendered as a card with accept/skip buttons. */
export interface AgentPendingAction {
  toolCallId: string;
  name: "start_jules" | "stop_jules" | string;
  /** Card heading, e.g. "Assign Jules to fix this?" */
  title: string;
  /** Card body: the brief that will be sent, or what will be stopped. */
  description: string;
  /** Label for the confirm button. */
  confirmLabel: string;
  arguments: Record<string, unknown>;
  /** Secondary facts shown as small key/value chips on the card. */
  details: { label: string; value: string }[];
}

export interface AgentChatResponse {
  status: "complete" | "awaiting_confirmation";
  /** Full replacement transcript for the client to store. */
  messages: AgentMessage[];
  /** Tool calls executed during this turn, in order. */
  traces: AgentToolTrace[];
  pendingAction?: AgentPendingAction;
  model: string;
  /** True when the agent hit its per-turn tool budget and stopped early. */
  truncated?: boolean;
}

/** Local-only entries the UI keeps alongside the transcript for rendering. */
export interface ChatTurnMeta {
  /** Wall-clock time the message was added, for the timestamp under a bubble. */
  at: string;
}
