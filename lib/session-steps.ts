import {
  Brain,
  Check,
  CircleCheck,
  ListChecks,
  Orbit,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { NormalizedActivity, NormalizedSession } from "@/types/jules";

/**
 * One row in the session timeline. Every activity kind collapses into this
 * single shape so the UI renders them all through one component instead of a
 * different layout per kind.
 */
export interface SessionStep {
  id: string;
  icon: LucideIcon;
  label: string;
  /** File paths or commands rendered as coloured chips. */
  chips: string[];
  body: string | null;
  /** Agent prose is Markdown; progress/plan text is plain. */
  markdown: boolean;
  tone?: string;
  /** Renders the animated matrix instead of a static icon. */
  loading?: boolean;
  /** User replies render as a bubble rather than a step row. */
  isUser?: boolean;
}

const TEST_COMMAND = /\b(test|tests|vitest|jest|pytest|mocha|rspec)\b/i;
const CHECK_COMMAND = /\b(lint|eslint|tsc|typecheck|type-check|build|format|prettier)\b/i;

/** Pulls the touched paths out of a unified diff. */
function filesFromPatch(patch: string | undefined): string[] {
  if (!patch) return [];

  const files = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const target = line.match(/^\+\+\+\s+b\/(.+)$/);
    if (target?.[1] && target[1] !== "/dev/null") {
      files.add(target[1].trim());
      continue;
    }
    const header = line.match(/^diff --git a\/.+? b\/(.+)$/);
    if (header?.[1]) files.add(header[1].trim());
  }
  return [...files];
}

/** Short, chip-sized version of a shell command. */
function commandChip(command: string) {
  const collapsed = command.replace(/\s+/g, " ").trim();
  return collapsed.length > 42 ? `${collapsed.slice(0, 41)}…` : collapsed;
}

function planBody(activity: NormalizedActivity) {
  const steps = activity.plan?.steps;
  if (!steps?.length) return null;

  return steps
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((step, index) => `${index + 1}. ${step.title ?? `Step ${index + 1}`}`)
    .join("\n");
}

/** Expands a single activity into the rows it should contribute. */
function stepsFromActivity(activity: NormalizedActivity): SessionStep[] {
  const key = activity.name || activity.id;
  const steps: SessionStep[] = [];

  // Code changes first: they are the most concrete signal for a step.
  const editedFiles = activity.artifacts.flatMap((artifact) =>
    filesFromPatch(artifact.changeSet?.gitPatch?.unidiffPatch),
  );
  if (editedFiles.length > 0) {
    steps.push({
      id: `${key}-edited`,
      icon: Wrench,
      label: "edited",
      chips: [...new Set(editedFiles)],
      body: null,
      markdown: false,
    });
  }

  activity.artifacts.forEach((artifact, index) => {
    const command = artifact.bashOutput?.command?.trim();
    if (!command) return;

    const failed =
      typeof artifact.bashOutput?.exitCode === "number" && artifact.bashOutput.exitCode !== 0;
    const label = TEST_COMMAND.test(command)
      ? "running tests"
      : CHECK_COMMAND.test(command)
        ? "running checks"
        : "ran command";

    steps.push({
      id: `${key}-cmd-${index}`,
      icon: Orbit,
      label: failed ? `${label} · failed` : label,
      chips: [commandChip(command)],
      body: artifact.bashOutput?.output?.trim() || null,
      markdown: false,
      ...(failed ? { tone: "text-red-400" } : {}),
    });
  });

  switch (activity.kind) {
    case "agentMessaged":
      if (activity.body?.trim()) {
        steps.push({
          id: `${key}-msg`,
          icon: Brain,
          label: "thinking",
          chips: [],
          body: activity.body,
          markdown: true,
        });
      }
      break;
    case "userMessaged":
      if (activity.body?.trim()) {
        steps.push({
          id: `${key}-user`,
          icon: Brain,
          label: "you",
          chips: [],
          body: activity.body,
          markdown: false,
          isUser: true,
        });
      }
      break;
    case "planGenerated":
      steps.push({
        id: `${key}-plan`,
        icon: ListChecks,
        label: "planned",
        chips: [],
        body: planBody(activity),
        markdown: false,
      });
      break;
    case "planApproved":
      steps.push({
        id: `${key}-approved`,
        icon: Check,
        label: "plan approved",
        chips: [],
        body: null,
        markdown: false,
        tone: "text-emerald-400",
      });
      break;
    case "sessionCompleted":
      steps.push({
        id: `${key}-done`,
        icon: CircleCheck,
        label: "done",
        chips: [],
        body: null,
        markdown: false,
        tone: "text-emerald-400",
      });
      break;
    case "sessionFailed":
      steps.push({
        id: `${key}-failed`,
        icon: TriangleAlert,
        label: "failed",
        chips: [],
        body: activity.failureReason ?? activity.body,
        markdown: false,
        tone: "text-red-400",
      });
      break;
    case "progressUpdated":
      steps.push({
        id: `${key}-progress`,
        icon: Orbit,
        label: (activity.title || "working").toLowerCase(),
        chips: [],
        body: activity.body,
        markdown: false,
      });
      break;
    default:
      if (activity.body?.trim() || activity.title) {
        steps.push({
          id: `${key}-step`,
          icon: Orbit,
          label: (activity.title || "working").toLowerCase(),
          chips: [],
          body: activity.body,
          markdown: false,
        });
      }
      break;
  }

  return steps;
}

/**
 * Consecutive chip-only rows with the same label merge into one, so five edits
 * in a row read as a single "edited" line with five file chips.
 */
function mergeAdjacent(steps: SessionStep[]): SessionStep[] {
  return steps.reduce<SessionStep[]>((merged, step) => {
    const previous = merged[merged.length - 1];
    const isChipOnly = !step.body && step.chips.length > 0;
    const previousIsChipOnly = previous && !previous.body && previous.chips.length > 0;

    if (previous && isChipOnly && previousIsChipOnly && previous.label === step.label) {
      merged[merged.length - 1] = {
        ...previous,
        chips: [...new Set([...previous.chips, ...step.chips])],
      };
      return merged;
    }

    merged.push(step);
    return merged;
  }, []);
}

/** Oldest first, so the newest step is always the last row on screen. */
export function buildSessionSteps(activities: NormalizedActivity[]): SessionStep[] {
  const chronological = [...activities].sort(
    (a, b) => new Date(a.createTime ?? 0).getTime() - new Date(b.createTime ?? 0).getTime(),
  );

  return mergeAdjacent(chronological.flatMap(stepsFromActivity));
}

/** The live row pinned to the bottom while Jules is still working. */
export function liveStep(session: NormalizedSession, latestLabel: string | null): SessionStep | null {
  if (session.activity === "done" || session.activity === "failed") return null;

  const label = session.requiresPlanApproval
    ? "waiting for your approval"
    : session.awaitingUserFeedback
      ? "waiting for your reply"
      : latestLabel === "thinking"
        ? "thinking"
        : latestLabel || "working";

  return {
    id: "live",
    icon: Brain,
    label,
    chips: [],
    body: null,
    markdown: false,
    loading: true,
    ...(session.requiresPlanApproval || session.awaitingUserFeedback
      ? { tone: "text-amber-300" }
      : {}),
  };
}
