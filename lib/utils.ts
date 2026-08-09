import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { SessionState } from "@/types/jules";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/*                                Formatting                                  */
/* -------------------------------------------------------------------------- */

/** Compact relative time, e.g. "just now", "4m ago", "3d ago". */
export function formatRelativeTime(input: string | null | undefined): string {
  if (!input) return "—";

  const timestamp = new Date(input).getTime();
  if (Number.isNaN(timestamp)) return "—";

  const deltaSeconds = Math.round((Date.now() - timestamp) / 1000);

  if (deltaSeconds < 0) return "just now";
  if (deltaSeconds < 45) return "just now";
  if (deltaSeconds < 90) return "1m ago";

  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.round(months / 12)}y ago`;
}

export function formatAbsoluteTime(input: string | null | undefined): string {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/*                              Session display                               */
/* -------------------------------------------------------------------------- */

const STATE_LABELS: Record<SessionState, string> = {
  STATE_UNSPECIFIED: "Unknown",
  QUEUED: "Queued",
  PLANNING: "Planning",
  AWAITING_PLAN_APPROVAL: "Needs plan approval",
  AWAITING_USER_FEEDBACK: "Needs your reply",
  IN_PROGRESS: "Working",
  PAUSED: "Paused",
  FAILED: "Failed",
  COMPLETED: "Completed",
};

export function sessionStateLabel(state: SessionState): string {
  return STATE_LABELS[state] ?? "Unknown";
}

/** Tailwind classes for the state badge. */
export function sessionStateClasses(state: SessionState): string {
  switch (state) {
    case "IN_PROGRESS":
    case "PLANNING":
      return "border-sky-500/25 bg-sky-500/10 text-sky-300";
    case "QUEUED":
      return "border-zinc-500/25 bg-zinc-500/10 text-zinc-300";
    case "AWAITING_PLAN_APPROVAL":
    case "AWAITING_USER_FEEDBACK":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "PAUSED":
      return "border-zinc-500/25 bg-zinc-500/10 text-zinc-400";
    case "COMPLETED":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "FAILED":
      return "border-red-500/25 bg-red-500/10 text-red-300";
    default:
      return "border-zinc-700 bg-zinc-800/60 text-zinc-400";
  }
}

/** Splits `sources/github/owner/repo` into a display name. */
export function sourceDisplayName(sourceName: string | null | undefined): string {
  if (!sourceName) return "No repository";
  return sourceName.replace(/^sources\/github\//, "").replace(/^sources\//, "");
}

/** Deterministic avatar initial for an owner/repo string. */
export function initialFor(value: string | null | undefined): string {
  if (!value) return "?";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
}

/** Extracts a readable error message from an unknown thrown value. */
export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}


/** Wall-clock time for chat bubbles, e.g. "19:49". */
export function formatClockTime(input: string | null | undefined): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
