"use client";

import { AlertTriangle, ArrowUp, Check, FileImage, FileText, Github, LoaderCircle, Mic, Paperclip, Search, X } from "lucide-react";
import type { NvidiaModel } from "@/hooks/use-nvidia-models";
import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModelIcon } from "@/components/ui/model-icon";
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
import { MAX_RESEARCH_REPOSITORIES, PROMPT_MAX_LENGTH, PROMPT_MIN_LENGTH } from "@/lib/validators";
import type { NormalizedSource } from "@/types/jules";

export const LONG_PROMPT_FILE_THRESHOLD = 4_000;

export interface AgentAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string;
  dataUrl?: string;
  /** Marks the generated text file that contains the complete user request. */
  isPromptAttachment?: boolean;
  status?: "processing" | "ready" | "error";
  error?: string;
}

interface TaskComposerProps {
  source: NormalizedSource | null;
  sources?: NormalizedSource[];
  branch: string | null;
  onBranchChange: (branch: string) => void;
  model: string;
  models: readonly NvidiaModel[];
  onModelChange: (model: string) => void;
  onSubmit: (prompt: string, attachments: AgentAttachment[], researchRepositories: string[]) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  modelDisabled?: boolean;
}

/**
 * The task composer. Fixed to the bottom of the viewport on mobile with
 * safe-area padding, inline within the column on desktop.
 */
