"use client";

import * as React from "react";

import { ACTIVITY_LABELS, type AgentActivity } from "@/lib/agent-activity";
import { cn } from "@/lib/utils";

export { ACTIVITY_LABELS, AGENT_ACTIVITIES, isAgentActivity, type AgentActivity } from "@/lib/agent-activity";

const GRID_SIZE = 3;
/** Turns per unit radius: higher values tighten the spiral arms. */
const SPIRAL_TWIST = 0.55;
const REVOLUTIONS_PER_SECOND = 0.85;
const MIN_OPACITY = 0.12;
const MAX_OPACITY = 1;

interface Dot {
  key: string;
  /** Normalised spiral phase offset for this cell, in turns. */
  phase: number;
}

/**
 * "Core spiral" dot-matrix spinner, inspired by the pattern set at
 * https://dotmatrix.zzzzshawn.cloud. A brightness wave travels outward along a
 * spiral so the centre appears to pull the dots inward.
 *
 * Opacity is written straight to the DOM nodes, so the animation never
 * re-renders React. Honours `prefers-reduced-motion` by holding a static frame.
 */
export function DotMatrixLoader({
  className,
  dotClassName,
}: {
  className?: string;
  dotClassName?: string;
}) {
  const dots = React.useMemo(() => buildSpiral(), []);
  const nodesRef = React.useRef<Array<HTMLSpanElement | null>>([]);

  React.useEffect(() => {
    const nodes = nodesRef.current;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const paint = (turns: number) => {
      dots.forEach((dot, index) => {
        const node = nodes[index];
        if (!node) return;

        // Triangle wave over the dot's position in the spiral.
        const cycle = wrap(dot.phase - turns);
        const wave = 1 - Math.abs(cycle * 2 - 1);
        node.style.opacity = String(MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * wave ** 2);
      });
    };

    if (reduceMotion) {
      paint(0);
      return;
    }

    let frame = 0;
    let start: number | null = null;

    const tick = (timestamp: number) => {
      start ??= timestamp;
      paint(((timestamp - start) / 1000) * REVOLUTIONS_PER_SECOND);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [dots]);

  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 gap-[2px]", className)}
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
    >
      {dots.map((dot, index) => (
        <span
          key={dot.key}
          ref={(node) => {
            nodesRef.current[index] = node;
          }}
          className={cn("h-[3px] w-[3px] rounded-full bg-foreground", dotClassName)}
          style={{ opacity: MIN_OPACITY }}
        />
      ))}
    </span>
  );
}

/** Assistant status row: spinner plus the current activity label. */
export function AgentActivityIndicator({
  activity,
  className,
}: {
  activity: AgentActivity;
  className?: string;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}
    >
      <DotMatrixLoader />
      {ACTIVITY_LABELS[activity]}
    </p>
  );
}

/** Precomputes each cell's phase from its angle and distance to the centre. */
function buildSpiral(): Dot[] {
  const centre = (GRID_SIZE - 1) / 2;
  const maxRadius = Math.hypot(centre, centre);
  const dots: Dot[] = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const dx = column - centre;
      const dy = row - centre;
      const angleTurns = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      const radius = maxRadius === 0 ? 0 : Math.hypot(dx, dy) / maxRadius;

      dots.push({
        key: `${row}-${column}`,
        phase: wrap(angleTurns + radius * SPIRAL_TWIST),
      });
    }
  }

  return dots;
}

/** Wraps a value into the [0, 1) range. */
function wrap(value: number) {
  return ((value % 1) + 1) % 1;
}
