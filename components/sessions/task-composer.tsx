"use client";

import { ArrowUp, BrainCircuit, LoaderCircle, Mic } from "lucide-react";
import * as React from "react";

import { ModelSelect } from "@/components/models/model-select";
import { useToast } from "@/components/ui/toast";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import { cn } from "@/lib/utils";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/validators";
import type { NvidiaModel } from "@/lib/nvidia-models";
import type { NormalizedSource } from "@/types/jules";

/** Minimum characters before the send button enables. */
const MESSAGE_MIN_LENGTH = 2;

interface TaskComposerProps {
  source: NormalizedSource | null;
  /** Effective branch, shown in the helper line. Chosen via the repo picker now. */
  branch: string | null;
  /** Models offered in the picker (curated catalog ∩ live NVIDIA catalog). */
  models: NvidiaModel[];
  isLoadingModels: boolean;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onSubmit: (message: string) => Promise<void> | void;
  isSubmitting: boolean;
  /** Number of pinned memory notes that will travel with a Jules task. */
  attachedMemoryCount: number;
  onOpenMemory: () => void;
  disabled?: boolean;
  /** Externally supplied draft, e.g. a tapped suggestion chip. */
  draft?: string | null;
  onDraftConsumed?: () => void;
}

/**
 * The chat composer. Fixed to the bottom of the viewport on mobile with safe-area
 * padding, inline within the column on desktop.
 *
 * The old branch selector was replaced by the NVIDIA model picker: messages here go
 * to the agent, not straight to Jules, so the model matters at send time while the
 * branch only matters when a Jules task actually starts.
 */
export function TaskComposer({
  source,
  branch,
  models,
  isLoadingModels,
  selectedModel,
  onModelChange,
  onSubmit,
  isSubmitting,
  attachedMemoryCount,
  onOpenMemory,
  disabled = false,
  draft,
  onDraftConsumed,
}: TaskComposerProps) {
  const [message, setMessage] = React.useState("");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const dictation = useSpeechDictation({
    onTranscript: (text) => {
      setMessage((current) => (current ? `${current.trimEnd()} ${text}` : text));
      textareaRef.current?.focus();
    },
  });

  // Adopt an externally supplied draft (suggestion chips) and focus the field.
  React.useEffect(() => {
    if (!draft) return;
    setMessage(draft);
    textareaRef.current?.focus();
    onDraftConsumed?.();
  }, [draft, onDraftConsumed]);

  // Auto-grow the textarea up to a capped height.
  React.useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [message]);

  const trimmedLength = message.trim().length;
  const isOverLimit = trimmedLength > CHAT_MESSAGE_MAX_LENGTH;
  const canSubmit = !disabled && !isSubmitting && trimmedLength >= MESSAGE_MIN_LENGTH && !isOverLimit;

  const handleSubmit = async () => {
    setValidationError(null);

    if (trimmedLength < MESSAGE_MIN_LENGTH) {
      setValidationError("Type a message first.");
      return;
    }
    if (isOverLimit) {
      setValidationError(
        `Keep the message under ${CHAT_MESSAGE_MAX_LENGTH.toLocaleString()} characters.`,
      );
      return;
    }

    // Clear optimistically: the transcript owns the message once it is sent.
    const outgoing = message.trim();
    setMessage("");

    try {
      await onSubmit(outgoing);
    } catch {
      // Restore the draft so nothing is lost if the send never left the client.
      setMessage(outgoing);
      setValidationError("Could not send that message. Try again.");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter submits; plain Enter inserts a newline on touch devices.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleMicClick = () => {
    if (!dictation.isSupported) {
      toast({
        title: "Dictation unavailable",
        description: "This browser does not support the Web Speech API.",
        variant: "info",
      });
      return;
    }

    if (dictation.isListening) dictation.stop();
    else dictation.start();
  };

  return (
    <div className="w-full">
      {validationError ? (
        <p role="alert" className="mb-2 px-1 text-sm text-red-400">
          {validationError}
        </p>
      ) : null}

      <div
        className={cn(
          "rounded-3xl border border-border/90 bg-[hsl(0_0%_13%)] p-2.5 shadow-2xl shadow-black/40 transition-colors",
          "focus-within:border-primary/40",
          disabled && "opacity-60",
        )}
      >
        <label htmlFor="task-prompt" className="sr-only">
          Message the Jules+ agent
        </label>
        <textarea
          id="task-prompt"
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={disabled || isSubmitting}
          maxLength={CHAT_MESSAGE_MAX_LENGTH + 100}
          aria-invalid={Boolean(validationError)}
          aria-describedby="task-prompt-help"
          placeholder="Help you write code, debug and ship production-ready work."
          className="max-h-[200px] w-full resize-none bg-transparent px-2.5 pb-2 pt-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
        />

        <div className="flex items-center gap-1.5 pt-0.5">
          {/* Saved memory the agent can attach to a Jules task. */}
          <button
            type="button"
            onClick={onOpenMemory}
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrainCircuit className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">
              Manage memory attached to this project ({attachedMemoryCount} pinned)
            </span>
            {attachedMemoryCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
              >
                {attachedMemoryCount}
              </span>
            ) : null}
          </button>

          {/* Model selector - replaces the old branch picker. */}
          <ModelSelect
            models={models}
            value={selectedModel}
            onChange={onModelChange}
            disabled={disabled}
            isLoading={isLoadingModels}
          />

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={handleMicClick}
              aria-pressed={dictation.isListening}
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dictation.isListening
                  ? "bg-red-500/20 text-red-300"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">
                {dictation.isListening ? "Stop dictation" : "Dictate your message"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-white/[0.08] text-muted-foreground",
              )}
            >
              {isSubmitting ? (
                <LoaderCircle className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
              <span className="sr-only">Send message to the agent</span>
            </button>
          </div>
        </div>
      </div>

      <p
        id="task-prompt-help"
        className="mt-2 px-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        {source ? (
          <>
            Context: <span className="text-foreground/80">{source.fullName}</span>
            {branch ? (
              <>
                {" · "}
                <span className="text-foreground/80">{branch}</span>
              </>
            ) : null}
            {attachedMemoryCount > 0 ? ` · ${attachedMemoryCount} memory note(s) attached` : ""}
          </>
        ) : (
          "Select a repository to give the agent context."
        )}
      </p>

      {/* Dictation status for screen readers. */}
      <p aria-live="polite" className="sr-only">
        {dictation.isListening ? "Listening. Speak your message." : ""}
      </p>
    </div>
  );
}
