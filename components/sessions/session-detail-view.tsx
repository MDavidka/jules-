"use client";

import { Check, LoaderCircle, Zap } from "lucide-react";
import * as React from "react";

import { SessionStepRow } from "@/components/sessions/session-step-row";
import { TaskComposer } from "@/components/sessions/task-composer";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ExpandableText } from "@/components/ui/expandable-text";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useActivities, useApprovePlan, useSendMessage, useSession } from "@/hooks/use-sessions";
import { DEFAULT_NVIDIA_MODEL_ID, NVIDIA_MODELS } from "@/lib/nvidia-models";
import { buildSessionSteps, liveStep } from "@/lib/session-steps";
import { errorMessage, formatAbsoluteTime, sessionStateLabel } from "@/lib/utils";

interface SessionDetailViewProps {
  sessionName: string;
  enabled: boolean;
}

/**
 * Session view: a compact header, the request, then one uniform row per agentic
 * step in chronological order. The newest step always sits at the bottom, right
 * above the composer.
 */
export function SessionDetailView({ sessionName, enabled }: SessionDetailViewProps) {
  const { toast } = useToast();

  const sessionQuery = useSession(sessionName, { enabled });
  const session = sessionQuery.data ?? null;

  const isSessionActive = session ? session.isActive || session.activity === "waiting" : true;

  const activitiesQuery = useActivities(sessionName, { enabled, isSessionActive });
  const approvePlan = useApprovePlan(sessionName);
  const sendMessage = useSendMessage(sessionName);

  const steps = React.useMemo(
    () => buildSessionSteps(activitiesQuery.data?.items ?? []),
    [activitiesQuery.data],
  );

  const current = session
    ? liveStep(session, steps[steps.length - 1]?.label ?? null)
    : null;

  // The newest step must stay visible as the timeline grows.
  const bottomRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps.length, current?.label]);

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

  if (sessionQuery.isPending) {
    return (
      <div className="space-y-3 pb-44">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="ml-auto h-24 w-[80%] rounded-2xl" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="pb-44">
        <ErrorState
          title="Could not load this session"
          message={errorMessage(sessionQuery.error)}
          onRetry={() => void sessionQuery.refetch()}
          isRetrying={sessionQuery.isFetching}
        />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="pb-44">
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
            aria-label={
              session.pullRequestTitle
                ? `View pull request: ${session.pullRequestTitle}`
                : "View pull request"
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            PR
          </a>
        ) : null}
      </header>

      {session.prompt ? (
        <div className="mt-5 flex justify-end">
          <div className="max-w-[88%] rounded-2xl bg-secondary px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
            <ExpandableText lines={4}>{session.prompt}</ExpandableText>
          </div>
        </div>
      ) : null}

      {activitiesQuery.isError ? (
        <div className="mt-5">
          <ErrorState
            title="Could not load activity"
            message={errorMessage(activitiesQuery.error)}
            onRetry={() => void activitiesQuery.refetch()}
            isRetrying={activitiesQuery.isFetching}
          />
        </div>
      ) : (
        <ul className="mt-4">
          {activitiesQuery.isPending ? (
            <li className="py-2">
              <Skeleton className="h-4 w-40" />
            </li>
          ) : (
            steps.map((step) => <SessionStepRow key={step.id} step={step} />)
          )}
          {current ? <SessionStepRow key={current.label} step={current} /> : null}
        </ul>
      )}

      {session.requiresPlanApproval ? (
        <div className="mt-3">
          <Button
            onClick={() => void handleApprove()}
            disabled={approvePlan.isPending}
            className="min-h-10 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            {approvePlan.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {approvePlan.isPending ? "Accepting..." : "Accept task"}
          </Button>
        </div>
      ) : null}

      <div ref={bottomRef} aria-hidden="true" className="h-1" />

      <p aria-live="polite" className="sr-only">
        {steps.length} steps. Current state: {sessionStateLabel(session.state)}.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 pt-3 pb-safe sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
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
        </div>
      </div>
    </div>
  );
}
