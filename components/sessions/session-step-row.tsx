"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { FileTypeBadge, fileTypeMeta, tintedColor } from "@/components/icons/file-type-badge";
import { DotMatrixLoader } from "@/components/ui/dot-matrix-loader";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";
import type { SessionStep } from "@/lib/session-steps";

const MAX_VISIBLE_FILE_CHIPS = 4;

/** A small coloured chip carrying the language mark for a touched file. */
function StepChip({ value }: { value: string }) {
  const meta = fileTypeMeta(value);
  const name = value.includes("/") ? value.split("/").pop()! : value;

  return (
    <span
      title={value}
      style={{
        backgroundColor: tintedColor(meta.tint, 0.16),
        borderColor: tintedColor(meta.tint, 0.42),
      }}
      className="mb-0.5 mr-1 inline-flex max-w-[13rem] items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 align-middle text-[10px] font-medium text-foreground/90"
    >
      <FileTypeBadge path={value} className="mr-1" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * The only row renderer for the session timeline. Icon, label, chips, and the
 * clamped body all share one inline flow, so every step kind looks the same and
 * long prose stays two lines until it is opened.
 */
export function SessionStepRow({ step }: { step: SessionStep }) {
  const [open, setOpen] = React.useState(false);
  const [showAllFiles, setShowAllFiles] = React.useState(false);
  const body = step.body?.trim() ? step.body : null;
  const visibleChips = showAllFiles ? step.chips : step.chips.slice(0, MAX_VISIBLE_FILE_CHIPS);
  const hasMoreChips = step.chips.length > MAX_VISIBLE_FILE_CHIPS;
  const fileChips = step.chips.length > 0 ? (
    <span className="inline">
      {visibleChips.map((chip) => <StepChip key={chip} value={chip} />)}
      {hasMoreChips ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setShowAllFiles((current) => !current);
          }}
          aria-expanded={showAllFiles}
          className="mb-0.5 mr-1 inline-block rounded px-1 py-0.5 align-middle text-[10px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAllFiles ? "Show less" : `Show more… (${step.chips.length - MAX_VISIBLE_FILE_CHIPS})`}
        </button>
      ) : null}
    </span>
  ) : null;

  if (step.isUser && body) {
    return (
      <li className="flex justify-end py-1.5">
        <p className="max-w-[86%] whitespace-pre-wrap rounded-2xl bg-secondary px-3.5 py-2 text-[13px] leading-6 text-foreground break-anywhere">
          {body}
        </p>
      </li>
    );
  }

  const header = (
    <span className="mr-2 whitespace-nowrap">
      {step.loading ? (
        <DotMatrixLoader className="mr-1.5 inline-grid align-[-2px]" />
      ) : (
        <step.icon
          className={cn("mr-1.5 inline-block h-[18px] w-[18px] align-[-4px]", step.tone ?? "text-foreground/70")}
          aria-hidden="true"
        />
      )}
      <span className={cn("text-sm font-medium", step.tone ?? "text-foreground")}>{step.label}</span>
      {body ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${step.label}` : `Expand ${step.label}`}
          className="ml-1 inline-block h-6 w-6 rounded align-[-6px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn("mx-auto h-4 w-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </span>
  );

  if (open && body) {
    return (
      <li className="py-2">
        <div className="text-[13px] leading-6">
          {header}
          {fileChips}
        </div>
        {step.markdown ? (
          <MarkdownContent className="mt-1 text-[13px] leading-6">{body}</MarkdownContent>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground break-anywhere">
            {body}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="py-2">
      {/* Collapsed rows clamp to two lines, header included, like the reference. */}
      <div className={cn("text-[13px] leading-6 text-muted-foreground", body && "line-clamp-2")}>
        {header}
        {fileChips}
        {body}
      </div>
    </li>
  );
}
