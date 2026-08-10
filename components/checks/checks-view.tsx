"use client";

import { CheckCircle2, CircleX, LoaderCircle, Play, ShieldCheck, TerminalSquare } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { cn, errorMessage } from "@/lib/utils";
import { CHECK_COMMANDS, type CheckCommandInput } from "@/lib/validators";
import type { NormalizedSource } from "@/types/jules";

type CheckCommand = CheckCommandInput["command"];

interface CheckResult {
  command: CheckCommand;
  label: string;
  invocation: string;
  output: string;
  errorOutput: string;
  exitCode: number | null;
  durationMs: number;
  timedOut?: boolean;
}

const CHECK_LABELS: Record<CheckCommand, string> = {
  test: "Test",
  typecheck: "Type check",
  lint: "Lint",
  build: "Build",
};

interface ChecksViewProps {
  selectedSource: NormalizedSource | null;
}

/**
 * Safe server-side checks for the selected repository. This UI intentionally
 * exposes check IDs, not a free-form terminal: the API owns the allowlist,
 * workspace, timeout, and environment boundary.
 */
export function ChecksView({ selectedSource }: ChecksViewProps) {
  const [command, setCommand] = React.useState<CheckCommand>("test");
  const [result, setResult] = React.useState<CheckResult | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runCheck = async () => {
    if (!selectedSource) return;
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, source: selectedSource.name }),
      });
      const data = (await response.json().catch(() => null)) as Partial<CheckResult> & { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "The check could not be started.");
      setResult(data as CheckResult);
    } catch (requestError) {
      setError(errorMessage(requestError, "The check could not be started."));
    } finally {
      setIsRunning(false);
    }
  };

  if (!selectedSource) {
    return (
      <EmptyState
        icon={TerminalSquare}
        title="Select a repository first"
        description="Choose a connected repository from the sidebar, then run an authorized check against its configured workspace."
      />
    );
  }

  const succeeded = result?.exitCode === 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">SSH / Checks</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Run a fixed, server-side allowlisted check for the selected repository. No browser-provided shell command or path is executed.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">Authorized workspace</p>
            <p className="break-anywhere text-sm text-muted-foreground">{selectedSource.fullName}</p>
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              The server must be configured with <code className="font-mono text-foreground/80">CHECKS_WORKSPACE_ROOT</code>. Commands run with a restricted environment and a two-minute timeout.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Available checks">
          {CHECK_COMMANDS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCommand(item)}
              className={cn(
                "min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                command === item
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {CHECK_LABELS[item]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Selected command: <code className="font-mono text-foreground/80">npm {command === "test" ? "test -- --run" : `run ${command}`}</code>
          </p>
          <Button onClick={() => void runCheck()} disabled={isRunning}>
            {isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {isRunning ? "Running…" : "Run check"}
          </Button>
        </div>
      </section>

      {error ? <ErrorState title="Check unavailable" message={error} /> : null}

      {result ? (
        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4" aria-live="polite">
          <div className="flex items-center gap-2">
            {succeeded ? <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" /> : <CircleX className="h-5 w-5 text-red-400" aria-hidden="true" />}
            <div>
              <p className="text-sm font-medium text-foreground">{result.label} {succeeded ? "passed" : "failed"}</p>
              <p className="text-xs text-muted-foreground">{result.invocation} · {(result.durationMs / 1000).toFixed(1)}s{result.timedOut ? " · timed out" : ""}</p>
            </div>
          </div>
          {result.output || result.errorOutput ? (
            <pre className="scrollbar-thin max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-black/40 p-3 font-mono text-xs leading-5 text-foreground"><code>{[result.output, result.errorOutput].filter(Boolean).join("\n")}</code></pre>
          ) : (
            <p className="rounded-xl border border-border/70 bg-black/40 p-3 font-mono text-xs text-muted-foreground">No output.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
