import { cn } from "@/lib/utils";

/**
 * Compact file marks sourced from the corresponding SVGL language logos and
 * embedded locally so a live timeline does not depend on a remote image.
 * Source catalogue: https://svgl.app/api
 */
interface FileTypeMeta {
  short: string;
  tint: string;
  icon: FileIconKind;
}

type FileIconKind = "typescript" | "javascript" | "python" | "css" | "html" | "generic";

const FALLBACK: FileTypeMeta = { short: "•", tint: "#a1a1aa", icon: "generic" };

const FILE_TYPES: Record<string, FileTypeMeta> = {
  ts: { short: "TS", tint: "#3178c6", icon: "typescript" },
  tsx: { short: "TS", tint: "#3178c6", icon: "typescript" },
  mts: { short: "TS", tint: "#3178c6", icon: "typescript" },
  cts: { short: "TS", tint: "#3178c6", icon: "typescript" },
  js: { short: "JS", tint: "#f0db4f", icon: "javascript" },
  jsx: { short: "JS", tint: "#f0db4f", icon: "javascript" },
  mjs: { short: "JS", tint: "#f0db4f", icon: "javascript" },
  cjs: { short: "JS", tint: "#f0db4f", icon: "javascript" },
  css: { short: "CSS", tint: "#663399", icon: "css" },
  scss: { short: "CSS", tint: "#cd6799", icon: "css" },
  html: { short: "HTML", tint: "#e34f26", icon: "html" },
  htm: { short: "HTML", tint: "#e34f26", icon: "html" },
  md: { short: "MD", tint: "#519aba", icon: "generic" },
  mdx: { short: "MD", tint: "#519aba", icon: "generic" },
  py: { short: "PY", tint: "#3776ab", icon: "python" },
  json: { short: "JSON", tint: "#a8a29e", icon: "generic" },
  yml: { short: "YML", tint: "#f87171", icon: "generic" },
  yaml: { short: "YML", tint: "#f87171", icon: "generic" },
  toml: { short: "TML", tint: "#c2703f", icon: "generic" },
  xml: { short: "XML", tint: "#f97316", icon: "generic" },
  go: { short: "GO", tint: "#00add8", icon: "generic" },
  rs: { short: "RS", tint: "#dea584", icon: "generic" },
  java: { short: "JV", tint: "#e76f00", icon: "generic" },
  rb: { short: "RB", tint: "#cc342d", icon: "generic" },
  php: { short: "PHP", tint: "#777bb4", icon: "generic" },
  sh: { short: "SH", tint: "#4eaa25", icon: "generic" },
  bash: { short: "SH", tint: "#4eaa25", icon: "generic" },
  sql: { short: "SQL", tint: "#336791", icon: "generic" },
  svg: { short: "SVG", tint: "#ffb13b", icon: "generic" },
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

export function FileTypeBadge({ path, className }: { path: string; className?: string }) {
  const meta = fileTypeMeta(path);

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center align-[-3px]", className)}
    >
      <FileLogo kind={meta.icon} className="h-full w-full" />
    </span>
  );
}

