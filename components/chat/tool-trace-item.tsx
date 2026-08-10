"use client";

import {
  BrainCircuit,
  Check,
  CircleSlash,
  FileCode2,
  FolderTree,
  Github,
  LoaderCircle,
  MessageSquareWarning,
  OctagonX,
  Rocket,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import type { AgentToolTrace } from "@/types/agent";

/** Per-tool iconography, so the action trail is scannable at a glance. */
const TOOL_ICONS: Record<string, LucideIcon> = {
  list_repositories: Github,
  get_repository_overview: Search,
  list_repository_files: FolderTree,
  read_repository_file: FileCode2,
  list_repository_issues: MessageSquareWarning,
  list_memory: BrainCircuit,
  save_memory: BrainCircuit,
  list_projects: FolderTree,
  save_project_info: FolderTree,
  list_jules_sessions: Rocket,
  get_jules_session: Rocket,
  start_jules: Rocket,
  stop_jules: OctagonX,
};

interface ToolTraceItemProps {
  /** Verb phrase shown while the call is still in flight. */
  label: string;
  /** Absent while the tool is still running. */
  trace?: AgentToolTrace;
  name: string;
}

/**
 * One step in the agent's action trail: what it did, and whether it worked.
 *
 * Every tool call the agent makes is rendered here - nothing happens invisibly.
 */
export function ToolTraceItem({ label, trace, name }: ToolTraceItemProps) {
  const Icon = TOOL_ICONS[name] ?? Search;
  const status = trace?.status ?? "running";
  const isWrite = name.startsWith("save_") || name === "start_jules" || name === "stop_jules";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border/60 bg-white/[0.02] px-2.5 py-2",
        status === "failed" && "border-red-500/25 bg-red-500/[0.05]",
        status === "skipped" && "opacity-70",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
          status === "failed"
            ? "bg-red-500/15 text-red-300"
            : status === "skipped"
              ? "bg-white/[0.06] text-muted-foreground"
              : isWrite
                ? "bg-primary/15 text-primary"
                : "bg-white/[0.06] text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90">
          <span className="truncate">{trace?.label ?? label}</span>
          <StatusMark status={status} />
        </p>

        {trace ? (
          <p className="break-anywhere mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {trace.summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: "running" | "done" | "failed" | "skipped" }) {
  if (status === "running") {
    return (
      <>
        <LoaderCircle className="h-3 w-3 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">In progress</span>
      </>
    );
  }

  if (status === "failed") {
    return (
      <>
        <TriangleAlert className="h-3 w-3 shrink-0 text-red-400" aria-hidden="true" />
        <span className="sr-only">Failed</span>
      </>
    );
  }

  if (status === "skipped") {
    return (
      <>
        <CircleSlash className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Skipped</span>
      </>
    );
  }

  return (
    <>
      <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
      <span className="sr-only">Done</span>
    </>
  );
}
