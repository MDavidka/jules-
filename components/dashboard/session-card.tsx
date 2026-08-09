"use client";

import { ChevronRight, GitBranch, GitPullRequest, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  cn,
  formatRelativeTime,
  sessionStateClasses,
  sessionStateLabel,
} from "@/lib/utils";
import type { NormalizedSession } from "@/types/jules";

interface SessionCardProps {
  session: NormalizedSession;
  onOpen: (sessionName: string) => void;
}

export function SessionCard({ session, onOpen }: SessionCardProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(session.name)}
        className={cn(
          "group flex w-full items-start gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3.5 text-left transition-colors",
          "hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground break-anywhere">
              {session.title}
            </h3>
            <ChevronRight
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn("gap-1.5 border", sessionStateClasses(session.state))}>
              {session.isActive ? (
                <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : null}
              {sessionStateLabel(session.state)}
            </Badge>

            {session.pullRequestUrl ? (
              <Badge variant="outline" className="gap-1 border-border/80">
                <GitPullRequest className="h-3 w-3" aria-hidden="true" />
                PR
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {session.sourceFullName ? (
              <span className="truncate">{session.sourceFullName}</span>
            ) : null}
            {session.branch ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {session.branch}
              </span>
            ) : null}
            <span aria-hidden="true">·</span>
            <time dateTime={session.updateTime ?? undefined}>
              {formatRelativeTime(session.updateTime ?? session.createTime)}
            </time>
          </div>
        </div>
      </button>
    </li>
  );
}