export function TaskComposer({
  source,
  sources,
  branch,
  onBranchChange,
  model,
  models,
  onModelChange,
  onSubmit,
  isSubmitting,
  disabled = false,
  modelDisabled = false,
}: TaskComposerProps) {
  const [prompt, setPrompt] = React.useState("");
  const [attachments, setAttachments] = React.useState<AgentAttachment[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [showGithubDropdown, setShowGithubDropdown] = React.useState(false);
  const [githubSearch, setGithubSearch] = React.useState("");
  const [selectedResearchRepositories, setSelectedResearchRepositories] = React.useState<string[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
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

  const availableGithubSources = React.useMemo(() => {
    const seen = new Set<string>();
    return (sources ?? []).filter((sourceItem) => {
      const key = sourceItem.fullName.trim().toLowerCase() || sourceItem.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sources]);

  // Detect /github trigger and manage dropdown visibility.
  React.useEffect(() => {
    if (!sources?.length) {
      setShowGithubDropdown(false);
      return;
    }
    // Keep the picker open while the trigger remains at the end of the draft,
    // so several repositories can be selected before the user confirms.
    setShowGithubDropdown(/\/github\s*$/.test(prompt));
  }, [prompt, sources]);

  // Remove selections that disappear after a source refresh.
  React.useEffect(() => {
    const available = new Set((availableGithubSources).map((sourceItem) => sourceItem.name));
    setSelectedResearchRepositories((current) => current.filter((name) => available.has(name)));
  }, [availableGithubSources]);

  // Close dropdown on escape or click outside.
  React.useEffect(() => {
    if (!showGithubDropdown) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowGithubDropdown(false);
        setGithubSearch("");
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowGithubDropdown(false);
        setGithubSearch("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showGithubDropdown]);

  const filteredGithubSources = React.useMemo(() => {
    const term = githubSearch.trim().toLowerCase();
    if (!term) return availableGithubSources;
    return (availableGithubSources).filter((sourceItem) =>
      `${sourceItem.fullName} ${sourceItem.owner ?? ""} ${sourceItem.repo ?? ""}`.toLowerCase().includes(term),
    );
  }, [githubSearch, availableGithubSources]);

  const toggleResearchRepository = (sourceName: string) => {
    setSelectedResearchRepositories((current) => {
      if (current.includes(sourceName)) return current.filter((name) => name !== sourceName);
      if (current.length >= MAX_RESEARCH_REPOSITORIES) return current;
      return [...current, sourceName];
    });
  };

  const completeGithubSelection = () => {
    const selectedNames = new Set(selectedResearchRepositories);
    const references = (availableGithubSources)
      .filter((sourceItem) => selectedNames.has(sourceItem.name))
      .map((sourceItem) => `@${sourceItem.fullName}`)
      .join(" ");

    setPrompt((current) => current.replace(/\/github\s*$/, references ? `${references} ` : ""));
    setShowGithubDropdown(false);
    setGithubSearch("");
    textareaRef.current?.focus();
  };

  const clearGithubSelection = () => setSelectedResearchRepositories([]);

  const branches = source?.branches ?? [];
  const effectiveBranch = branch ?? source?.defaultBranch ?? null;
  const trimmedLength = prompt.trim().length;
  const selectedModel = models.find((item) => item.id === model) ?? models[0];
  const isOverLimit = trimmedLength > PROMPT_MAX_LENGTH;
  const hasAttachmentError = attachments.some((attachment) => attachment.status === "error");
  const canSubmit = !disabled && !isSubmitting && !isProcessingFiles && !hasAttachmentError && trimmedLength >= PROMPT_MIN_LENGTH && !isOverLimit;

  const readImageAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      const timeout = window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Timed out while loading ${file.name}.`));
      }, 15_000);
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        URL.revokeObjectURL(objectUrl);
        if (error) reject(error);
      };
      image.onload = () => {
        try {
          const maxDimension = 1280;
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(32, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(32, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) {
            finish(new Error(`Could not process ${file.name}.`));
            return;
          }
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
          if (dataUrl.length > 4_500_000) {
            finish(new Error(`${file.name} is still too large after compression.`));
            return;
          }
          finish();
          resolve(dataUrl);
        } catch {
          finish(new Error(`Could not process ${file.name}.`));
        }
      };
      image.onerror = () => finish(new Error(`Could not decode ${file.name}. Use PNG, JPG, or WEBP.`));
      image.src = objectUrl;
    });

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const selectedFiles = Array.from(fileList).slice(0, 4);
    const pending = selectedFiles.map<AgentAttachment>((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      status: "processing",
    }));
    setAttachments((current) => [...current, ...pending].slice(0, 4));
    setIsProcessingFiles(true);
    if (fileInputRef.current) fileInputRef.current.value = "";

    for (const [index, file] of selectedFiles.entries()) {
      const pendingAttachment = pending[index];
      if (!pendingAttachment) continue;
      if (file.size > 4 * 1024 * 1024) {
        const message = `${file.name} must be smaller than 4 MB.`;
        setAttachments((current) => current.map((attachment) => attachment.id === pendingAttachment.id ? { ...attachment, status: "error", error: message } : attachment));
        toast({ title: "File is too large", description: message, variant: "error" });
        continue;
      }
      try {
        const isImage = file.type.startsWith("image/");
        const isText = file.type.startsWith("text/") || /\.(md|mdx|json|csv|ts|tsx|js|jsx|py|go|rs|java|yml|yaml|toml|xml|html|css)$/i.test(file.name);
        const processed: AgentAttachment = {
          ...pendingAttachment,
          status: "ready",
          ...(isImage
            ? { dataUrl: await readImageAsDataUrl(file) }
            : isText
              ? { content: (await file.text()).slice(0, 200_000) }
              : { dataUrl: await readAsDataUrl(file) }),
        };
        setAttachments((current) => current.map((attachment) => attachment.id === pendingAttachment.id ? processed : attachment));
      } catch (error) {
        const message = errorMessage(error, `Could not attach ${file.name}.`);
        setAttachments((current) => current.map((attachment) => attachment.id === pendingAttachment.id ? { ...attachment, status: "error", error: message } : attachment));
        toast({ title: "Could not attach file", description: message, variant: "error" });
      }
    }
    setIsProcessingFiles(false);
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
    if (isProcessingFiles) {
      setValidationError("Wait for the selected files to finish preparing.");
      return;
    }
    if (hasAttachmentError) {
      setValidationError("Remove the file that failed to load before sending.");
      return;
    }

    try {
      const trimmedPrompt = prompt.trim();
      const promptAttachment: AgentAttachment | null = trimmedPrompt.length >= LONG_PROMPT_FILE_THRESHOLD
        ? {
            id: `prompt-${Date.now()}`,
            name: "user-request.md",
            type: "text/markdown",
            size: new Blob([trimmedPrompt]).size,
            content: trimmedPrompt,
            isPromptAttachment: true,
            status: "ready",
          }
        : null;
      const submittedPrompt = promptAttachment
        ? `Please read the attached file "${promptAttachment.name}" for my complete request, then answer or act on it.`
        : trimmedPrompt;
      const submittedAttachments = promptAttachment
        ? [promptAttachment, ...attachments.filter((attachment) => attachment.status !== "error")]
        : attachments.filter((attachment) => attachment.status !== "error");

      await onSubmit(submittedPrompt, submittedAttachments, selectedResearchRepositories);
      setPrompt("");
      setAttachments([]);
      setSelectedResearchRepositories([]);
      setGithubSearch("");
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
        {attachments.length > 0 ? (
          <ul className="mb-3 flex flex-wrap gap-2" aria-label="Attached files">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-secondary/60 px-2 py-1.5 text-xs text-foreground">
                {attachment.status === "processing" ? (
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                ) : attachment.status === "error" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                ) : attachment.dataUrl && attachment.type.startsWith("image/") ? (
                  <AttachmentThumbnail attachment={attachment} />
                ) : <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                <span className="max-w-[12rem] truncate" title={attachment.error ?? attachment.name}>{attachment.status === "processing" ? `Preparing ${attachment.name}…` : attachment.error ?? attachment.name}</span>
                <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Remove ${attachment.name}`}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label htmlFor="task-prompt" className="sr-only">
          Describe the task for Jules
        </label>
        <div className="relative">
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
            placeholder="Describe what you want to build, debug, or understand."
            className="max-h-[160px] w-full resize-none bg-transparent px-2 pb-2 pt-1 text-lg leading-relaxed text-foreground outline-none ring-0 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0 disabled:cursor-not-allowed sm:max-h-[200px] sm:px-2.5 sm:pb-3 sm:pt-1.5 sm:text-2xl"
          />

          {/* /github multi-repository research picker */}
          {showGithubDropdown && sources && sources.length > 0 ? (
            <div
              ref={dropdownRef}
              role="dialog"
              aria-label="Choose repositories to research"
              className="absolute bottom-full left-0 z-50 mb-2 w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/15 bg-[hsl(0_0%_10%)] p-3 shadow-2xl shadow-black/50"
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <Github className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Research repositories</p>
                  <p className="truncate text-[11px] text-muted-foreground">The agent will compare selected codebases.</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {selectedResearchRepositories.length}/{MAX_RESEARCH_REPOSITORIES}
                </span>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="github-repository-search"
                  type="search"
                  value={githubSearch}
                  onChange={(event) => setGithubSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      dropdownRef.current?.querySelector<HTMLButtonElement>("[data-repo-option]")?.focus();
                    }
                    if (event.key === "Enter" && filteredGithubSources.length === 1) {
                      event.preventDefault();
                      toggleResearchRepository(filteredGithubSources[0]!.name);
                    }
                  }}
                  placeholder="Search for repo"
                  aria-label="Search repositories"
                  aria-controls="github-repository-options"
                  className="h-12 w-full rounded-xl border border-transparent bg-white/[0.09] pl-10 pr-3 text-base text-foreground outline-none placeholder:text-muted-foreground/80 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>

              <div className="mt-2 max-h-52 overflow-y-auto" id="github-repository-options">
                {filteredGithubSources.length > 0 ? (
                  <ul role="listbox" aria-label="Repositories" aria-multiselectable="true" className="space-y-0.5">
                    {filteredGithubSources.map((sourceItem) => {
                      const isSelected = selectedResearchRepositories.includes(sourceItem.name);
                      const atLimit = selectedResearchRepositories.length >= MAX_RESEARCH_REPOSITORIES;

                      return (
                        <li key={sourceItem.name}>
                          <button
                            type="button"
                            data-repo-option
                            role="option"
                            aria-selected={isSelected}
                            disabled={atLimit && !isSelected}
                            onClick={() => toggleResearchRepository(sourceItem.name)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                              isSelected ? "bg-primary/15 text-foreground" : "text-foreground hover:bg-white/[0.07]",
                              atLimit && !isSelected && "cursor-not-allowed opacity-40",
                            )}
                          >
                            <Github className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm">{sourceItem.fullName}</span>
                            {sourceItem.isPrivate ? <span className="text-[10px] text-muted-foreground">private</span> : null}
                            {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-3 py-5 text-center text-xs text-muted-foreground">No matching repositories.</p>
                )}
              </div>

              {selectedResearchRepositories.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2" aria-label="Selected repositories">
                  {(availableGithubSources)
                    .filter((sourceItem) => selectedResearchRepositories.includes(sourceItem.name))
                    .map((sourceItem) => (
                      <span key={sourceItem.name} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] text-foreground">
                        <Github className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="max-w-[10rem] truncate">{sourceItem.fullName}</span>
                        <button
                          type="button"
                          onClick={() => toggleResearchRepository(sourceItem.name)}
                          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                          aria-label={`Remove ${sourceItem.fullName}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                <button
                  type="button"
                  onClick={clearGithubSelection}
                  disabled={selectedResearchRepositories.length === 0}
                  className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={completeGithubSelection}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,.txt,.md,.mdx,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.yml,.yaml,.toml,.xml,.html,.css,.pdf"
          onChange={(event) => void handleFiles(event.target.files)}
          className="sr-only"
          tabIndex={-1}
        />

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

          <Select value={model} onValueChange={onModelChange} disabled={disabled || modelDisabled}>
            <SelectTrigger aria-label="Model" className="h-10 min-h-10 w-auto max-w-[13rem] gap-1.5 rounded-full border-border/80 bg-transparent pl-3 pr-2.5 text-[13px] font-medium">
              {selectedModel ? <ModelIcon model={selectedModel} /> : null}
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent className="w-[min(18rem,90vw)]">
              {models.map((item) => (
                <SelectItem
                  key={item.id}
                  value={item.id}
                  extra={
                    <span className="flex items-center gap-1.5">
                      <ModelIcon model={item} />
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


function AttachmentThumbnail({ attachment }: { attachment: AgentAttachment }) {
  const [hasError, setHasError] = React.useState(false);

  if (hasError || !attachment.dataUrl) {
    return <FileImage className="h-7 w-7 shrink-0 rounded text-muted-foreground" aria-hidden="true" />;
  }

  return (
    <img
      src={attachment.dataUrl}
      alt=""
      className="h-7 w-7 shrink-0 rounded object-cover"
      onError={() => setHasError(true)}
    />
  );
}
