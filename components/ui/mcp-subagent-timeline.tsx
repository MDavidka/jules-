"use client";

import Image from "next/image";
import * as React from "react";
import { Check, CircleAlert, Clock3, GitBranch, Server, ShieldAlert } from "lucide-react";

import { BrandMark } from "@/components/layout/brand-mark";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { cn } from "@/lib/utils";

export type McpProvider = "git" | "jules" | "instance";
export type McpStepStatus = "running" | "completed" | "waiting_approval" | "failed" | "skipped";

export interface McpActivityStep {
  id: string;
  provider: McpProvider;
  tool: string;
  title: string;
  status: McpStepStatus;
  startedAt: string;
  completedAt?: string;
  repository?: string;
  ref?: string;
  files?: string[];
  sessionLabel?: string;
  instanceName?: string;
  username?: string;
  host?: string;
  port?: number;
  command?: string;
  output?: string;
}

interface McpSubagentTimelineProps {
  startedAt: string;
  steps: McpActivityStep[];
  active: boolean;
}

export function McpSubagentTimeline({ startedAt, steps, active }: McpSubagentTimelineProps) {
  const latest = steps[steps.length - 1];
  const activeTitle = latest?.status === "running" ? latest.title : latest?.title ?? "working on task";

  return (
    <section className="mb-4 max-w-full" aria-label="MCP subagent activity">
      <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
        <DotMatrixLoader className="h-4 w-4" dotClassName="h-[3px] w-[3px]" />
        <span className="truncate">{activeTitle}</span>
        <SessionAge startedAt={startedAt} active={active} />
      </div>

      {steps.length > 0 ? (
        <div className="relative mt-4 space-y-4 pl-8">
          <div className="absolute bottom-3 left-[7px] top-2 w-px bg-border/80" aria-hidden="true" />
          {steps.map((step) => <McpActivityCard key={step.id} step={step} />)}
        </div>
      ) : (
        <p className="mt-3 pl-8 text-xs text-muted-foreground">Preparing MCP subagents…</p>
      )}
    </section>
  );
}

function McpActivityCard({ step }: { step: McpActivityStep }) {
  const provider = providerMeta(step.provider);
  const status = statusMeta(step.status);
  const Icon = provider.icon;

  return (
    <article className="relative">
      <span className={cn("absolute -left-8 top-1 flex h-4 w-4 items-center justify-center rounded-[3px] border", status.marker)} aria-hidden="true" />
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background">
          {step.provider === "git" ? <Image src="/github-svgl.svg" alt="" width={20} height={20} className="h-5 w-5" /> : step.provider === "jules" ? <BrandMark className="h-5 w-5" iconClassName="h-3 w-3" /> : <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            <span className={cn("text-[10px] font-medium uppercase tracking-[0.12em]", provider.text)}>{provider.label}</span>
            <span className={cn("ml-auto flex items-center gap-1 text-[11px]", status.text)}>{status.icon}{status.label}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {step.provider === "git" ? <GitDetails step={step} /> : null}
            {step.provider === "jules" ? <JulesDetails step={step} /> : null}
            {step.provider === "instance" ? <InstanceDetails step={step} /> : null}
          </div>
          {step.output ? <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-black/20 px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">{step.output}</pre> : null}
        </div>
      </div>
    </article>
  );
}

function GitDetails({ step }: { step: McpActivityStep }) {
  return <div className="space-y-2"><p>{step.repository ?? "GitHub repository"}{step.ref ? <span className="ml-2 text-xs text-muted-foreground/70">{step.ref}</span> : null}</p>{step.files?.length ? <div className="flex flex-wrap gap-2">{step.files.map((file) => <span key={file} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground"><span className="rounded bg-sky-400/15 px-1 font-mono text-[10px] text-sky-200">{file.split(".").pop()?.toUpperCase() ?? "FILE"}</span>{file.split("/").pop()}</span>)}</div> : null}</div>;
}

function JulesDetails({ step }: { step: McpActivityStep }) {
  return <p>{step.sessionLabel ?? "Jules session task"}</p>;
}

function InstanceDetails({ step }: { step: McpActivityStep }) {
  const target = [step.username, step.host ? `${step.host}${step.port ? `:${step.port}` : ""}` : ""].filter(Boolean).join("@");
  return <div className="space-y-2"><p>{step.instanceName ?? "VPS instance"}{target ? <span className="ml-2 text-xs text-muted-foreground/80">{target}</span> : null}</p>{step.command ? <div className="border-l-4 border-emerald-400/40 px-3 py-1 font-mono text-xs text-muted-foreground">{step.command}</div> : null}</div>;
}

function SessionAge({ startedAt, active }: { startedAt: string; active: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const elapsed = Math.max(0, now - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return <span className="ml-auto shrink-0 font-mono text-sm font-normal text-muted-foreground">{minutes}:{seconds}</span>;
}

function providerMeta(provider: McpProvider) {
  if (provider === "git") return { label: "Git MCP", icon: GitBranch, text: "text-sky-300" };
  if (provider === "jules") return { label: "Jules MCP", icon: Clock3, text: "text-violet-300" };
  return { label: "Instance MCP", icon: Server, text: "text-emerald-300" };
}

function statusMeta(status: McpStepStatus) {
  if (status === "waiting_approval") return { label: "approval needed", text: "text-amber-300", marker: "border-amber-300/70 bg-amber-300/20", icon: <ShieldAlert className="h-3 w-3" aria-hidden="true" /> };
  if (status === "failed") return { label: "failed", text: "text-red-300", marker: "border-red-300/70 bg-red-300/20", icon: <CircleAlert className="h-3 w-3" aria-hidden="true" /> };
  if (status === "completed") return { label: "done", text: "text-emerald-300", marker: "border-emerald-300/70 bg-emerald-300/20", icon: <Check className="h-3 w-3" aria-hidden="true" /> };
  return { label: "working", text: "text-muted-foreground", marker: "border-border bg-secondary", icon: <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> };
}
