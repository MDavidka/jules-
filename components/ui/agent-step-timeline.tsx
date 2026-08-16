"use client";

import * as React from "react";

import { FileTypeBadge } from "@/components/icons/file-type-badge";
import { GitHubMark } from "@/components/icons/github-mark";
import { InstanceTypeIcon } from "@/components/icons/instance-type-icon";
import { BrandMark } from "@/components/layout/brand-mark";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { cn } from "@/lib/utils";

/** Which subagent produced a step; decides the icon and the subtitle shape. */
export type AgentStepProvider = "git" | "jules" | "instance" | "thinking";
export type AgentStepStatus = "running" | "completed" | "waiting_approval" | "failed" | "skipped";

export interface AgentStep {
  id: string;
  provider: AgentStepProvider;
  tool: string;
  title: string;
  status: AgentStepStatus;
  startedAt: string;
  completedAt?: string;
  /** git: "owner/repo" plus the files touched. */
  repository?: string;
  ref?: string;
  files?: string[];
  /** jules: the session this step belongs to. */
  sessionLabel?: string;
  /** instance: the SSH target and the command that ran on it. */
  instanceName?: string;
  instanceType?: string;
  username?: string;
  host?: string;
  port?: number;
  command?: string;
  /** thinking: the reasoning summary, otherwise raw tool output. */
  output?: string;
}

interface AgentStepTimelineProps {
  startedAt: string;
  steps: AgentStep[];
  active: boolean;
  /** Overrides the heading, which otherwise tracks the newest step. */
  title?: string;
  className?: string;
}

const MAX_VISIBLE_FILES = 6;

/**
 * Mobile-first agent activity timeline: a heading with a live elapsed timer,
 * then one railed row per step. Each row carries the real logo for its
 * subagent — the GitHub mark for repository work, the instance's own operating
 * system mark for SSH work — followed by its target and either the files it
 * touched or the command it ran.
 *
 * Rows stay deliberately quiet: status is carried by the rail node's colour, and
 * a status label only appears when a step needs attention.
 */
