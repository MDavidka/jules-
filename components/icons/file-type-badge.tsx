import { cn } from "@/lib/utils";

/**
 * Compact language marks for file chips. Colors follow the official brand
 * palettes catalogued by svgl.app, drawn locally so the timeline never depends
 * on a remote asset while it streams.
 */
interface FileTypeMeta {
  short: string;
  bg: string;
  fg: string;
  /** Accent used to tint the surrounding chip. */
  tint: string;
}

const FALLBACK: FileTypeMeta = { short: "•", bg: "#3f3f46", fg: "#e4e4e7", tint: "#a1a1aa" };

const FILE_TYPES: Record<string, FileTypeMeta> = {
  ts: { short: "TS", bg: "#3178c6", fg: "#ffffff", tint: "#3178c6" },
  tsx: { short: "TS", bg: "#3178c6", fg: "#ffffff", tint: "#3178c6" },
  mts: { short: "TS", bg: "#3178c6", fg: "#ffffff", tint: "#3178c6" },
  cts: { short: "TS", bg: "#3178c6", fg: "#ffffff", tint: "#3178c6" },
  js: { short: "JS", bg: "#f7df1e", fg: "#1a1a1a", tint: "#f7df1e" },
  jsx: { short: "JS", bg: "#f7df1e", fg: "#1a1a1a", tint: "#f7df1e" },
  mjs: { short: "JS", bg: "#f7df1e", fg: "#1a1a1a", tint: "#f7df1e" },
  cjs: { short: "JS", bg: "#f7df1e", fg: "#1a1a1a", tint: "#f7df1e" },
  json: { short: "{ }", bg: "#57534e", fg: "#fafaf9", tint: "#a8a29e" },
  css: { short: "CSS", bg: "#663399", fg: "#ffffff", tint: "#a855f7" },
  scss: { short: "SASS", bg: "#cd6799", fg: "#ffffff", tint: "#cd6799" },
  html: { short: "HTML", bg: "#e34f26", fg: "#ffffff", tint: "#e34f26" },
  md: { short: "MD", bg: "#519aba", fg: "#ffffff", tint: "#519aba" },
  mdx: { short: "MD", bg: "#519aba", fg: "#ffffff", tint: "#519aba" },
  py: { short: "PY", bg: "#3776ab", fg: "#ffd43b", tint: "#3776ab" },
  go: { short: "GO", bg: "#00add8", fg: "#ffffff", tint: "#00add8" },
  rs: { short: "RS", bg: "#dea584", fg: "#1a1a1a", tint: "#dea584" },
  java: { short: "JV", bg: "#e76f00", fg: "#ffffff", tint: "#e76f00" },
  rb: { short: "RB", bg: "#cc342d", fg: "#ffffff", tint: "#cc342d" },
  php: { short: "PHP", bg: "#777bb4", fg: "#ffffff", tint: "#777bb4" },
  sh: { short: "SH", bg: "#4eaa25", fg: "#ffffff", tint: "#4eaa25" },
  bash: { short: "SH", bg: "#4eaa25", fg: "#ffffff", tint: "#4eaa25" },
  yml: { short: "YML", bg: "#cb171e", fg: "#ffffff", tint: "#f87171" },
  yaml: { short: "YML", bg: "#cb171e", fg: "#ffffff", tint: "#f87171" },
  toml: { short: "TML", bg: "#9c4221", fg: "#ffffff", tint: "#c2703f" },
  sql: { short: "SQL", bg: "#336791", fg: "#ffffff", tint: "#336791" },
  svg: { short: "SVG", bg: "#ffb13b", fg: "#1a1a1a", tint: "#ffb13b" },
  png: { short: "IMG", bg: "#0ea5e9", fg: "#ffffff", tint: "#0ea5e9" },
  jpg: { short: "IMG", bg: "#0ea5e9", fg: "#ffffff", tint: "#0ea5e9" },
  lock: { short: "LCK", bg: "#52525b", fg: "#e4e4e7", tint: "#a1a1aa" },
};

export function fileTypeMeta(pathOrName: string): FileTypeMeta {
  const name = pathOrName.split("/").pop() ?? pathOrName;
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return FILE_TYPES[extension] ?? FALLBACK;
}

/** Semi-transparent variant of a hex accent, for chip fills and borders. */
export function tintedColor(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function FileTypeBadge({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const meta = fileTypeMeta(path);

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
      className={cn(
        "inline-block h-4 min-w-4 rounded-[3px] px-[2px] text-center text-[8px] font-bold uppercase leading-4 tracking-tight",
        className,
      )}
    >
      {meta.short}
    </span>
  );
}
