"use client";

import { Check, CircleX, GitPullRequest, Minus, MoreHorizontal } from "lucide-react";

import { cn, formatRelativeTime, sessionStateLabel } from "@/lib/utils";
import type { NormalizedSession } from "@/types/jules";

interface SessionCardProps {
  session: NormalizedSession;
  onOpen: (sessionName: string) => void;
}

interface SessionStatus {
  label: string;
  icon: typeof Check;
  className: string;
}

function sessionStatus(session: NormalizedSession): SessionStatus {
  if (session.activity === "done") {
    return { label: "Done", icon: Check, className: "bg-emerald-400/10 text-emerald-300" };
  }

  if (session.activity === "failed") {
    return { label: "failed", icon: CircleX, className: "bg-red-400/10 text-red-300" };
  }

  if (session.activity === "waiting") {
    return { label: "Jules asking questions", icon: Minus, className: "bg-amber-400/10 text-amber-300" };
  }

  if (session.activity === "active") {
    return { label: "working", icon: MoreHorizontal, className: "bg-white/[0.08] text-zinc-200" };
  }

  return { label: sessionStateLabel(session.state), icon: MoreHorizontal, className: "bg-white/[0.08] text-zinc-300" };
}

export function SessionCard({ session, onOpen }: SessionCardProps) {
  const status = sessionStatus(session);
  const StatusIcon = status.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(session.name)}
        className={cn(
          "group flex min-h-[132px] w-full flex-col items-start justify-between gap-5 rounded-[1.45rem] border-2 border-white/[0.13] bg-card/75 px-5 py-5 text-left shadow-[0_12px_30px_rgba(0,0,0,0.1)] transition-all duration-200",
          "hover:border-white/[0.24] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <div className="flex w-full items-start justify-between gap-3">
          <h3 className="line-clamp-3 min-w-0 max-w-[38rem] text-sm font-semibold leading-5 text-foreground break-anywhere">
            {session.title}
          </h3>
          {session.pullRequestUrl ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <GitPullRequest className="h-3 w-3" aria-hidden="true" />
              PR
            </span>
          ) : null}
        </div>

        <div className={cn("inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold", status.className)}>
          <StatusIcon className={cn("h-3.5 w-3.5", session.activity === "active" && "animate-pulse")} strokeWidth={2.5} aria-hidden="true" />
          <span>{status.label}</span>
        </div>

        <span className="sr-only">
          {session.sourceFullName ? `${session.sourceFullName}. ` : ""}
          Updated {formatRelativeTime(session.updateTime ?? session.createTime)}.
        </span>
      </button>
    </li>
  );
}
