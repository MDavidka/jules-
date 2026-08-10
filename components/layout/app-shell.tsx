"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { DEFAULT_NVIDIA_MODEL_ID, NVIDIA_MODELS } from "@/lib/nvidia-models";
import { useNvidiaModels } from "@/hooks/use-nvidia-models";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { AutomationsView } from "@/components/automations/automations-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { AppHeader } from "@/components/layout/app-header";
import { BrandMark } from "@/components/layout/brand-mark";
import { VIEW_TITLES, type ViewId } from "@/components/layout/nav-items";
import { Sidebar } from "@/components/layout/sidebar";
import { MemoryView } from "@/components/memory/memory-view";
import { RepoPickerSheet } from "@/components/repositories/repo-picker-sheet";
import { RepositoriesView } from "@/components/repositories/repositories-view";
import { SessionDetailView } from "@/components/sessions/session-detail-view";
import { TaskComposer, type AgentAttachment } from "@/components/sessions/task-composer";
import { AgentActivityIndicator, isAgentActivity, type AgentActivity } from "@/components/ui/dot-matrix-loader";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { SettingsView } from "@/components/settings/settings-view";
import { SetupGate } from "@/components/setup/setup-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useJulesConfig } from "@/hooks/use-jules-config";
import { useMemory } from "@/hooks/use-memory";
import { useSessions } from "@/hooks/use-sessions";
import { useSource, useSources } from "@/hooks/use-sources";
import { ApiError, queryKeys } from "@/lib/api-client";
import { errorMessage } from "@/lib/utils";

export function AppShell() {
  const configQuery = useJulesConfig();

  // 1. Missing MONGO_URI / JULES_KEY_ENCRYPTION_SECRET, or an undecryptable key.
  if (configQuery.isError && configQuery.error instanceof ApiError) {
    const error = configQuery.error;
    if (error.isConfigurationProblem || error.status === 503) {
      return <ConfigurationErrorScreen message={error.message} />;
    }
  }

  // 2. Initial status check.
  if (configQuery.isPending) return <FullScreenLoader />;

  // 3. Unrecoverable but non-config error.
  if (configQuery.isError) {
    return <ConfigurationErrorScreen message={errorMessage(configQuery.error)} />;
  }

  // 4. Setup gate.
  if (!configQuery.data?.configured) {
    return <SetupGate onConfigured={() => void configQuery.refetch()} />;
  }

  return <ConfiguredApp />;
}

const LAST_SELECTED_SOURCE_KEY = "jules-plus:last-selected-source";

