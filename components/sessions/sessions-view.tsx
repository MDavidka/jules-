"use client";

import { ArrowRight, Inbox, SquarePen } from "lucide-react";
import * as React from "react";

import { SessionCard } from "@/components/sessions/session-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { POLL_INTERVALS, useSessions } from "@/hooks/use-sessions";
import { errorMessage } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

interface SessionsViewProps {
  enabled: boolean;
  selectedSource: NormalizedSource | null;
  onOpenSession: (sessionName: string) => void;
  onNewTask: () => void;
}

type Filter = "all" | "active" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "done", label: "Finished" },
];

export function SessionsView({
  enabled,
  selectedSource,
  onOpenSession,
  onNewTask,
}: SessionsViewProps) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [scope, setScope] = React.useState<"repo" | "all">("all");

  const sourceFilter = scope === "repo" ? (selectedSource?.name ?? null) : null;
  const sessionsQuery = useSessions({ enabled, source: sourceFilter });

  const sessions = React.useMemo(() => sessionsQuery.data?.items ?? [], [sessionsQuery.data]);
  const activeCount = sessionsQuery.data?.activeCount ?? 0;

  const visibleSessions = React.useMemo(() => {
    if (filter === "active") {
      return sessions.filter(
        (session) => session.activity === "active" || session.activity === "waiting",
      );
    }
    if (filter === "done") {
      return sessions.filter(
        (session) => session.activity === "done" || session.activity === "failed",
      );
    }
    return sessions;
  }, [sessions, filter]);

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Sessions</h2>
            <p className="text-sm text-muted-foreground">
              {activeCount > 0 ? (
                <span>{activeCount} active · refreshing every {POLL_INTERVALS.ACTIVE_LIST_MS / 1000}s</span>
              ) : (
                `Refreshing every ${POLL_INTERVALS.IDLE_MS / 1000}s`
              )}
            </p>
          </div>
          <Button
            size="sm"
            onClick={onNewTask}
            className="shrink-0 rounded-full bg-foreground px-4 text-background shadow-sm hover:bg-foreground/90"
          >
            Start for free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter sessions by state"
            className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-card/70 p-1"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={
                  filter === item.id
                    ? "min-h-9 rounded-full bg-white/[0.1] px-4 text-xs font-medium text-foreground shadow-sm"
                    : "min-h-9 rounded-full px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          {selectedSource ? (
            <button
              type="button"
              onClick={() => setScope((current) => (current === "repo" ? "all" : "repo"))}
              aria-pressed={scope === "repo"}
              className={
                scope === "repo"
                  ? "min-h-11 truncate rounded-full border border-primary/40 bg-primary/15 px-4 text-xs font-medium text-primary"
                  : "min-h-11 truncate rounded-full border border-white/[0.08] bg-card/70 px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
              }
            >
              {scope === "repo" ? `Only ${selectedSource.fullName}` : "Filter to this repo"}
            </button>
          ) : null}
        </div>
      </div>

      {sessionsQuery.isPending ? (
        <ul className="mx-auto w-full max-w-2xl space-y-4 px-5 sm:px-0" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <li
              key={index}
              className="min-h-[132px] space-y-4 rounded-[1.45rem] border-2 border-white/[0.1] bg-card/70 px-5 py-5"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </li>
          ))}
        </ul>
      ) : sessionsQuery.isError ? (
        <ErrorState
          title="Could not load sessions"
          message={errorMessage(sessionsQuery.error)}
          onRetry={() => void sessionsQuery.refetch()}
          isRetrying={sessionsQuery.isFetching}
        />
      ) : visibleSessions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={sessions.length === 0 ? "No sessions yet" : "Nothing matches this filter"}
          description={
            sessions.length === 0
              ? "Start your first task and Jules will plan, code, and report progress here."
              : "Try a different filter to see your other sessions."
          }
          action={
            sessions.length === 0 ? (
              <Button size="sm" onClick={onNewTask}>
                <SquarePen className="h-4 w-4" aria-hidden="true" />
                Start for free
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="mx-auto w-full max-w-2xl space-y-4 px-5 sm:px-0">
            {visibleSessions.map((session) => (
              <SessionCard key={session.name} session={session} onOpen={onOpenSession} />
            ))}
          </ul>

          <p aria-live="polite" className="sr-only">
            {visibleSessions.length} sessions shown, {activeCount} active.
          </p>
        </>
      )}
    </div>
  );
}
