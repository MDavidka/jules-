"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
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
import { SkillsView } from "@/components/skills/skills-view";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useJulesConfig } from "@/hooks/use-jules-config";
import { useMemory } from "@/hooks/use-memory";
import { useCreateSession, useSessions } from "@/hooks/use-sessions";
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

  const createSession = useCreateSession();

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
    if (!selectedSource) throw new Error("Pick a repository first.");

    // Append pinned memory so the agent gets the saved project context.
    const memoryBlock =
      pinnedNotes.length > 0
        ? `\n\n---\nProject memory:\n${pinnedNotes.map((note) => `- ${note.content}`).join("\n")}`
        : "";

    const result = await createSession.mutateAsync({
      prompt: `${prompt}${memoryBlock}`,
      source: selectedSource.name,
      ...(branch ?? selectedSource.defaultBranch
        ? { branch: branch ?? selectedSource.defaultBranch ?? undefined }
        : {}),
    });

    toast({
      // Jules is asynchronous: this only confirms submission.
      title: "Task submitted to Jules",
      description: "Following live progress now.",
      variant: "success",
    });

    handleOpenSession(result.session.name);
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
      <aside className="hidden w-72 shrink-0 border-r border-border/70 lg:block">
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
            <NewTaskView
              activeSessionCount={activeSessions.length}
              onOpenDashboard={() => handleNavigate("dashboard")}
            />
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
              ) : activeView === "skills" ? (
                <SkillsView enabled />
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
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/50 bg-background/95 px-3 pb-3 pt-3 pb-safe backdrop-blur-md lg:static lg:border-t-0 lg:bg-transparent lg:pb-6 lg:backdrop-blur-none">
              <div className="mx-auto w-full max-w-3xl">
                <TaskComposer
                  source={selectedSource}
                  branch={branch}
                  onBranchChange={setBranch}
                  onSubmit={handleSubmitTask}
                  isSubmitting={createSession.isPending}
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
function NewTaskView({
  activeSessionCount,
  onOpenDashboard,
}: {
  activeSessionCount: number;
  onOpenDashboard: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-48 pt-10 text-center lg:pb-10">
      <BrandMark className="h-12 w-12" iconClassName="h-7 w-7" />
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Describe a task and Jules will plan it, write the code, and report back here.
      </p>

      {activeSessionCount > 0 ? (
        <button
          type="button"
          onClick={onOpenDashboard}
          className="mt-5 inline-flex touch-target items-center gap-2 rounded-full border border-border/80 bg-card px-4 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-sky-400" aria-hidden="true" />
          {activeSessionCount} task{activeSessionCount === 1 ? "" : "s"} running
        </button>
      ) : null}
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
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
        <div className="flex items-center gap-2.5">
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <h1 className="text-base font-semibold text-amber-50">Configuration required</h1>
        </div>
        <p role="alert" className="text-sm leading-relaxed text-amber-100/85 break-anywhere">
          {message}
        </p>
        <div className="space-y-2 rounded-xl border border-amber-500/20 bg-black/30 p-3">
          <p className="text-xs font-medium text-amber-100/90">Required environment variables</p>
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-amber-100/70">
            <li>MONGO_URI</li>
            <li>JULES_KEY_ENCRYPTION_SECRET</li>
          </ul>
          <p className="text-[11px] leading-relaxed text-amber-100/60">
            Copy .env.example to .env.local, fill both values, then restart the dev server.
          </p>
        </div>
      </div>
    </main>
  );
}
