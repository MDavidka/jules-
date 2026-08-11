"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  Zap,
} from "lucide-react";
import * as React from "react";

import { ActivityItem } from "@/components/sessions/activity-item";
import { TaskComposer } from "@/components/sessions/task-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { ErrorState } from "@/components/ui/error-state";
import { ExpandableText } from "@/components/ui/expandable-text";
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
  formatRelativeTime,
  sessionStateClasses,
  sessionStateLabel,
} from "@/lib/utils";
import type { NormalizedActivity, NormalizedSession } from "@/types/jules";

interface SessionDetailViewProps {
  sessionName: string;
  enabled: boolean;
  onBack: () => void;
}

/**
 * Session view. It mirrors the home conversation layout: a compact header, the
 * submitted prompt, the single most recent agentic step, and every earlier step
 * behind a disclosure. Long text is always clamped but openable.
 */
export function SessionDetailView({ sessionName, enabled, onBack }: SessionDetailViewProps) {
  const { toast } = useToast();

  const sessionQuery = useSession(sessionName, { enabled });
  const session = sessionQuery.data ?? null;

  const isSessionActive = session ? session.isActive || session.activity === "waiting" : true;

  const activitiesQuery = useActivities(sessionName, { enabled, isSessionActive });
  const approvePlan = useApprovePlan(sessionName);
  const sendMessage = useSendMessage(sessionName);

  // Newest first, so the current step is always the one on top.
  const orderedActivities = React.useMemo(() => {
    const items = activitiesQuery.data?.items ?? [];
    return [...items].sort(
      (a, b) => new Date(b.createTime ?? 0).getTime() - new Date(a.createTime ?? 0).getTime(),
    );
  }, [activitiesQuery.data]);

  const latestActivity = orderedActivities[0] ?? null;
  const earlierActivities = orderedActivities.slice(1);

  const handleApprove = async () => {
    try {
      await approvePlan.mutateAsync();
      toast({ title: "Task accepted", description: "Jules is starting the work.", variant: "success" });
    } catch (error) {
      toast({ title: "Could not accept the task", description: errorMessage(error), variant: "error" });
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
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 min-h-9 px-2 text-xs">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All sessions
      </Button>

      {sessionQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="ml-auto h-28 w-[80%] rounded-3xl" />
        </div>
      ) : sessionQuery.isError ? (
        <ErrorState
          title="Could not load this session"
          message={errorMessage(sessionQuery.error)}
          onRetry={() => void sessionQuery.refetch()}
          isRetrying={sessionQuery.isFetching}
        />
      ) : session ? (
        <>
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground break-anywhere">
                {session.title}
              </h2>
              <p className="text-xs text-muted-foreground">
                Created {formatAbsoluteTime(session.createTime)} · updated{" "}
                {formatAbsoluteTime(session.updateTime)}
              </p>
            </div>

            {session.pullRequestUrl ? (
              <a
                href={session.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={session.pullRequestTitle ?? "View pull request"}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Zap className="h-4 w-4" aria-hidden="true" />
                PR
                <span className="sr-only">View pull request</span>
              </a>
            ) : null}
          </header>

          <SessionMetaDisclosure session={session} />

          {session.prompt ? (
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-3xl bg-secondary px-4 py-3 text-sm leading-relaxed text-foreground">
                <ExpandableText lines={6}>{session.prompt}</ExpandableText>
              </div>
            </div>
          ) : null}

          {/* Latest agentic step */}
          {activitiesQuery.isPending ? (
            <div className="space-y-2 py-4">
              <Skeleton className="mx-auto h-5 w-40" />
              <Skeleton className="mx-auto h-3 w-3/4" />
            </div>
          ) : activitiesQuery.isError ? (
            <ErrorState
              title="Could not load activity"
              message={errorMessage(activitiesQuery.error)}
              onRetry={() => void activitiesQuery.refetch()}
              isRetrying={activitiesQuery.isFetching}
            />
          ) : (
            <LatestStep
              activity={latestActivity}
              session={session}
              isSessionActive={isSessionActive}
            />
          )}

          {session.requiresPlanApproval ? (
            <div className="flex justify-start">
              <Button
                onClick={() => void handleApprove()}
                disabled={approvePlan.isPending}
                className="min-h-11 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-black hover:bg-emerald-400"
              >
                {approvePlan.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {approvePlan.isPending ? "Accepting…" : "Accept task"}
              </Button>
            </div>
          ) : null}

          {earlierActivities.length > 0 ? (
            <StepDisclosure
              label={`Earlier steps (${earlierActivities.length})`}
              hint={
                isSessionActive
                  ? `Live · every ${POLL_INTERVALS.ACTIVE_DETAIL_MS / 1000}s`
                  : `Every ${POLL_INTERVALS.IDLE_MS / 1000}s`
              }
            >
              <ul className="pl-0.5 pt-3">
                {earlierActivities.map((activity) => (
                  <ActivityItem key={activity.name || activity.id} activity={activity} />
                ))}
              </ul>
            </StepDisclosure>
          ) : null}

          <p aria-live="polite" className="sr-only">
            {orderedActivities.length} steps. Current state: {sessionStateLabel(session.state)}.
          </p>

          <section aria-label="Send a message to Jules" className="pt-1">
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
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Repository, branch, state, and the Jules link stay available but out of the way. */
function SessionMetaDisclosure({ session }: { session: NormalizedSession }) {
  return (
    <details className="group rounded-2xl border border-border/60 bg-card/50 px-3.5 py-2.5">
      <summary className="flex cursor-pointer touch-target list-none items-center gap-2 text-xs font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
        Session details
        <Badge className={cn("ml-auto gap-1.5 border", sessionStateClasses(session.state))}>
          {sessionStateLabel(session.state)}
        </Badge>
      </summary>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
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
        {session.julesUrl ? (
          <Button size="sm" variant="ghost" asChild className="ml-auto min-h-9 px-2 text-xs">
            <a href={session.julesUrl} target="_blank" rel="noopener noreferrer">
              Open in Jules
              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The always-visible current step. Body text is clamped and openable, and any
 * plan or artifacts stay behind a disclosure so the step stays scannable.
 */
function LatestStep({
  activity,
  session,
  isSessionActive,
}: {
  activity: NormalizedActivity | null;
  session: NormalizedSession;
  isSessionActive: boolean;
}) {
  const { label, tone } = stepHeadline(activity, session);
  const hasDetails = Boolean(activity?.plan?.steps?.length || activity?.artifacts.length);

  return (
    <section aria-label="Current step" className="space-y-2 py-1">
      <div className="flex items-center gap-2">
        {isSessionActive ? (
          <DotMatrixLoader />
        ) : session.activity === "failed" ? (
          <CircleX className="h-4 w-4 text-red-400" aria-hidden="true" />
        ) : (
          <CircleCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        )}
        <p className={cn("text-sm font-semibold", tone)}>{label}</p>
        {activity?.createTime ? (
          <time dateTime={activity.createTime} className="ml-auto text-xs text-muted-foreground">
            {formatRelativeTime(activity.createTime)}
          </time>
        ) : null}
      </div>

      {activity?.body ? (
        <ExpandableText lines={4} className="text-center text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          {activity.body}
        </ExpandableText>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {activity ? "No details reported for this step yet." : "Jules has not reported a step yet."}
        </p>
      )}

      {activity && hasDetails ? (
        <StepDisclosure label="Step details">
          <ul className="pl-0.5 pt-3">
            <ActivityItem activity={activity} />
          </ul>
        </StepDisclosure>
      ) : null}
    </section>
  );
}

function StepDisclosure({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-border/60 bg-card/40 px-3.5 py-2.5">
      <summary className="flex cursor-pointer touch-target list-none items-center gap-2 text-xs font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
        {label}
        {hint ? <span className="ml-auto text-[11px] text-muted-foreground/80">{hint}</span> : null}
      </summary>
      {children}
    </details>
  );
}

/** Short, human label for the current step, matching the home activity wording. */
function stepHeadline(activity: NormalizedActivity | null, session: NormalizedSession) {
  if (session.activity === "failed") return { label: "failed", tone: "text-red-300" };
  if (session.activity === "done") return { label: "done", tone: "text-emerald-300" };

  if (session.requiresPlanApproval) {
    return { label: "waiting for your approval..", tone: "text-amber-200" };
  }
  if (session.awaitingUserFeedback) {
    return { label: "Jules asking questions..", tone: "text-amber-200" };
  }

  switch (activity?.kind) {
    case "planGenerated":
      return { label: "planning the fix..", tone: "text-foreground" };
    case "planApproved":
      return { label: "starting the work..", tone: "text-foreground" };
    case "agentMessaged":
      return { label: "writing the answer..", tone: "text-foreground" };
    case "userMessaged":
      return { label: "reading your message..", tone: "text-foreground" };
    case "progressUpdated":
      return { label: activity.title || "working..", tone: "text-foreground" };
    default:
      return { label: session.isActive ? "working.." : "queued..", tone: "text-foreground" };
  }
}
