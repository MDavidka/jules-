"use client";

import {
  Bot,
  Check,
  CircleCheck,
  ListChecks,
  TriangleAlert,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type { ActivityKind, NormalizedActivity } from "@/types/jules";

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
          activity.kind === "agentMessaged" ? (
            <MarkdownContent className="mt-1">{activity.body}</MarkdownContent>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground break-anywhere">
              {activity.body}
            </p>
          )
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
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground break-anywhere">
                        {step.title ?? `Step ${index + 1}`}
                      </span>
                      <Badge variant="outline" className="gap-1 border-primary/25 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
                        <Bot className="h-3 w-3" aria-hidden="true" />
                        Agentic
                      </Badge>
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
      </div>
    </li>
  );
}
