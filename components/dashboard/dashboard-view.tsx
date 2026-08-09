"use client";

import { Inbox, SquarePen } from "lucide-react";
import * as React from "react";

import { SessionCard } from "@/components/dashboard/session-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { POLL_INTERVALS, useSessions } from "@/hooks/use-sessions";
import { errorMessage } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

interface DashboardViewProps {
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

export function DashboardView({
  enabled,
  selectedSource,
  onOpenSession,
  onNewTask,
}: DashboardViewProps) {
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
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              {activeCount > 0 ? (
                <span>{activeCount} active · refreshing every {POLL_INTERVALS.ACTIVE_LIST_MS / 1000}s</span>
              ) : (
                `Refreshing every ${POLL_INTERVALS.IDLE_MS / 1000}s`
              )}
            </p>
          </div>
          <Button size="sm" onClick={onNewTask}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            New
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label="Filter sessions by state"
            className="flex items-center gap-1 rounded-full border border-border/70 bg-card p-1"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={
                  filter === item.id
                    ? "rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground"
                    : "rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                  ? "truncate rounded-full border border-primary/40 bg-primary/15 px-3 py-2 text-xs font-medium text-primary"
                  : "truncate rounded-full border border-border/70 bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {scope === "repo" ? `Only ${selectedSource.fullName}` : "Filter to this repo"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Content states: loading -> error -> empty -> data */}
      {sessionsQuery.isPending ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <li
              key={index}
              className="space-y-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3.5"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-1/2" />
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
          title={sessions.length === 0 ? "No tasks yet" : "Nothing matches this filter"}
          description={
            sessions.length === 0
              ? "Start your first task and Jules will plan, code, and report progress here."
              : "Try a different filter to see your other sessions."
          }
          action={
            sessions.length === 0 ? (
              <Button size="sm" onClick={onNewTask}>
                <SquarePen className="h-4 w-4" aria-hidden="true" />
                New task
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {visibleSessions.map((session) => (
              <SessionCard key={session.name} session={session} onOpen={onOpenSession} />
            ))}
          </ul>

          {/* Live region so polling updates are announced without stealing focus. */}
          <p aria-live="polite" className="sr-only">
            {visibleSessions.length} sessions shown, {activeCount} currently running.
          </p>
        </>
      )}
    </div>
  );
}
