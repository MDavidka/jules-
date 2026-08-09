"use client";

import { ArrowUp, BrainCircuit, GitBranch, LoaderCircle, Mic } from "lucide-react";
import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import { cn, errorMessage } from "@/lib/utils";
import { PROMPT_MAX_LENGTH, PROMPT_MIN_LENGTH } from "@/lib/validators";
import type { NormalizedSource } from "@/types/jules";

interface TaskComposerProps {
  source: NormalizedSource | null;
  branch: string | null;
  onBranchChange: (branch: string) => void;
  onSubmit: (prompt: string) => Promise<void>;
  isSubmitting: boolean;
  /** Number of pinned memory notes that will be attached. */
  attachedMemoryCount: number;
  onOpenMemory: () => void;
  disabled?: boolean;
}

/**
 * The task composer. Fixed to the bottom of the viewport on mobile with
 * safe-area padding, inline within the column on desktop.
 */
export function TaskComposer({
  source,
  branch,
  onBranchChange,
  onSubmit,
  isSubmitting,
  attachedMemoryCount,
  onOpenMemory,
  disabled = false,
}: TaskComposerProps) {
  const [prompt, setPrompt] = React.useState("");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const dictation = useSpeechDictation({
    onTranscript: (text) => {
      setPrompt((current) => (current ? `${current.trimEnd()} ${text}` : text));
      textareaRef.current?.focus();
    },
  });

  // Auto-grow the textarea up to a capped height.
  React.useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [prompt]);

  const branches = source?.branches ?? [];
  const effectiveBranch = branch ?? source?.defaultBranch ?? null;
  const trimmedLength = prompt.trim().length;
  const isOverLimit = trimmedLength > PROMPT_MAX_LENGTH;
  const canSubmit =
    !disabled && !isSubmitting && Boolean(source) && trimmedLength >= PROMPT_MIN_LENGTH && !isOverLimit;

  const handleSubmit = async () => {
    setValidationError(null);

    if (!source) {
      setValidationError("Pick a repository first.");
      return;
    }
    if (trimmedLength < PROMPT_MIN_LENGTH) {
      setValidationError(`Describe the task in at least ${PROMPT_MIN_LENGTH} characters.`);
      return;
    }
    if (isOverLimit) {
      setValidationError(`Keep the prompt under ${PROMPT_MAX_LENGTH.toLocaleString()} characters.`);
      return;
    }

    try {
      await onSubmit(prompt.trim());
      setPrompt("");
      setValidationError(null);
    } catch (error) {
      setValidationError(errorMessage(error, "Could not submit the task."));
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
          Describe the task for Jules
        </label>
        <textarea
          id="task-prompt"
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={disabled || isSubmitting}
          maxLength={PROMPT_MAX_LENGTH + 100}
          aria-invalid={Boolean(validationError)}
          aria-describedby="task-prompt-help"
          placeholder="Help you write code, debug and ship production-ready work."
          className="max-h-[200px] w-full resize-none bg-transparent px-2.5 pb-2 pt-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
        />

        <div className="flex items-center gap-1.5 pt-0.5">
          {/* Attach saved memory notes to this prompt. */}
          <button
            type="button"
            onClick={onOpenMemory}
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrainCircuit className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">
              Manage memory attached to this task ({attachedMemoryCount} pinned)
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

          {/* Branch selector - real branches from the Jules source. */}
          <Select
            value={effectiveBranch ?? undefined}
            onValueChange={onBranchChange}
            disabled={disabled || branches.length === 0}
          >
            <SelectTrigger
              aria-label="Starting branch"
              className="h-10 min-h-10 w-auto max-w-[11rem] gap-1.5 rounded-full border-border/80 bg-transparent pl-3 pr-2.5 text-[13px] font-medium"
            >
              <GitBranch className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <SelectValue placeholder={source ? "Branch" : "No repo"} />
            </SelectTrigger>
            <SelectContent className="w-[min(18rem,90vw)]">
              {branches.map((branchName) => (
                <SelectItem key={branchName} value={branchName}>
                  {branchName}
                  {branchName === source?.defaultBranch ? (
                    <span className="ml-2 text-xs text-muted-foreground">default</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
                {dictation.isListening ? "Stop dictation" : "Dictate the task"}
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
              <span className="sr-only">Submit task to Jules</span>
            </button>
          </div>
        </div>
      </div>

      <p id="task-prompt-help" className="mt-2 px-2 text-[11px] leading-relaxed text-muted-foreground">
        {source ? (
          <>
            Runs on <span className="text-foreground/80">{source.fullName}</span>
            {effectiveBranch ? (
              <>
                {" · "}
                <span className="text-foreground/80">{effectiveBranch}</span>
              </>
            ) : null}
            {attachedMemoryCount > 0 ? ` · ${attachedMemoryCount} memory note(s) attached` : ""}
          </>
        ) : (
          "Select a repository to start a task."
        )}
      </p>

      {/* Dictation status for screen readers. */}
      <p aria-live="polite" className="sr-only">
        {dictation.isListening ? "Listening. Speak your task." : ""}
      </p>
    </div>
  );
}
