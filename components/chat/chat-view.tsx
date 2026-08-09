"use client";

import { KeyRound, LoaderCircle, Sparkles, TriangleAlert, X } from "lucide-react";
import * as React from "react";

import { ActionCard } from "@/components/chat/action-card";
import { ToolTraceItem } from "@/components/chat/tool-trace-item";
import { BrandMark } from "@/components/layout/brand-mark";
import { getToolLabel } from "@/lib/agent-tool-labels";
import { cn, formatClockTime } from "@/lib/utils";
import type { AgentMessage, AgentPendingAction, AgentToolTrace } from "@/types/agent";

interface ChatViewProps {
  messages: AgentMessage[];
  traces: Record<string, AgentToolTrace>;
  timestamps: string[];
  pendingAction: AgentPendingAction | null;
  isSending: boolean;
  isResolving: boolean;
  error: string | null;
  truncated: boolean;
  onConfirm: () => void;
  onSkip: () => void;
  onDismissError: () => void;
  /** Prompts that seed a conversation when the transcript is empty. */
  suggestions: string[];
  onUseSuggestion: (text: string) => void;
  /** True when the NVIDIA key is missing - chat is unavailable until it's added. */
  needsNvidiaKey: boolean;
  onOpenSettings: () => void;
  repoLabel: string | null;
}

/**
 * The agent conversation. User turns are right-aligned bubbles, the agent replies as
 * plain text, and every tool call it makes is rendered as a step in an action trail.
 */
export function ChatView({
  messages,
  traces,
  timestamps,
  pendingAction,
  isSending,
  isResolving,
  error,
  truncated,
  onConfirm,
  onSkip,
  onDismissError,
  suggestions,
  onUseSuggestion,
  needsNvidiaKey,
  onOpenSettings,
  repoLabel,
}: ChatViewProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingAction, isSending]);

  if (needsNvidiaKey) {
    return <NvidiaKeyPrompt onOpenSettings={onOpenSettings} />;
  }

  if (messages.length === 0) {
    return (
      <EmptyChat
        suggestions={suggestions}
        onUseSuggestion={onUseSuggestion}
        repoLabel={repoLabel}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-4 pt-4 sm:px-6">
      <ol className="space-y-4">
        {messages.map((message, index) => {
          const at = timestamps[index] ?? null;

          if (message.role === "user") {
            return (
              <li key={index} className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-secondary px-4 py-2.5">
                  <p className="break-anywhere whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                    {message.content}
                  </p>
                </div>
                {at ? (
                  <time
                    dateTime={at}
                    className="mt-1.5 pr-1 text-[11px] tabular-nums text-muted-foreground"
                  >
                    {formatClockTime(at)}
                  </time>
                ) : null}
              </li>
            );
          }

          if (message.role === "assistant") {
            const hasText = Boolean(message.content && message.content.trim().length > 0);
            const calls = message.tool_calls ?? [];

            // An assistant turn that only requests tools renders as the trail alone.
            if (!hasText && calls.length === 0) return null;

            return (
              <li key={index} className="space-y-2.5">
                {hasText ? (
                  <p className="break-anywhere whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                    {message.content}
                  </p>
                ) : null}

                {calls.length > 0 ? (
                  <div className="space-y-1.5">
                    {calls.map((call) => (
                      <ToolTraceItem
                        key={call.id}
                        name={call.function.name}
                        label={getToolLabel(call.function.name)}
                        trace={traces[call.id]}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          }

          // Tool results are shown through their trace, not as raw JSON.
          return null;
        })}
      </ol>

      {pendingAction ? (
        <div className="mt-4">
          <ActionCard
            action={pendingAction}
            onConfirm={onConfirm}
            onSkip={onSkip}
            isResolving={isResolving}
          />
        </div>
      ) : null}

      {isSending || (isResolving && !pendingAction) ? (
        <p
          aria-live="polite"
          className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground"
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          Thinking…
        </p>
      ) : null}

      {truncated ? (
        <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[12px] leading-relaxed text-amber-200/90">
          The agent reached its tool budget for that turn. Ask it to continue to go further.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3 py-2.5"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <p className="break-anywhere flex-1 text-[13px] leading-relaxed text-red-200">{error}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 rounded-md p-1 text-red-300/70 transition-colors hover:bg-white/[0.06] hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Dismiss error</span>
          </button>
        </div>
      ) : null}

      <div ref={bottomRef} className="h-1" />
    </div>
  );
}

/** Hero state, mirroring the reference design's near-empty new-task screen. */
function EmptyChat({
  suggestions,
  onUseSuggestion,
  repoLabel,
}: {
  suggestions: string[];
  onUseSuggestion: (text: string) => void;
  repoLabel: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-48 pt-10 text-center lg:pb-10">
      <BrandMark className="h-12 w-12" iconClassName="h-7 w-7" />

      <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Talk it through first. I&apos;ll read{" "}
        {repoLabel ? (
          <span className="text-foreground/80">{repoLabel}</span>
        ) : (
          "your public repos"
        )}
        , remember what matters, and hand Jules a brief when we know what to build.
      </p>

      {suggestions.length > 0 ? (
        <ul className="mt-5 flex w-full max-w-sm flex-col gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => onUseSuggestion(suggestion)}
                className="flex w-full touch-target items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 text-left text-[13px] leading-snug text-foreground/90 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="py-2">{suggestion}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Shown when no NVIDIA key is stored: the chat cannot run without one. */
function NvidiaKeyPrompt({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-48 pt-10 text-center lg:pb-10">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-2xl",
          "border border-[#77B900]/30 bg-[#77B900]/10",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG */}
        <img src="/model-icons/nvidia.svg" alt="" aria-hidden="true" className="h-7 w-7" />
      </span>

      <h2 className="mt-4 text-lg font-semibold text-foreground">Add your NVIDIA API key</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        The chat agent runs on NVIDIA-hosted models. Create a free key at build.nvidia.com and
        save it in Settings - it&apos;s encrypted before it touches the database, exactly like your
        Jules key.
      </p>

      <button
        type="button"
        onClick={onOpenSettings}
        className="mt-5 inline-flex touch-target items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        Open Settings
      </button>
    </div>
  );
}
