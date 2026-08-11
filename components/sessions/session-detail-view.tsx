"use client";

import {
  ArrowLeft,
  Check,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  Workflow,
} from "lucide-react";
import * as React from "react";

import { ActivityItem } from "@/components/sessions/activity-item";
import { TaskComposer } from "@/components/sessions/task-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  POLL_INTERVALS,
  useActivities,
  useApprovePlan,
  useSendMessage,
  useSession,
} from "@/hooks/use-sessions";
import { DEFAULT_NVIDIA_MODEL_ID, NVIDIA_MODELS } from "@/lib/nvidia-models";
import {
  cn,
  errorMessage,
  formatAbsoluteTime,
  sessionStateClasses,
  sessionStateLabel,
} from "@/lib/utils";

interface SessionDetailViewProps {
  sessionName: string;
  enabled: boolean;
  onBack: () => void;
}

export function SessionDetailView({ sessionName, enabled, onBack }: SessionDetailViewProps) {
  const { toast } = useToast();

  const sessionQuery = useSession(sessionName, { enabled });
  const session = sessionQuery.data ?? null;

  const isSessionActive = session
    ? session.isActive || session.activity === "waiting"
    : true;

  const activitiesQuery = useActivities(sessionName, { enabled, isSessionActive });
  const approvePlan = useApprovePlan(sessionName);
  const sendMessage = useSendMessage(sessionName);

  const activities = activitiesQuery.data?.items ?? [];

  const handleApprove = async () => {
    try {
      await approvePlan.mutateAsync();
      toast({ title: "Plan approved", description: "Jules is starting the work.", variant: "success" });
    } catch (error) {
      toast({
        title: "Could not approve the plan",
        description: errorMessage(error),
        variant: "error",
      });
    }
  };

  const handleSend = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    try {
      await sendMessage.mutateAsync(trimmed);
      toast({ title: "Message sent", variant: "success" });
    } catch (error) {
      toast({ title: "Could not send message", description: errorMessage(error), variant: "error" });
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All sessions
      </Button>

      {/* Header */}
      {sessionQuery.isPending ? (
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : sessionQuery.isError ? (
        <ErrorState
          title="Could not load this session"
          message={errorMessage(sessionQuery.error)}
          onRetry={() => void sessionQuery.refetch()}
          isRetrying={sessionQuery.isFetching}
        />
      ) : session ? (
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <h2 className="text-base font-semibold leading-snug text-foreground break-anywhere">
            {session.title}
          </h2>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn("gap-1.5 border", sessionStateClasses(session.state))}>
              {session.isActive ? (
                <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : null}
              {sessionStateLabel(session.state)}
            </Badge>
            {session.sourceFullName ? (
              <Badge variant="outline" className="border-border/80">
                {session.sourceFullName}
              </Badge>
            ) : null}
            {session.branch ? (
              <Badge variant="outline" className="gap-1 border-border/80">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {session.branch}
              </Badge>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Created {formatAbsoluteTime(session.createTime)} · updated{" "}
            {formatAbsoluteTime(session.updateTime)}
          </p>

          {session.prompt ? (
            <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-black/25 p-3 text-sm leading-relaxed text-muted-foreground break-anywhere">
              {session.prompt}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {session.pullRequestUrl ? (
              <Button size="sm" variant="outline" asChild>
                <a href={session.pullRequestUrl} target="_blank" rel="noopener noreferrer">
                  <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                  View pull request
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </a>
              </Button>
            ) : null}
            {session.julesUrl ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={session.julesUrl} target="_blank" rel="noopener noreferrer">
                  Open in Jules
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </a>
              </Button>
            ) : null}
          </div>

          {/* Plan approval gate */}
          {session.requiresPlanApproval ? (
            <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-950/25 p-3.5">
              <p className="text-sm font-medium text-amber-100">Plan needs your approval</p>
              <p className="text-sm leading-relaxed text-amber-200/80">
                Review the plan in the timeline below, then approve it so Jules can start coding.
              </p>
              <Button size="sm" onClick={() => void handleApprove()} disabled={approvePlan.isPending}>
                {approvePlan.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {approvePlan.isPending ? "Approving…" : "Approve plan"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Activity timeline */}
      <section aria-label="Activity timeline" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
          <span className="text-xs text-muted-foreground">
            {isSessionActive
              ? `Live · every ${POLL_INTERVALS.ACTIVE_DETAIL_MS / 1000}s`
              : `Every ${POLL_INTERVALS.IDLE_MS / 1000}s`}
          </span>
        </div>

        {activitiesQuery.isPending ? (
          <ul className="space-y-4" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <li key={index} className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : activitiesQuery.isError ? (
          <ErrorState
            title="Could not load activity"
            message={errorMessage(activitiesQuery.error)}
            onRetry={() => void activitiesQuery.refetch()}
            isRetrying={activitiesQuery.isFetching}
          />
        ) : activities.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No activity yet"
            description="Jules has not reported anything for this task yet. This view updates automatically."
          />
        ) : (
          <ul className="pl-0.5">
            {activities.map((activity) => (
              <ActivityItem key={activity.name || activity.id} activity={activity} />
            ))}
          </ul>
        )}

        <p aria-live="polite" className="sr-only">
          {activities.length} activity entries. Current state:{" "}
          {session ? sessionStateLabel(session.state) : "loading"}.
        </p>
      </section>

      {/* Home-style session composer. The model selector remains visible but locked,
          while the message input continues to answer Jules in this session. */}
      <section aria-label="Send a message to Jules" className="pt-2">
        {session ? (
          <TaskComposer
            source={null}
            branch={session.branch}
            onBranchChange={() => undefined}
            model={DEFAULT_NVIDIA_MODEL_ID}
            models={NVIDIA_MODELS}
            onModelChange={() => undefined}
            onSubmit={async (message) => handleSend(message)}
            isSubmitting={sendMessage.isPending}
            modelDisabled
          />
        ) : null}
      </section>
    </div>
  );
}
