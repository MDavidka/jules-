"use client";

import { Braces, FileCode2, Github, Layers, Link2, Minus, Plus, RotateCcw, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import type { MemoryNote } from "@/hooks/use-memory";
import type { MemoryKind } from "@/lib/validators";
import { cn } from "@/lib/utils";

/** Card + gap geometry. The board scrolls, so these are fixed pixel values. */
const CARD_WIDTH = 152;
const CARD_MIN_HEIGHT = 62;
const COLUMN_GAP = 76;
const ROW_GAP = 54;
const CARDS_PER_ROW = 3;
const PADDING = 28;
/** Every other column drops slightly, matching the reference layout. */
const STAGGER = 26;

const KIND_ICONS: Record<MemoryKind, LucideIcon> = {
  note: StickyNote,
  stack: Layers,
  connection: Link2,
  code: FileCode2,
  config: Braces,
};

interface PositionedNote {
  note: MemoryNote;
  x: number;
  y: number;
  height: number;
}

interface MemoryBoardProps {
  notes: MemoryNote[];
  className?: string;
  onSelectNote?: (noteId: string) => void;
}

/**
 * Scrollable canvas of memory cards. Cards are laid out deterministically from
 * note order, and `note.connections` (ids of other notes) is drawn as curved
 * links behind the cards.
 */
export function MemoryBoard({ notes, className, onSelectNote }: MemoryBoardProps) {
  const { positioned, width, height } = React.useMemo(() => layoutNotes(notes), [notes]);
  const positionById = React.useMemo(
    () => new Map(positioned.map((item) => [item.note.id, item])),
    [positioned],
  );

  const links = React.useMemo(() => {
    const seen = new Set<string>();
    const edges: Array<{ key: string; path: string }> = [];

    for (const item of positioned) {
      for (const targetId of item.note.connections) {
        const target = positionById.get(targetId);
        if (!target || target.note.id === item.note.id) continue;

        // Collapse mutual links so a pair is only drawn once.
        const key = [item.note.id, target.note.id].sort().join("→");
        if (seen.has(key)) continue;
        seen.add(key);

        edges.push({ key, path: connectionPath(item, target) });
      }
    }

    return edges;
  }, [positionById, positioned]);

  const [zoom, setZoom] = React.useState(1);
  const zoomIn = () => setZoom((value) => Math.min(1.8, Number((value + 0.15).toFixed(2))));
  const zoomOut = () => setZoom((value) => Math.max(0.65, Number((value - 0.15).toFixed(2))));
  const resetZoom = () => setZoom(1);

  if (notes.length === 0) {
    return (
      <div
        className={cn(
          "dot-grid flex h-52 items-center justify-center rounded-3xl border border-border/70 bg-card/40",
          className,
        )}
      >
        <p className="max-w-[15rem] text-center text-xs leading-relaxed text-muted-foreground">
          Saved memory appears here as a connected board.
        </p>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Memory board"
      className={cn(
        "relative scrollbar-thin dot-grid min-h-[24rem] max-h-[70dvh] overflow-auto rounded-3xl border border-border/70 bg-card/40",
        className,
      )}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-white/10 bg-background/80 p-1 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= 0.65}
          aria-label="Zoom out memory board"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-40"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          aria-label={`Reset memory board zoom, currently ${Math.round(zoom * 100)} percent`}
          className="min-w-14 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= 1.8}
          aria-label="Zoom in memory board"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          aria-label="Reset memory board zoom"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative" style={{ width: width * zoom, height: height * zoom }}>
        <div
          className="relative"
          style={{
            width,
            height,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
          >
            {links.map((link) => (
              <path
                key={link.key}
                d={link.path}
                fill="none"
                stroke="hsl(0 0% 72%)"
                strokeOpacity={0.55}
                strokeWidth={1.25}
              />
            ))}
          </svg>

          {positioned.map(({ note, x, y, height: cardHeight }) => (
            <MemoryCard
              key={note.id}
              note={note}
              style={{ left: x, top: y, width: CARD_WIDTH, minHeight: cardHeight }}
              onSelect={onSelectNote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MemoryCard({
  note,
  style,
  onSelect,
}: {
  note: MemoryNote;
  style: React.CSSProperties;
  onSelect?: (noteId: string) => void;
}) {
  const entries = dataEntries(note.data);
  const Icon = isGitHubConnection(note) ? Github : KIND_ICONS[note.kind] ?? StickyNote;
  const label = note.title?.trim() || excerpt(note.content);

  return (
    <div
      style={style}
      className={cn(
        "absolute rounded-xl border border-white/25 bg-[hsl(0_0%_18%)] px-2.5 py-2 shadow-lg shadow-black/40",
        onSelect && "cursor-pointer transition-colors hover:border-white/40",
      )}
      onClick={onSelect ? () => onSelect(note.id) : undefined}
    >
      <div className="flex items-start gap-1.5">
        <Icon className="mt-px h-3 w-3 shrink-0 text-foreground/80" aria-hidden="true" />
        <p className="text-[11px] font-semibold leading-snug text-foreground break-anywhere">
          {label}
        </p>
      </div>

      {entries.length > 0 ? (
        <dl className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-1 text-[10px] leading-snug">
              <dt className="shrink-0 text-muted-foreground">{key}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono text-foreground/90" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** Serpentine grid layout with a per-column stagger. */
function layoutNotes(notes: MemoryNote[]) {
  const positioned: PositionedNote[] = notes.map((note, index) => {
    const row = Math.floor(index / CARDS_PER_ROW);
    const column = index % CARDS_PER_ROW;

    return {
      note,
      x: PADDING + column * (CARD_WIDTH + COLUMN_GAP),
      y: PADDING + row * (CARD_MIN_HEIGHT + ROW_GAP) + (column % 2 === 1 ? STAGGER : 0),
      height: estimateCardHeight(note),
    };
  });

  const width = positioned.length
    ? Math.max(...positioned.map((item) => item.x + CARD_WIDTH)) + PADDING
    : 0;
  const height = positioned.length
    ? Math.max(...positioned.map((item) => item.y + item.height)) + PADDING
    : 0;

  return { positioned, width, height };
}

function estimateCardHeight(note: MemoryNote) {
  const label = note.title?.trim() || excerpt(note.content);
  const labelLines = Math.max(1, Math.ceil(label.length / 20));
  const rows = dataEntries(note.data).length;

  return CARD_MIN_HEIGHT + (labelLines - 1) * 14 + (rows > 0 ? 8 + rows * 13 : 0);
}

/** Cubic curve between the facing edges of two cards. */
function connectionPath(from: PositionedNote, to: PositionedNote) {
  const fromCenterY = from.y + from.height / 2;
  const toCenterY = to.y + to.height / 2;
  const goesRight = to.x >= from.x;

  const startX = goesRight ? from.x + CARD_WIDTH : from.x;
  const endX = goesRight ? to.x : to.x + CARD_WIDTH;
  const controlOffset = Math.max(28, Math.abs(endX - startX) / 2);

  const control1X = goesRight ? startX + controlOffset : startX - controlOffset;
  const control2X = goesRight ? endX - controlOffset : endX + controlOffset;

  return `M ${startX} ${fromCenterY} C ${control1X} ${fromCenterY}, ${control2X} ${toCenterY}, ${endX} ${toCenterY}`;
}

/** Flattens the JSON payload into at most four printable key/value rows. */
function dataEntries(data: Record<string, unknown> | null): Array<[string, string]> {
  if (!data) return [];

  return Object.entries(data)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => [key, formatValue(value)]);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.slice(0, 4).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function excerpt(content: string) {
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.length > 64 ? `${collapsed.slice(0, 63)}…` : collapsed;
}

function isGitHubConnection(note: MemoryNote) {
  if (note.kind !== "connection") return false;
  const haystack = `${note.title ?? ""} ${JSON.stringify(note.data ?? {})}`.toLowerCase();
  return haystack.includes("github") || haystack.includes("git");
}
