"use client";

import { ArrowUp, FileText, LoaderCircle, Mic, Paperclip, X } from "lucide-react";
import { providerLogo } from "@/lib/nvidia-models";
import type { NvidiaModel } from "@/hooks/use-nvidia-models";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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

export interface AgentAttachment {
  name: string;
  type: string;
  size: number;
  content?: string;
  dataUrl?: string;
}

interface TaskComposerProps {
  source: NormalizedSource | null;
  branch: string | null;
  onBranchChange: (branch: string) => void;
  model: string;
  models: readonly NvidiaModel[];
  onModelChange: (model: string) => void;
  onSubmit: (prompt: string, attachments: AgentAttachment[]) => Promise<void>;
  isSubmitting: boolean;
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
  model,
  models,
  onModelChange,
  onSubmit,
  isSubmitting,
  disabled = false,
}: TaskComposerProps) {
  const [prompt, setPrompt] = React.useState("");
  const [attachments, setAttachments] = React.useState<AgentAttachment[]>([]);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
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
  const selectedModel = models.find((item) => item.id === model);
  const hideImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.style.display = "none";
  };
  const trimmedLength = prompt.trim().length;
  const isOverLimit = trimmedLength > PROMPT_MAX_LENGTH;
  const canSubmit = !disabled && !isSubmitting && trimmedLength >= PROMPT_MIN_LENGTH && !isOverLimit;

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const next: AgentAttachment[] = [];
    for (const file of Array.from(fileList).slice(0, 4)) {
      if (file.size > 4 * 1024 * 1024) {
        toast({ title: "File is too large", description: `${file.name} must be smaller than 4 MB.`, variant: "error" });
        continue;
      }
      try {
        const isText = file.type.startsWith("text/") || /\.(md|mdx|json|csv|ts|tsx|js|jsx|py|go|rs|java|yml|yaml|toml|xml|html|css)$/i.test(file.name);
        next.push({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          ...(isText ? { content: (await file.text()).slice(0, 200_000) } : { dataUrl: await readAsDataUrl(file) }),
        });
      } catch (error) {
        toast({ title: "Could not attach file", description: errorMessage(error), variant: "error" });
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    setValidationError(null);

    if (trimmedLength < PROMPT_MIN_LENGTH) {
      setValidationError("Enter at least one non-whitespace character.");
      return;
    }
    if (isOverLimit) {
      setValidationError(`Keep the prompt under ${PROMPT_MAX_LENGTH.toLocaleString()} characters.`);
      return;
    }

    try {
      await onSubmit(prompt.trim(), attachments);
      setPrompt("");
      setAttachments([]);
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
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "rounded-[1.75rem] border border-border/70 bg-[hsl(0_0%_11.76%)] p-3 shadow-2xl shadow-black/30 transition-colors sm:rounded-[2rem] sm:p-4",
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
          placeholder="Describe what you want to build, debug, or understand. Paste a public GitHub link for repository context."
          className="max-h-[160px] w-full resize-none bg-transparent px-2 pb-2 pt-1 text-lg leading-relaxed text-foreground outline-none ring-0 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0 disabled:cursor-not-allowed sm:max-h-[200px] sm:px-2.5 sm:pb-3 sm:pt-1.5 sm:text-2xl"
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.mdx,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.yml,.yaml,.toml,.xml,.html,.css,.pdf"
          onChange={(event) => void handleFiles(event.target.files)}
          className="sr-only"
          tabIndex={-1}
        />

        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attached files">
            {attachments.map((attachment, index) => (
              <li key={`${attachment.name}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-secondary/60 px-2 py-1.5 text-xs text-foreground">
                {attachment.dataUrl && attachment.type.startsWith("image/") ? (
                  <img src={attachment.dataUrl} alt="" className="h-7 w-7 rounded object-cover" />
                ) : <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                <span className="max-w-[12rem] truncate">{attachment.name}</span>
                <button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Remove ${attachment.name}`}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSubmitting}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">Attach files or images</span>
          </button>

          <Select value={model} onValueChange={onModelChange} disabled={disabled}>
            <SelectTrigger aria-label="Model" className="h-10 min-h-10 w-auto max-w-[13rem] gap-1.5 rounded-full border-border/80 bg-transparent pl-3 pr-2.5 text-[13px] font-medium">
              {selectedModel ? (
                <img
                  src={providerLogo(selectedModel.icon)}
                  alt=""
                  className="size-4 shrink-0 rounded-sm"
                  onError={hideImage}
                />
              ) : null}
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-[min(18rem,90vw)]">
              {models.map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  extra={
                    <span className="flex items-center gap-1.5">
                      <img
                        src={providerLogo(item.icon)}
                        alt=""
                        className="size-4 rounded-sm"
                        onError={hideImage}
                      />
                      <span className="text-xs text-muted-foreground">{item.provider}</span>
                    </span>
                  }
                >
                  {item.label}
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


      {/* Dictation status for screen readers. */}
      <p aria-live="polite" className="sr-only">
        {dictation.isListening ? "Listening. Speak your task." : ""}
      </p>
    </div>
  );
}