function ConfiguredApp() {
  const queryClient = useQueryClient();

  const [activeView, setActiveView] = React.useState<ViewId>("new-task");
  const [selectedSourceName, setSelectedSourceName] = React.useState<string | null>(null);
  const [hasLoadedSavedSource, setHasLoadedSavedSource] = React.useState(false);
  const [branch, setBranch] = React.useState<string | null>(null);
  const [model, setModel] = React.useState<string>(DEFAULT_NVIDIA_MODEL_ID);
  const nvidiaModelsQuery = useNvidiaModels();
  const nvidiaModels = React.useMemo(() => {
    const liveModels = nvidiaModelsQuery.models.length ? nvidiaModelsQuery.models : NVIDIA_MODELS;
    const defaultModel = NVIDIA_MODELS.find((item) => item.id === DEFAULT_NVIDIA_MODEL_ID);
    const selectedModel = NVIDIA_MODELS.find((item) => item.id === model);
    const orderedModels = [defaultModel, ...liveModels, selectedModel].filter(Boolean);
    return [...new Map(orderedModels.map((item) => [item!.id, item!])).values()];
  }, [model, nvidiaModelsQuery.models]);
  const [assistantMessages, setAssistantMessages] = React.useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [assistantPending, setAssistantPending] = React.useState(false);
  const [assistantActivity, setAssistantActivity] = React.useState<AgentActivity>("thinking");
  const [openSessionName, setOpenSessionName] = React.useState<string | null>(null);

  const [navOpen, setNavOpen] = React.useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = React.useState(false);
  const [composerHeight, setComposerHeight] = React.useState(0);
  const composerRef = React.useRef<HTMLDivElement>(null);

  const sourcesQuery = useSources({ enabled: true });
  const sources = React.useMemo(() => sourcesQuery.data?.items ?? [], [sourcesQuery.data]);

  React.useEffect(() => {
    try {
      setSelectedSourceName(window.localStorage.getItem(LAST_SELECTED_SOURCE_KEY));
    } catch {
      setSelectedSourceName(null);
    }
    setHasLoadedSavedSource(true);
  }, []);

  // Restore the last repository, then fall back to the first connected source.
  React.useEffect(() => {
    if (!hasLoadedSavedSource || sources.length === 0) return;
    if (!selectedSourceName || !sources.some((source) => source.name === selectedSourceName)) {
      setSelectedSourceName(sources[0]!.name);
    }
  }, [hasLoadedSavedSource, sources, selectedSourceName]);

  React.useEffect(() => {
    if (!selectedSourceName) return;
    try {
      window.localStorage.setItem(LAST_SELECTED_SOURCE_KEY, selectedSourceName);
    } catch {
      // Storage can be unavailable in private browsing; selection still works in memory.
    }
  }, [selectedSourceName]);

  // Fetch full detail (branch list) for the selected source.
  const sourceDetailQuery = useSource(selectedSourceName);
  const selectedSource = React.useMemo(() => {
    if (sourceDetailQuery.data) return sourceDetailQuery.data;
    return sources.find((source) => source.name === selectedSourceName) ?? null;
  }, [sourceDetailQuery.data, sources, selectedSourceName]);

  // Reset the branch whenever the repository changes.
  React.useEffect(() => {
    setBranch(null);
  }, [selectedSourceName]);

  const memoryQuery = useMemory();
  const pinnedNotes = React.useMemo(
    () =>
      (memoryQuery.data?.items ?? []).filter(
        (note) => note.pinned && (!note.source || note.source === selectedSourceName),
      ),
    [memoryQuery.data, selectedSourceName],
  );

  // Keep the sessions list warm so the header/dashboard reflect live state.
  const sessionsQuery = useSessions({ enabled: true });
  const interactedSourceNames = React.useMemo(
    () => new Set((sessionsQuery.data?.items ?? []).map((session) => session.source).filter((source): source is string => Boolean(source))),
    [sessionsQuery.data],
  );
  const visibleSources = React.useMemo(
    () => sources.filter((source) => source.name === selectedSourceName || interactedSourceNames.has(source.name)),
    [interactedSourceNames, selectedSourceName, sources],
  );

  React.useLayoutEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    const updateHeight = () => setComposerHeight(Math.ceil(element.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleNavigate = (view: ViewId) => {
    setActiveView(view);
    if (view !== "session") setOpenSessionName(null);
  };

  const handleSelectSource = (sourceName: string) => {
    setSelectedSourceName(sourceName);
  };

  const handleOpenSession = (sessionName: string) => {
    setOpenSessionName(sessionName);
    setActiveView("session");
  };

  const handleSubmitTask = async (prompt: string, attachments: AgentAttachment[]) => {
    const memoryBlock = pinnedNotes.length > 0 ? `\nKnown memory:\n${pinnedNotes.map((note) => `- ${note.content}`).join("\n")}` : "";
    setAssistantPending(true);
    setAssistantActivity("thinking");
    setAssistantMessages((current) => [...current, { role: "user", content: prompt }, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/nvidia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}${memoryBlock}`,
          model: model || DEFAULT_NVIDIA_MODEL_ID,
          source: selectedSource?.githubUrl ?? selectedSource?.fullName ?? selectedSourceName,
          attachments,
          history: assistantMessages,
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? data?.message ?? "Assistant request failed.");
      }

      const appendToken = (token: string) => {
        setAssistantMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + token };
          return next;
        });
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedContent = false;
      let savedMemoryCount = 0;
      let streamError: string | null = null;

      // The route streams newline-delimited JSON events, not raw text.
      const handleEvent = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let event: { type?: string; value?: unknown; activity?: unknown; message?: unknown; saved?: unknown };
        try {
          event = JSON.parse(trimmed);
        } catch {
          return;
        }

        switch (event.type) {
          case "status":
            if (isAgentActivity(event.activity)) setAssistantActivity(event.activity);
            break;
          case "token":
            if (typeof event.value === "string" && event.value) {
              receivedContent = true;
              appendToken(event.value);
            }
            break;
          case "memory":
            if (typeof event.saved === "number") savedMemoryCount += event.saved;
            break;
          case "error":
            streamError = typeof event.message === "string" ? event.message : "The assistant request failed.";
            break;
          default:
            break;
        }
      };

      while (true) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleEvent(line);
      }
      buffer += decoder.decode();
      if (buffer) handleEvent(buffer);

      if (streamError) throw new Error(streamError);
      if (!receivedContent) throw new Error("The assistant returned an empty response. Try a smaller image or a different prompt.");

      // Refresh the memory board when the assistant stored new cards.
      if (savedMemoryCount > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.memory });
      }
    } catch (error) {
      setAssistantMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) next.pop();
        return next;
      });
      throw error;
    } finally {
      setAssistantPending(false);
    }
  };

  const handleRefresh = () => {
    void sourcesQuery.refetch();
    void sessionsQuery.refetch();
  };

  const headerTitle =
    activeView === "session" ? VIEW_TITLES.session : VIEW_TITLES[activeView];

  const sidebar = (
    <Sidebar
      activeView={activeView}
      onNavigate={handleNavigate}
      sources={visibleSources}
      connectedSourceCount={sources.length}
      isLoadingSources={sourcesQuery.isPending}
      selectedSource={selectedSourceName}
      onSelectSource={(sourceName) => {
        handleSelectSource(sourceName);
        setActiveView("new-task");
      }}
      onAfterNavigate={() => setNavOpen(false)}
    />
  );

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Permanent sidebar on desktop. */}
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {/* Slide-in drawer on mobile/tablet. */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="p-0" aria-label="Navigation">
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={headerTitle}
          onOpenNav={() => setNavOpen(true)}
          onOpenRepoPicker={() => setRepoPickerOpen(true)}
          onRefresh={handleRefresh}
          isRefreshing={sourcesQuery.isFetching || sessionsQuery.isFetching}
          selectedSource={selectedSource}
          isLoadingSources={sourcesQuery.isPending}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          {activeView === "new-task" ? (
            <NewTaskView messages={assistantMessages} isStreaming={assistantPending} activity={assistantActivity} composerHeight={composerHeight} />
          ) : (
            <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
              {activeView === "dashboard" ? (
                <DashboardView
                  enabled
                  selectedSource={selectedSource}
                  onOpenSession={handleOpenSession}
                  onNewTask={() => handleNavigate("new-task")}
                />
              ) : activeView === "repositories" ? (
                <RepositoriesView
                  enabled
                  selectedSource={selectedSourceName}
                  onSelectSource={handleSelectSource}
                  onNewTask={() => handleNavigate("new-task")}
                />
              ) : activeView === "memory" ? (
                <MemoryView selectedSource={selectedSourceName} />
              ) : activeView === "automations" ? (
                <AutomationsView />
              ) : activeView === "settings" ? (
                <SettingsView />
              ) : activeView === "session" && openSessionName ? (
                <SessionDetailView
                  sessionName={openSessionName}
                  enabled
                  onBack={() => handleNavigate("dashboard")}
                />
              ) : null}
            </div>
          )}

          {/* Composer: fixed to the bottom on mobile, inline on desktop. */}
          {activeView === "new-task" ? (
            <div ref={composerRef} className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-3 pb-3 pt-3 pb-safe backdrop-blur-md lg:static lg:bg-transparent lg:pb-6 lg:backdrop-blur-none">
              <div className="mx-auto w-full max-w-3xl">
                <TaskComposer
                  source={selectedSource}
                  branch={branch}
                  onBranchChange={setBranch}
                  model={model}
                  models={nvidiaModels}
                  onModelChange={setModel}
                  onSubmit={handleSubmitTask}
                  isSubmitting={assistantPending}
                  disabled={false}
                />
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <RepoPickerSheet
        open={repoPickerOpen}
        onOpenChange={setRepoPickerOpen}
        sources={visibleSources}
        isLoading={sourcesQuery.isPending}
        selectedSource={selectedSourceName}
        onSelect={handleSelectSource}
      />
    </div>
  );
}

/** The near-empty hero state from the reference design. */
function NewTaskView({ messages, isStreaming, activity, composerHeight }: { messages: Array<{ role: "user" | "assistant"; content: string }>; isStreaming: boolean; activity: AgentActivity; composerHeight: number }) {
  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto px-4 pb-[calc(var(--composer-height)+1.5rem)] pt-6 sm:px-6 lg:pb-10"
      style={{ "--composer-height": `${Math.max(composerHeight, 208)}px` } as React.CSSProperties}
    >
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center"><BrandMark className="h-12 w-12" iconClassName="h-7 w-7" /><p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">Tell the assistant what you are trying to build or fix. It will gather context and suggest the next action.</p></div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={message.role === "user" ? "self-end max-w-[86%] rounded-3xl bg-secondary px-5 py-3 text-base text-foreground" : "max-w-[92%] px-5 py-3 text-base leading-relaxed text-foreground"}>
              {message.role === "assistant" ? (
                // While the reply is still empty the status row stands in for it.
                index === messages.length - 1 && isStreaming && !message.content ? (
                  <AgentActivityIndicator activity={activity} />
                ) : (
                  <MarkdownContent>{message.content}</MarkdownContent>
                )
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <BrandMark className="h-12 w-12" iconClassName="h-7 w-7" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Starting Jules+…
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        Checking your Jules connection.
      </p>
    </div>
  );
}

/** Developer-facing configuration failure (missing env vars, DB unreachable). */
function ConfigurationErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Configuration required</AlertTitle>
          <AlertDescription>
            <p className="break-anywhere">{message}</p>
          </AlertDescription>
        </Alert>
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-medium text-foreground">Required environment variables</p>
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <li>MONGO_URI</li>
            <li>JULES_KEY_ENCRYPTION_SECRET</li>
          </ul>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Copy .env.example to .env.local, fill both values, then restart the dev server.
          </p>
        </div>
      </div>
    </main>
  );
}
