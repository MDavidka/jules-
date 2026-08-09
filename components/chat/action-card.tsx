"use client";

import { LoaderCircle, OctagonX } from "lucide-react";
import * as React from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { cn } from "@/lib/utils";
import type { AgentPendingAction } from "@/types/agent";

interface ActionCardProps {
  action: AgentPendingAction;
  onConfirm: () => void;
  onSkip: () => void;
  isResolving: boolean;
}

/**
 * The confirmation card for a gated agent action.
 *
 * Nothing that spends Jules capacity happens without this: the agent proposes, the
 * card shows exactly what will be sent, and the user accepts or skips.
 */
export function ActionCard({ action, onConfirm, onSkip, isResolving }: ActionCardProps) {
  const isStop = action.name === "stop_jules";
  const headingId = `action-${action.toolCallId}-title`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 rounded-2xl border bg-[hsl(0_0%_14%)] p-3.5 shadow-xl shadow-black/30",
        isStop ? "border-amber-500/30" : "border-border/80",
      )}
    >
      <div className="flex items-center gap-2">
        {isStop ? (
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/15"
          >
            <OctagonX className="h-4 w-4 text-amber-300" />
          </span>
        ) : (
          <BrandMark className="h-6 w-6 rounded-lg" iconClassName="h-3.5 w-3.5" />
        )}

        <h3 id={headingId} className="min-w-0 text-[15px] font-semibold text-foreground">
          {action.title}
        </h3>
      </div>

      <p className="mt-2 break-anywhere text-[13px] leading-relaxed text-muted-foreground">
        {action.description}
      </p>

      {action.details.length > 0 ? (
        <dl className="mt-2.5 flex flex-wrap gap-1.5">
          {action.details.map((detail) => (
            <div
              key={detail.label}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[11px]"
            >
              <dt className="shrink-0 text-muted-foreground">{detail.label}</dt>
              <dd className="truncate font-medium text-foreground/90">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isResolving}
          className={cn(
            "inline-flex touch-target flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isResolving
              ? "cursor-not-allowed bg-primary/60 text-primary-foreground/80"
              : isStop
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {isResolving ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Working…
            </>
          ) : (
            action.confirmLabel
          )}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={isResolving}
          className="inline-flex touch-target flex-1 items-center justify-center rounded-xl bg-white/[0.08] px-4 text-sm font-medium text-foreground/90 transition-colors hover:bg-white/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          Skip
        </button>
      </div>
    </section>
  );
}
