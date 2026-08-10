"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { NVIDIA_MODELS } from "@/lib/nvidia-models";
import { useNvidiaModels } from "@/hooks/use-nvidia-models";
import * as React from "react";

import { AutomationsView } from "@/components/automations/automations-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { AppHeader } from "@/components/layout/app-header";
import { BrandMark } from "@/components/layout/brand-mark";
import { VIEW_TITLES, type ViewId } from "@/components/layout/nav-items";
import { Sidebar } from "@/components/layout/sidebar";
import { MemoryAttachSheet } from "@/components/memory/memory-attach-sheet";
import { MemoryView } from "@/components/memory/memory-view";
import { RepoPickerSheet } from "@/components/repositories/repo-picker-sheet";
import { RepositoriesView } from "@/components/repositories/repositories-view";
import { SessionDetailView } from "@/components/sessions/session-detail-view";
import { TaskComposer } from "@/components/sessions/task-composer";
import { SettingsView } from "@/components/settings/settings-view";
import { SetupGate } from "@/components/setup/setup-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useJulesConfig } from "@/hooks/use-jules-config";
import { useMemory } from "@/hooks/use-memory";
import { useSessions } from "@/hooks/use-sessions";
import { useSource, useSources } from "@/hooks/use-sources";
import { ApiError } from "@/lib/api-client";
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

function ConfiguredApp() {
  const { toast } = useToast();

  const [activeView, setActiveView] = React.useState<ViewId>("new-task");
  const [selectedSourceName, setSelectedSourceName] = React.useState<string | null>(null);
  const [branch, setBranch] = React.useState<string | null>(null);
  const [model, setModel] = React.useState<string>(NVIDIA_MODELS[0].id);
  const nvidiaModelsQuery = useNvidiaModels();
  const nvidiaModels = nvidiaModelsQuery.models.length ? nvidiaModelsQuery.models : NVIDIA_MODELS;
  const [assistantMessages, setAssistantMessages] = React.useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [assistantPending, setAssistantPending] = React.useState(false);
  const [openSessionName, setOpenSessionName] = React.useState<string | null>(null);

  const [navOpen, setNavOpen] = React.useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = React.useState(false);
  const [memorySheetOpen, setMemorySheetOpen] = React.useState(false);

  const sourcesQuery = useSources({ enabled: true });
  const sources = React.useMemo(() => sourcesQuery.data?.items ?? [], [sourcesQuery.data]);

  // Default to the first available repository once sources load.
  React.useEffect(() => {
    if (!selectedSourceName && sources.length > 0) {
      setSelectedSourceName(sources[0]!.name);
    }
  }, [sources, selectedSourceName]);

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
  const activeSessions = (sessionsQuery.data?.items ?? []).filter(
    (session) => session.activity === "active" || session.activity === "waiting",
  );

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

  const handleSubmitTask = async (prompt: string) => {
    const memoryBlock = pinnedNotes.length > 0 ? `\nKnown memory:\n${pinnedNotes.map((note) => `- ${note.content}`).join("\n")}` : "";
    setAssistantPending(true);
    setAssistantMessages((current) => [...current, { role: "user", content: prompt }, { role: "assistant", content: "" }]);
    const response = await fetch("/api/nvidia/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: `${prompt}${memoryBlock}`, model, source: selectedSourceName, history: assistantMessages }) });
    if (!response.ok || !response.body) { const data = await response.json().catch(() => null); setAssistantPending(false); throw new Error(data?.message ?? "NVIDIA assistant request failed."); }
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    while (true) { const result = await reader.read(); if (result.done) break; const token = decoder.decode(result.value, { stream: true }); setAssistantMessages((current) => { const next = [...current]; const last = next[next.length - 1]; if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + token }; return next; }); }
    setAssistantPending(false);
    toast({ title: "NVIDIA assistant replied", description: "Repository context and next steps are ready.", variant: "success" });
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
      sources={sources}
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
            <NewTaskView messages={assistantMessages} />
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
            <div className="fixed inset-x-0 bottom-0 z-20 bg-background/95 px-3 pb-3 pt-3 pb-safe backdrop-blur-md lg:static lg:bg-transparent lg:pb-6 lg:backdrop-blur-none">
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
                  attachedMemoryCount={pinnedNotes.length}
                  onOpenMemory={() => setMemorySheetOpen(true)}
                  disabled={sources.length === 0 && !sourcesQuery.isPending}
                />
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <RepoPickerSheet
        open={repoPickerOpen}
        onOpenChange={setRepoPickerOpen}
        sources={sources}
        isLoading={sourcesQuery.isPending}
        selectedSource={selectedSourceName}
        onSelect={handleSelectSource}
      />

      <MemoryAttachSheet
        open={memorySheetOpen}
        onOpenChange={setMemorySheetOpen}
        onManageAll={() => handleNavigate("memory")}
      />
    </div>
  );
}

/** The near-empty hero state from the reference design. */
function NewTaskView({ messages }: { messages: Array<{ role: "user" | "assistant"; content: string }> }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-48 pt-6 sm:px-6 lg:pb-10">
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center"><BrandMark className="h-12 w-12" iconClassName="h-7 w-7" /><p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">Tell the NVIDIA assistant what you are trying to build or fix. It will gather context and suggest the next action.</p></div>
      ) : <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "self-end max-w-[86%] rounded-3xl bg-secondary px-5 py-3 text-base text-foreground" : "max-w-[92%] whitespace-pre-wrap px-5 py-3 text-base leading-relaxed text-foreground"}>{message.content}{message.role === "assistant" && index === messages.length - 1 ? <span className="ml-1 inline-block h-5 w-0.5 animate-pulse bg-primary align-middle" aria-label="Assistant is typing" /> : null}</div>)}</div>}
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