export function AgentStepTimeline({ startedAt, steps, active, title, className }: AgentStepTimelineProps) {
  const latest = steps[steps.length - 1];
  // The heading names the task, so it stays on the first step rather than
  // flickering through every tool call underneath it.
  const heading = title ?? steps[0]?.title ?? "working on task";

  return (
    <section className={cn("max-w-full", className)} aria-label="Agent activity">
      <div className="flex items-center gap-3">
        {active ? (
          <DotMatrixLoader className="h-5 w-5" dotClassName="h-1 w-1" />
        ) : (
          <StaticDotGrid className="h-5 w-5" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{heading}</h2>
        <ElapsedTime startedAt={startedAt} endedAt={latest?.completedAt} active={active} />
      </div>

      {steps.length === 0 ? (
        <p className="mt-5 pl-5 text-[13px] text-muted-foreground">Preparing agent steps…</p>
      ) : (
        // Row spacing targets the rows themselves, because `space-y-*` would
        // also count the absolutely positioned rail and node spans as siblings.
        <ol className="relative mt-7 pl-5 [&>li+li]:mt-10">
          {/* Rail, tucked behind the opaque nodes at both ends. */}
          <span className="absolute bottom-[5px] left-[5px] top-1 w-px bg-white/[0.13]" aria-hidden="true" />
          {steps.map((step) => (
            <AgentStepRow key={step.id} step={step} />
          ))}
          {/* Terminal node, so the rail reads as finished rather than cut off. */}
          <span
            className="absolute bottom-0 left-0 h-[11px] w-[11px] rounded-[3px] bg-white/[0.14]"
            aria-hidden="true"
          />
        </ol>
      )}
    </section>
  );
}

function AgentStepRow({ step }: { step: AgentStep }) {
  const [showOutput, setShowOutput] = React.useState(false);
  const [showAllFiles, setShowAllFiles] = React.useState(false);

  const status = statusMeta(step.status);
  const subtitle = stepSubtitle(step);
  const files = step.files ?? [];
  const visibleFiles = showAllFiles ? files : files.slice(0, MAX_VISIBLE_FILES);
  const hiddenFileCount = files.length - visibleFiles.length;
  const output = step.output?.trim() ? step.output.trim() : null;
  // A thinking step's output *is* its content, so it reads as prose. Every other
  // provider keeps raw tool output tucked away, and failures explain themselves.
  const isReasoning = step.provider === "thinking";
  const outputOpen = showOutput || step.status === "failed";

  return (
    <li className="relative">
      <span
        className={cn("absolute -left-5 top-1 h-[11px] w-[11px] rounded-[3px]", status.node)}
        aria-hidden="true"
      />

      <div className="flex items-center gap-2.5">
        <StepIcon step={step} />
        <h3
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-semibold",
            step.status === "failed" ? "text-red-300" : "text-foreground",
          )}
        >
          {step.title}
        </h3>
        {status.label ? (
          <span className={cn("shrink-0 text-[11px] font-medium", status.text)}>{status.label}</span>
        ) : (
          <span className="sr-only">{status.screenReaderLabel}</span>
        )}
      </div>

      {subtitle ? (
        <p className="mt-1.5 truncate text-[13px] text-muted-foreground">
          {subtitle}
          {step.ref ? <span className="ml-2 text-[11px] text-muted-foreground/70">{step.ref}</span> : null}
        </p>
      ) : null}

      {visibleFiles.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {visibleFiles.map((file) => (
            <li key={file} className="flex max-w-full">
              <FileChip path={file} />
            </li>
          ))}
          {hiddenFileCount > 0 || showAllFiles ? (
            <li className="flex">
              <button
                type="button"
                onClick={() => setShowAllFiles((current) => !current)}
                aria-expanded={showAllFiles}
                className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showAllFiles ? "Show fewer" : `+${hiddenFileCount} more`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {step.command ? (
        <div className="mt-3 flex gap-3.5">
          <span className="w-[3px] shrink-0 rounded-full bg-white/[0.14]" aria-hidden="true" />
          <code className="min-w-0 flex-1 py-1 font-mono text-[12px] leading-6 text-muted-foreground break-anywhere">
            {step.command}
          </code>
        </div>
      ) : null}

      {output && isReasoning ? (
        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground break-anywhere">{output}</p>
      ) : null}

      {output && !isReasoning ? (
        <>
          {step.status === "failed" ? null : (
            <button
              type="button"
              onClick={() => setShowOutput((current) => !current)}
              aria-expanded={showOutput}
              className="mt-2 text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showOutput ? "Hide output" : "Show output"}
            </button>
          )}
          {outputOpen ? (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground break-anywhere scrollbar-thin">
              {output}
            </pre>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

/** A pill carrying the real language mark and the file's basename. */
function FileChip({ path }: { path: string }) {
  const name = path.split("/").pop() || path;

  return (
    <span
      title={path}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground"
    >
      <FileTypeBadge path={path} className="h-[13px] align-baseline" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * The subagent's own logo. Instance steps use the operating system recorded for
 * that instance, so an Ubuntu box and an AlmaLinux box are told apart at a
 * glance (AlmaLinux falls back to the generic Tux — SVGL has no Alma mark).
 */
function StepIcon({ step }: { step: AgentStep }) {
  if (step.provider === "thinking") {
    return step.status === "running" ? (
      <DotMatrixLoader className="h-[18px] w-[18px] shrink-0" dotClassName="h-1 w-1" />
    ) : (
      <StaticDotGrid className="h-[18px] w-[18px] shrink-0" />
    );
  }

  if (step.provider === "git") {
    return <GitHubMark className="h-[18px] w-[18px] shrink-0 text-foreground" aria-hidden="true" />;
  }

  if (step.provider === "jules") {
    return <BrandMark className="h-[18px] w-[18px] shrink-0" iconClassName="h-[18px] w-[18px]" />;
  }

  return <InstanceTypeIcon type={step.instanceType} className="h-[18px] w-[18px]" />;
}

/** The dot-matrix spinner's resting frame, for finished work. */
function StaticDotGrid({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 grid-cols-3 gap-[2px]", className)}
    >
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-foreground opacity-30" />
      ))}
    </span>
  );
}

/** Where the step did its work: a repository slug, or an SSH target. */
function stepSubtitle(step: AgentStep): string | null {
  if (step.provider === "git") return step.repository ?? null;
  if (step.provider === "jules") return step.sessionLabel ?? null;
  if (step.provider === "instance") {
    if (!step.host) return step.instanceName ?? null;
    // The port is noise unless it is not the default.
    const target = step.port && step.port !== 22 ? `${step.host}:${step.port}` : step.host;
    return step.username ? `${step.username}@${target}` : target;
  }
  return null;
}

/**
 * Counts up while the run is live, then freezes on the last step's completion
 * time so a finished timeline keeps showing how long the work took.
 */
function ElapsedTime({
  startedAt,
  endedAt,
  active,
}: {
  startedAt: string;
  endedAt?: string;
  active: boolean;
}) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;

  const end = active ? now : (endedAt ? new Date(endedAt).getTime() : now);
  const totalSeconds = Math.floor(Math.max(0, (Number.isFinite(end) ? end : now) - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return (
    <span className="shrink-0 font-mono text-base font-normal text-muted-foreground tabular-nums">
      <span className="sr-only">Elapsed </span>
      {minutes}:{seconds}
    </span>
  );
}

function statusMeta(status: AgentStepStatus) {
  if (status === "waiting_approval") {
    return {
      label: "needs approval",
      screenReaderLabel: "needs approval",
      text: "text-amber-300",
      node: "bg-amber-300/70",
    };
  }
  if (status === "failed") {
    return { label: "failed", screenReaderLabel: "failed", text: "text-red-300", node: "bg-red-400/70" };
  }
  if (status === "skipped") {
    return { label: "skipped", screenReaderLabel: "skipped", text: "text-muted-foreground", node: "bg-white/[0.08]" };
  }
  if (status === "running") {
    return { label: null, screenReaderLabel: "in progress", text: "", node: "bg-white/30" };
  }
  return { label: null, screenReaderLabel: "done", text: "", node: "bg-white/[0.14]" };
}
