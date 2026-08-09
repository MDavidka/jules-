"use client";

import {
  Bot,
  Check,
  CircleCheck,
  ListChecks,
  Terminal,
  TriangleAlert,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ActivityKind, Artifact, NormalizedActivity } from "@/types/jules";

const KIND_META: Record<ActivityKind, { icon: LucideIcon; tint: string }> = {
  agentMessaged: { icon: Bot, tint: "text-primary" },
  userMessaged: { icon: User, tint: "text-sky-300" },
  planGenerated: { icon: ListChecks, tint: "text-amber-300" },
  planApproved: { icon: Check, tint: "text-emerald-300" },
  progressUpdated: { icon: Workflow, tint: "text-muted-foreground" },
  sessionCompleted: { icon: CircleCheck, tint: "text-emerald-300" },
  sessionFailed: { icon: TriangleAlert, tint: "text-red-400" },
  unknown: { icon: Workflow, tint: "text-muted-foreground" },
};

export function ActivityItem({ activity }: { activity: NormalizedActivity }) {
  const { icon: Icon, tint } = KIND_META[activity.kind];

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
          <Icon className={cn("h-4 w-4", tint)} aria-hidden="true" />
        </span>
        {/* Connector line between timeline entries. */}
        <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border/70" />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-medium text-foreground">{activity.title}</p>
          <time
            dateTime={activity.createTime ?? undefined}
            className="text-xs text-muted-foreground"
          >
            {formatRelativeTime(activity.createTime)}
          </time>
        </div>

        {activity.body ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground break-anywhere">
            {activity.body}
          </p>
        ) : null}

        {/* Plan steps */}
        {activity.plan?.steps?.length ? (
          <ol className="mt-2 space-y-1.5 rounded-xl border border-border/70 bg-card/60 p-3">
            {activity.plan.steps
              .slice()
              .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
              .map((step, index) => (
                <li key={step.id ?? index} className="flex gap-2.5 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                    {(step.index ?? index) + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground break-anywhere">
                      {step.title ?? `Step ${index + 1}`}
                    </span>
                    {step.description ? (
                      <span className="mt-0.5 block leading-relaxed text-muted-foreground break-anywhere">
                        {step.description}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
          </ol>
        ) : null}

        {activity.artifacts.length > 0 ? (
          <div className="mt-2 space-y-2">
            {activity.artifacts.map((artifact, index) => (
              <ArtifactView key={index} artifact={artifact} />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ArtifactView({ artifact }: { artifact: Artifact }) {
  if (artifact.changeSet?.gitPatch) {
    const { unidiffPatch, suggestedCommitMessage, baseCommitId } = artifact.changeSet.gitPatch;

    return (
      <details className="group rounded-xl border border-border/70 bg-black/40">
        <summary className="flex cursor-pointer touch-target items-center gap-2 px-3 text-sm text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <Badge variant="outline" className="border-border/80">
            diff
          </Badge>
          <span className="min-w-0 flex-1 truncate">
            {suggestedCommitMessage ?? "Code changes"}
          </span>
        </summary>
        <div className="border-t border-border/70 px-3 py-2">
          {baseCommitId ? (
            <p className="pb-1.5 font-mono text-[11px] text-muted-foreground">
              base {baseCommitId.slice(0, 10)}
            </p>
          ) : null}
          <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre font-mono text-[11px] leading-relaxed text-muted-foreground">
            {unidiffPatch ?? "(empty patch)"}
          </pre>
        </div>
      </details>
    );
  }

  if (artifact.bashOutput) {
    const { command, output, exitCode } = artifact.bashOutput;
    const failed = typeof exitCode === "number" && exitCode !== 0;

    return (
      <details className="rounded-xl border border-border/70 bg-black/40">
        <summary className="flex cursor-pointer touch-target items-center gap-2 px-3 text-sm marker:content-none [&::-webkit-details-marker]:hidden">
          <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
            {command ?? "command"}
          </code>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 border-border/80 font-mono text-[10px]",
              failed && "border-red-500/30 text-red-300",
            )}
          >
            exit {exitCode ?? "?"}
          </Badge>
        </summary>
        {output ? (
          <pre className="scrollbar-thin max-h-60 overflow-auto whitespace-pre-wrap border-t border-border/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {output}
          </pre>
        ) : null}
      </details>
    );
  }

  if (artifact.media?.data && artifact.media.mimeType?.startsWith("image/")) {
    return (
      <img
        src={`data:${artifact.media.mimeType};base64,${artifact.media.data}`}
        alt="Screenshot produced by Jules"
        className="max-h-72 w-full rounded-xl border border-border/70 object-contain"
      />
    );
  }

  return null;
}
