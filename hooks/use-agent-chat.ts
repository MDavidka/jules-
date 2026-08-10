"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { projectKeys } from "@/hooks/use-projects";
import { fetchJson, queryKeys } from "@/lib/api-client";
import type {
  AgentChatResponse,
  AgentMessage,
  AgentPendingAction,
  AgentToolTrace,
} from "@/types/agent";

/** Tools whose success should refresh cached Jules/Mongo data elsewhere in the app. */
const INVALIDATING_TOOLS = new Set([
  "start_jules",
  "stop_jules",
  "save_memory",
  "save_project_info",
]);

interface UseAgentChatOptions {
  model: string;
  /** Jules source resource name for the selected repository. */
  source: string | null;
  branch: string | null;
}

export interface UseAgentChatResult {
  messages: AgentMessage[];
  /** Executed tool calls, keyed by tool_call_id, for inline trace rendering. */
  traces: Record<string, AgentToolTrace>;
  /** Wall-clock time per message index, for bubble timestamps. */
  timestamps: string[];
  pendingAction: AgentPendingAction | null;
  isSending: boolean;
  /** True while the user's decision on a pending action is being applied. */
  isResolving: boolean;
  error: string | null;
  truncated: boolean;
  send: (text: string) => Promise<void>;
  resolve: (approved: boolean) => Promise<void>;
  reset: () => void;
  dismissError: () => void;
}

/**
 * Owns the NVIDIA agent transcript.
 *
 * The server is stateless, so this hook holds the full message history and posts it
 * back on every turn. Confirmation-gated actions surface as `pendingAction`; calling
 * `resolve` sends the user's decision and continues the same turn.
 */
export function useAgentChat({ model, source, branch }: UseAgentChatOptions): UseAgentChatResult {
  const queryClient = useQueryClient();

  const [messages, setMessages] = React.useState<AgentMessage[]>([]);
  const [traces, setTraces] = React.useState<Record<string, AgentToolTrace>>({});
  const [timestamps, setTimestamps] = React.useState<string[]>([]);
  const [pendingAction, setPendingAction] = React.useState<AgentPendingAction | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [isResolving, setIsResolving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [truncated, setTruncated] = React.useState(false);

  // Guards against overlapping turns (double-tap on send, or send during confirm).
  const inFlight = React.useRef(false);

  const applyResponse = React.useCallback(
    (response: AgentChatResponse) => {
      setMessages(response.messages);

      setTimestamps((previous) => {
        if (response.messages.length <= previous.length) return previous;
        const now = new Date().toISOString();
        return [
          ...previous,
          ...Array.from({ length: response.messages.length - previous.length }, () => now),
        ];
      });

      if (response.traces.length > 0) {
        setTraces((previous) => {
          const next = { ...previous };
          for (const trace of response.traces) next[trace.toolCallId] = trace;
          return next;
        });
      }

      setPendingAction(response.pendingAction ?? null);
      setTruncated(Boolean(response.truncated));

      // Refresh anything the agent may have changed server-side.
      if (response.traces.some((trace) => INVALIDATING_TOOLS.has(trace.name))) {
        void queryClient.invalidateQueries({ queryKey: ["jules", "sessions"] });
        void queryClient.invalidateQueries({ queryKey: projectKeys.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.memory });
      }
    },
    [queryClient],
  );

  const postTurn = React.useCallback(
    async (
      history: AgentMessage[],
      resolvedAction?: { toolCallId: string; name: string; arguments: Record<string, unknown>; approved: boolean },
    ) => {
      const response = await fetchJson<AgentChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          model,
          messages: history,
          ...(source ? { source } : {}),
          ...(branch ? { branch } : {}),
          ...(resolvedAction ? { resolvedAction } : {}),
        }),
      });

      applyResponse(response);
    },
    [applyResponse, branch, model, source],
  );

  const send = React.useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || inFlight.current) return;

      const userMessage: AgentMessage = { role: "user", content };
      const history = [...messages, userMessage];

      // Show the user's message immediately; the server echoes it back in `messages`.
      setMessages(history);
      setTimestamps((previous) => [...previous, new Date().toISOString()]);
      setError(null);
      setTruncated(false);
      setIsSending(true);
      inFlight.current = true;

      try {
        await postTurn(history);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The agent could not respond.");
      } finally {
        inFlight.current = false;
        setIsSending(false);
      }
    },
    [messages, postTurn],
  );

  const resolve = React.useCallback(
    async (approved: boolean) => {
      if (!pendingAction || inFlight.current) return;

      const action = pendingAction;

      setError(null);
      setPendingAction(null);
      setIsResolving(true);
      inFlight.current = true;

      try {
        await postTurn(messages, {
          toolCallId: action.toolCallId,
          name: action.name,
          arguments: action.arguments,
          approved,
        });
      } catch (caught) {
        // Restore the card so the decision is not silently lost.
        setPendingAction(action);
        setError(caught instanceof Error ? caught.message : "That action could not be applied.");
      } finally {
        inFlight.current = false;
        setIsResolving(false);
      }
    },
    [messages, pendingAction, postTurn],
  );

  const reset = React.useCallback(() => {
    if (inFlight.current) return;
    setMessages([]);
    setTraces({});
    setTimestamps([]);
    setPendingAction(null);
    setError(null);
    setTruncated(false);
  }, []);

  const dismissError = React.useCallback(() => setError(null), []);

  return {
    messages,
    traces,
    timestamps,
    pendingAction,
    isSending,
    isResolving,
    error,
    truncated,
    send,
    resolve,
    reset,
    dismissError,
  };
}
