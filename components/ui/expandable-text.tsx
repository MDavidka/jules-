"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const CLAMP_CLASSES: Record<number, string> = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  6: "line-clamp-6",
};

interface ExpandableTextProps {
  children: string;
  /** Collapsed line count. Falls back to 6 lines for unlisted values. */
  lines?: 2 | 3 | 4 | 6;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}

/**
 * Long session text stays readable by default and opens on demand, so a card
 * never grows unbounded but nothing is permanently hidden.
 */
export function ExpandableText({
  children,
  lines = 4,
  className,
  moreLabel = "Show more",
  lessLabel = "Show less",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = React.useState(false);
  const textRef = React.useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = React.useState(false);

  // Only offer the toggle when the text actually overflows the clamp.
  React.useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const measure = () => {
      if (expanded) return;
      setIsClamped(element.scrollHeight - element.clientHeight > 2);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, expanded]);

  return (
    <div className="space-y-1">
      <p
        ref={textRef}
        className={cn(
          "whitespace-pre-wrap break-anywhere",
          !expanded && (CLAMP_CLASSES[lines] ?? "line-clamp-6"),
          className,
        )}
      >
        {children}
      </p>

      {isClamped || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? lessLabel : moreLabel}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}
