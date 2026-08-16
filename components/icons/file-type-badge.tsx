import { cn } from "@/lib/utils";

/**
 * Compact file marks for timeline chips. Every logo is an unmodified SVGL asset
 * vendored into /public/svgl, so chips show the real language mark without a
 * runtime dependency on svgl.app. Catalogue: https://svgl.app
 *
 * Extensions with no brand mark in SVGL (YAML, TOML, XML, SQL, plain text…)
 * keep their accent colour and fall back to the neutral document glyph below.
 */
export interface FileTypeMeta {
  /** Short label for places too small for the logo. */
  short: string;
  /** Brand accent, used for chip fills and borders. */
  tint: string;
  /** Vendored SVGL filename (without extension), or null for the neutral glyph. */
  logo: string | null;
}

const FALLBACK: FileTypeMeta = { short: "FILE", tint: "#a1a1aa", logo: null };

const FILE_TYPES: Record<string, FileTypeMeta> = {
  ts: { short: "TS", tint: "#3178c6", logo: "typescript" },
  tsx: { short: "TS", tint: "#3178c6", logo: "typescript" },
  mts: { short: "TS", tint: "#3178c6", logo: "typescript" },
  cts: { short: "TS", tint: "#3178c6", logo: "typescript" },
  js: { short: "JS", tint: "#f0db4f", logo: "javascript" },
  jsx: { short: "JS", tint: "#f0db4f", logo: "javascript" },
  mjs: { short: "JS", tint: "#f0db4f", logo: "javascript" },
  cjs: { short: "JS", tint: "#f0db4f", logo: "javascript" },
  py: { short: "PY", tint: "#3776ab", logo: "python" },
  pyi: { short: "PY", tint: "#3776ab", logo: "python" },
  css: { short: "CSS", tint: "#663399", logo: "css" },
  scss: { short: "SCSS", tint: "#cd6799", logo: "sass" },
  sass: { short: "SASS", tint: "#cd6799", logo: "sass" },
  html: { short: "HTML", tint: "#e34f26", logo: "html5" },
  htm: { short: "HTML", tint: "#e34f26", logo: "html5" },
  md: { short: "MD", tint: "#519aba", logo: "markdown-dark" },
  mdx: { short: "MDX", tint: "#519aba", logo: "markdown-dark" },
  markdown: { short: "MD", tint: "#519aba", logo: "markdown-dark" },
  json: { short: "JSON", tint: "#a8a29e", logo: "json" },
  jsonc: { short: "JSON", tint: "#a8a29e", logo: "json" },
  go: { short: "GO", tint: "#00add8", logo: "golang_dark" },
  rs: { short: "RS", tint: "#dea584", logo: "rust_dark" },
  java: { short: "JAVA", tint: "#e76f00", logo: "java" },
  rb: { short: "RB", tint: "#cc342d", logo: "ruby" },
  php: { short: "PHP", tint: "#777bb4", logo: "php_dark" },
  sh: { short: "SH", tint: "#4eaa25", logo: "bash_dark" },
  bash: { short: "SH", tint: "#4eaa25", logo: "bash_dark" },
  zsh: { short: "SH", tint: "#4eaa25", logo: "bash_dark" },
  vue: { short: "VUE", tint: "#41b883", logo: "vue" },
  svelte: { short: "SVLT", tint: "#ff3e00", logo: "svelte" },
  graphql: { short: "GQL", tint: "#e10098", logo: "graphql" },
  gql: { short: "GQL", tint: "#e10098", logo: "graphql" },
  cs: { short: "CS", tint: "#a179dc", logo: "csharp" },
  swift: { short: "SWFT", tint: "#f05138", logo: "swift" },
  kt: { short: "KT", tint: "#7f52ff", logo: "kotlin" },
  kts: { short: "KT", tint: "#7f52ff", logo: "kotlin" },
  dart: { short: "DART", tint: "#00b4ab", logo: "dart" },
  lua: { short: "LUA", tint: "#5c5cd6", logo: "lua" },
  zig: { short: "ZIG", tint: "#f7a41d", logo: "zig" },
  scala: { short: "SCLA", tint: "#dc322f", logo: "scala" },
  tf: { short: "TF", tint: "#a067da", logo: "terraform" },
  tfvars: { short: "TF", tint: "#a067da", logo: "terraform" },
  prisma: { short: "PRSM", tint: "#5a67d8", logo: "prisma_dark" },
  sqlite: { short: "DB", tint: "#0f80cc", logo: "sqlite" },
  sqlite3: { short: "DB", tint: "#0f80cc", logo: "sqlite" },
  db: { short: "DB", tint: "#0f80cc", logo: "sqlite" },
  // No SVGL mark: accent only.
  yml: { short: "YML", tint: "#f87171", logo: null },
  yaml: { short: "YML", tint: "#f87171", logo: null },
  toml: { short: "TOML", tint: "#c2703f", logo: null },
  xml: { short: "XML", tint: "#f97316", logo: null },
  sql: { short: "SQL", tint: "#336791", logo: null },
  svg: { short: "SVG", tint: "#ffb13b", logo: null },
  txt: { short: "TXT", tint: "#a1a1aa", logo: null },
  env: { short: "ENV", tint: "#eab308", logo: null },
  lock: { short: "LOCK", tint: "#a1a1aa", logo: null },
};

/** Extensionless files that still deserve a real mark. */
const FILE_NAMES: Record<string, FileTypeMeta> = {
  dockerfile: { short: "DOCK", tint: "#008fe2", logo: "docker" },
  containerfile: { short: "DOCK", tint: "#008fe2", logo: "docker" },
  ".env": { short: "ENV", tint: "#eab308", logo: null },
  makefile: { short: "MAKE", tint: "#a1a1aa", logo: null },
};

export function fileTypeMeta(pathOrName: string): FileTypeMeta {
  const name = (pathOrName.split("/").pop() ?? pathOrName).toLowerCase();
  const byName = FILE_NAMES[name];
  if (byName) return byName;
  // "next.config.mjs" and "schema.prisma" both key off the final segment.
  const extension = name.includes(".") ? name.split(".").pop()! : "";
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

/**
 * Sized by height only: the width follows each logo's own aspect ratio, so
 * wordmarks (Go, PHP, Markdown) stay legible instead of being crushed into a
 * square. Pass a height in `className`; the cap keeps the widest marks in check.
 */
export function FileTypeBadge({ path, className }: { path: string; className?: string }) {
  const meta = fileTypeMeta(path);

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex h-3.5 w-auto max-w-[2rem] shrink-0 items-center justify-center align-[-3px]", className)}
    >
      {meta.logo ? (
        <img
          src={`/svgl/${meta.logo}.svg`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-auto max-w-full object-contain"
        />
      ) : (
        <NeutralFileGlyph tint={meta.tint} className="h-full w-auto" />
      )}
    </span>
  );
}

/** Document outline used for file types with no brand mark of their own. */
function NeutralFileGlyph({ tint, className }: { tint: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ color: tint }} role="img" aria-label="File">
      <path d="M7 3.75h6.5L18 8.25v12H7a1 1 0 0 1-1-1v-14.5a1 1 0 0 1 1-1Z" fill="currentColor" opacity=".18" />
      <path
        d="M13.5 3.75v4.5H18M9 12h6M9 15h6M7 20.25h11a1 1 0 0 0 1-1v-11l-4.5-4.5H7a1 1 0 0 0-1 1v14.5a1 1 0 0 0 1 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