/** Local copies of the compact SVGL language marks used in edited-file chips. */
function FileLogo({ kind, className }: { kind: FileIconKind; className?: string }) {
  if (kind === "typescript") {
    return (
      <svg viewBox="0 0 256 256" className={className} role="img" aria-label="TypeScript">
        <path d="M20 0h216c11.046 0 20 8.954 20 20v216c0 11.046-8.954 20-20 20H20c-11.046 0-20-8.954-20-20V20C0 8.954 8.954 0 20 0Z" fill="#3178C6" />
        <path d="M150.518 200.475v27.62c4.492 2.302 9.805 4.028 15.938 5.179 6.133 1.151 12.597 1.726 19.393 1.726 6.622 0 12.914-.633 18.874-1.899 5.96-1.266 11.187-3.352 15.678-6.257 4.492-2.906 8.048-6.704 10.669-11.394 2.62-4.689 3.93-10.486 3.93-17.391 0-5.006-.749-9.394-2.246-13.163a30.748 30.748 0 0 0-6.479-10.055c-2.821-2.935-6.205-5.567-10.149-7.898-3.945-2.33-8.394-4.531-13.347-6.602-3.628-1.497-6.881-2.949-9.761-4.359-2.879-1.41-5.327-2.848-7.342-4.316-2.016-1.467-3.571-3.021-4.665-4.661-1.094-1.64-1.641-3.495-1.641-5.567 0-1.899.489-3.61 1.468-5.135s2.362-2.834 4.147-3.927c1.785-1.094 3.973-1.942 6.565-2.547 2.591-.604 5.471-.906 8.638-.906 2.304 0 4.737.173 7.299.518 2.563.345 5.14.877 7.732 1.597a53.669 53.669 0 0 1 7.558 2.719 41.7 41.7 0 0 1 6.781 3.797v-25.807c-4.204-1.611-8.797-2.805-13.778-3.582-4.981-.777-10.697-1.165-17.147-1.165-6.565 0-12.784.705-18.658 2.115-5.874 1.409-11.043 3.61-15.506 6.602-4.463 2.993-7.99 6.805-10.582 11.437-2.591 4.632-3.887 10.17-3.887 16.615 0 8.228 2.375 15.248 7.127 21.06 4.751 5.811 11.963 10.731 21.638 14.759a291.458 291.458 0 0 1 10.625 4.575c3.283 1.496 6.119 3.049 8.509 4.66 2.39 1.611 4.276 3.366 5.658 5.265 1.382 1.899 2.073 4.057 2.073 6.474a9.901 9.901 0 0 1-1.296 4.963c-.863 1.524-2.174 2.848-3.93 3.97-1.756 1.122-3.945 1.999-6.565 2.632-2.62.633-5.687.95-9.2.95-5.989 0-11.92-1.05-17.794-3.151-5.875-2.1-11.317-5.25-16.327-9.451Zm-46.036-68.733H140V109H41v22.742h35.345V233h28.137V131.742Z" fill="#FFF" />
      </svg>
    );
  }

  if (kind === "javascript") {
    return (
      <svg viewBox="0 0 1052 1052" className={className} role="img" aria-label="JavaScript">
        <path fill="#f0db4f" d="M0 0h1052v1052H0z" />
        <path d="M965.9 801.1c-7.7-48-39-88.3-131.7-125.9-32.2-14.8-68.1-25.399-78.8-49.8-3.8-14.2-4.3-22.2-1.9-30.8 6.9-27.9 40.2-36.6 66.6-28.6 17 5.7 33.1 18.801 42.8 39.7 45.4-29.399 45.3-29.2 77-49.399-11.6-18-17.8-26.301-25.4-34-27.3-30.5-64.5-46.2-124-45-10.3 1.3-20.699 2.699-31 4-29.699 7.5-58 23.1-74.6 44-49.8 56.5-35.6 155.399 25 196.1 59.7 44.8 147.4 55 158.6 96.9 10.9 51.3-37.699 67.899-86 62-35.6-7.4-55.399-25.5-76.8-58.4-39.399 22.8-39.399 22.8-79.899 46.1 9.6 21 19.699 30.5 35.8 48.7 76.2 77.3 266.899 73.5 301.1-43.5 1.399-4.001 10.6-30.801 3.199-72.101zm-394-317.6h-98.4c0 85-.399 169.4-.399 254.4 0 54.1 2.8 103.7-6 118.9-14.4 29.899-51.7 26.2-68.7 20.399-17.3-8.5-26.1-20.6-36.3-37.699-2.8-4.9-4.9-8.7-5.601-9-26.699 16.3-53.3 32.699-80 49 13.301 27.3 32.9 51 58 66.399 37.5 22.5 87.9 29.4 140.601 17.3 34.3-10 63.899-30.699 79.399-62.199 22.4-41.3 17.6-91.3 17.4-146.6.5-90.2 0-180.4 0-270.9z" fill="#323330" />
      </svg>
    );
  }

  if (kind === "python") {
    return (
      <svg viewBox="16 16 32 32" className={className} role="img" aria-label="Python">
        <path fill="url(#python-blue)" d="M31.885 16c-8.124 0-7.617 3.523-7.617 3.523l.01 3.65h7.752v1.095H21.197S16 23.678 16 31.876c0 8.196 4.537 7.906 4.537 7.906h2.708v-3.804s-.146-4.537 4.465-4.537h7.688s4.32.07 4.32-4.175v-7.019S40.374 16 31.885 16zm-4.275 2.454a1.394 1.394 0 1 1 0 2.79 1.393 1.393 0 0 1-1.395-1.395c0-.771.624-1.395 1.395-1.395z" />
        <path fill="url(#python-yellow)" d="M32.115 47.833c8.124 0 7.617-3.523 7.617-3.523l-.01-3.65H31.97v-1.095h10.832S48 40.155 48 31.958c0-8.197-4.537-7.906-4.537-7.906h-2.708v3.803s.146-4.537-4.465 4.537h-7.688s-4.32.07-4.32 4.175v7.019s-.656 4.247 7.833 4.247zm4.275-2.454a1.393 1.393 0 1 1-1.395-1.395 1.394 1.394 0 0 1 1.395 1.395z" />
        <defs>
          <linearGradient id="python-blue" x1="19.075" x2="34.898" y1="18.782" y2="34.658" gradientUnits="userSpaceOnUse"><stop stopColor="#387EB8" /><stop offset="1" stopColor="#366994" /></linearGradient>
          <linearGradient id="python-yellow" x1="28.809" x2="45.803" y1="28.882" y2="45.163" gradientUnits="userSpaceOnUse"><stop stopColor="#FFE052" /><stop offset="1" stopColor="#FFC331" /></linearGradient>
        </defs>
      </svg>
    );
  }

  if (kind === "css") {
    return (
      <svg viewBox="0 0 1000 1000" className={className} role="img" aria-label="CSS">
        <path fill="#639" d="M0 0h840a160 160 0 0 1 160 160v680a160 160 0 0 1-160 160H160A160 160 0 0 1 0 840V0Z" />
        <path fill="#fff" d="M816.54 919.9c-32.39 0-57.16-9.42-74.5-28.35-17.15-19.03-26.08-46.18-26.88-81.64h69.8c.4 31.36 11.42 47.08 33.08 47.08 11.04 0 18.86-3.5 23.37-10.42 4.41-6.9 6.72-17.93 6.72-33.05 0-12.02-3.01-22.04-8.83-29.95a73.2 73.2 0 0 0-29.48-21.14L783.95 750c-23.06-11.02-39.81-24.04-50.14-39.27-10.03-15.13-15.04-36.36-15.04-63.5 0-30.36 8.83-55 26.37-73.94 18.05-18.93 42.62-28.34 74-28.34 30.3 0 53.76 9.31 70.3 27.84 16.85 18.64 25.67 45.28 26.38 80.14h-67.19c.4-11.4-1.9-22.72-6.72-33.06-3.8-7.6-11.23-11.41-22.26-11.41-19.65 0-29.48 11.71-29.48 35.05 0 11.83 2.4 21.04 7.22 28.05A65.18 65.18 0 0 0 822.76 689l24.77 10.92c25.57 11.72 44.02 26.05 55.35 43.38 11.43 17.23 17.05 40.27 17.05 69.12 0 34.56-9.03 61.1-27.38 79.63-18.25 18.53-43.62 27.85-76 27.85Zm-225.42 0c-32.4 0-57.16-9.42-74.51-28.35-17.15-19.03-26.07-46.18-26.87-81.64h69.79c.4 31.36 11.43 47.08 33.1 47.08 11.02 0 18.84-3.5 23.25-10.42 4.52-6.9 6.72-17.93 6.72-33.05 0-12.02-2.9-22.04-8.72-29.95a73.2 73.2 0 0 0-29.48-21.14L558.53 750c-23.07-11.02-39.81-24.04-50.14-39.27-10.03-15.13-15.04-36.36-15.04-63.5 0-30.36 8.82-55 26.37-73.94 18.05-18.93 42.62-28.34 74-28.34 30.29 0 53.75 9.31 70.2 27.84 17.05 18.64 25.77 45.28 26.47 80.14h-67.18c.4-11.4-1.9-22.72-6.72-33.06-3.81-7.6-11.23-11.41-22.26-11.41-19.66 0-29.49 11.71-29.49 35.05 0 11.83 2.41 21.04 7.22 28.05A65.18 65.18 0 0 0 597.33 689l24.77 10.92c25.57 11.72 44.02 26.05 55.36 43.38 11.33 17.23 17.04 40.27 17.04 69.12 0 34.56-9.12 61.1-27.37 79.63-18.25 18.53-43.62 27.85-76.01 27.85Zm-234.75 0c-31.7 0-56.86-8.62-75.51-25.85-18.65-17.12-27.88-42.87-27.88-76.93V648.83c0-33.85 9.83-59.5 29.48-77.13 19.96-17.43 46.13-26.24 78.52-26.24 31.39 0 56.15 9.01 74.5 26.84 18.56 17.93 27.88 44.58 27.88 80.14v13.32h-73.9v-12.92c0-13.72-3.01-23.84-8.83-30.45a26.46 26.46 0 0 0-21.66-10.32c-12.03 0-20.55 4.1-25.37 12.42a79.04 79.04 0 0 0-6.72 36.66v146.26c0 30.55 10.74 46.08 32.1 46.38 10.02 0 17.54-3.61 22.76-10.82a51.74 51.74 0 0 0 7.72-30.46V801.6h73.9v11.42c0 23.74-4.61 43.57-13.94 59.4a88.8 88.8 0 0 1-38.2 35.66 121.46 121.46 0 0 1-54.85 11.82Z" />
      </svg>
    );
  }

  if (kind === "html") {
    return (
      <svg viewBox="0 0 452 520" className={className} role="img" aria-label="HTML5">
        <path fill="#e34f26" d="M41 460L0 0h451l-41 460-185 52" /><path fill="#ef652a" d="M226 472l149-41 35-394H226" />
        <path fill="#ecedee" d="M226 208h-75l-5-58h80V94H84l15 171h127zm0 147l-64-17-4-45h-56l7 89 117 32z" /><path fill="#fff" d="M226 265h69l-7 73-62 17v59l115-32 16-174H226zm0-171v56h136l5-56z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={cn("text-muted-foreground", className)} role="img" aria-label="File">
      <path d="M7 3.75h6.5L18 8.25v12H7a1 1 0 0 1-1-1v-14.5a1 1 0 0 1 1-1Z" fill="currentColor" opacity=".18" />
      <path d="M13.5 3.75v4.5H18M9 12h6M9 15h6M7 20.25h11a1 1 0 0 0 1-1v-11l-4.5-4.5H7a1 1 0 0 0-1 1v14.5a1 1 0 0 0 1 1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
