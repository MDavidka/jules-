/**
 * Instance (operating system) types for VPS instances.
 *
 * Each type points at an unmodified SVGL logo vendored into /public/svgl. SVGL
 * ships no per-distro marks beyond Ubuntu, so AlmaLinux, Debian, Rocky and
 * friends deliberately reuse the generic Tux and are flagged with
 * `usesGenericMark`. Catalogue: https://svgl.app
 *
 * Kept free of JSX so validators and server code can share it; the renderer
 * lives in components/icons/instance-type-icon.tsx.
 */
export const INSTANCE_TYPE_VALUES = [
  "ubuntu",
  "debian",
  "almalinux",
  "rocky",
  "centos",
  "rhel",
  "fedora",
  "alpine",
  "arch",
  "opensuse",
  "linux",
  "raspberry-pi",
  "docker",
  "windows",
  "macos",
] as const;

export type InstanceType = (typeof INSTANCE_TYPE_VALUES)[number];

export interface InstanceTypeMeta {
  label: string;
  /** Vendored SVGL filename (without extension) under /public/svgl. */
  logo: string;
  /** True when SVGL ships no mark for this platform and Tux stands in. */
  usesGenericMark?: boolean;
}

/** The instance type assumed when nothing more specific is recorded. */
export const DEFAULT_INSTANCE_TYPE: InstanceType = "linux";

export const INSTANCE_TYPES: Record<InstanceType, InstanceTypeMeta> = {
  ubuntu: { label: "Ubuntu", logo: "ubuntu" },
  debian: { label: "Debian", logo: "linux", usesGenericMark: true },
  almalinux: { label: "AlmaLinux", logo: "linux", usesGenericMark: true },
  rocky: { label: "Rocky Linux", logo: "linux", usesGenericMark: true },
  centos: { label: "CentOS", logo: "linux", usesGenericMark: true },
  rhel: { label: "Red Hat Enterprise Linux", logo: "linux", usesGenericMark: true },
  fedora: { label: "Fedora", logo: "linux", usesGenericMark: true },
  alpine: { label: "Alpine Linux", logo: "linux", usesGenericMark: true },
  arch: { label: "Arch Linux", logo: "linux", usesGenericMark: true },
  opensuse: { label: "openSUSE", logo: "linux", usesGenericMark: true },
  linux: { label: "Linux", logo: "linux" },
  "raspberry-pi": { label: "Raspberry Pi OS", logo: "raspberry_pi" },
  docker: { label: "Docker container", logo: "docker" },
  windows: { label: "Windows Server", logo: "windows" },
  macos: { label: "macOS", logo: "apple_dark" },
};

/** Options for the instance type picker, in the registry's display order. */
export const INSTANCE_TYPE_OPTIONS: Array<{ value: InstanceType; label: string }> =
  INSTANCE_TYPE_VALUES.map((value) => ({ value, label: INSTANCE_TYPES[value].label }));

export function isInstanceType(value: unknown): value is InstanceType {
  return typeof value === "string" && (INSTANCE_TYPE_VALUES as readonly string[]).includes(value);
}

/**
 * Ordered longest-match-first so "almalinux" is never swallowed by "linux", and
 * so the AlmaLinux and Rocky rebuilds are matched before the generic
 * "enterprise linux" wording they both carry in /etc/os-release.
 */
const RECOGNITION_RULES: Array<[RegExp, InstanceType]> = [
  [/alma/, "almalinux"],
  [/rocky/, "rocky"],
  [/raspbian|raspberry|\brpi\b/, "raspberry-pi"],
  [/opensuse|\bsuse\b|\bsles\b/, "opensuse"],
  [/ubuntu/, "ubuntu"],
  [/debian/, "debian"],
  [/centos/, "centos"],
  [/rhel|red\s*hat|enterprise\s*linux/, "rhel"],
  [/fedora/, "fedora"],
  [/alpine/, "alpine"],
  [/arch|manjaro|endeavour/, "arch"],
  [/docker|podman|container|lxc/, "docker"],
  [/windows|win(?:32|nt|server)|microsoft/, "windows"],
  [/mac\s*os|macos|darwin|\bosx\b|apple/, "macos"],
  [/linux|gnu|unix|\bbsd\b/, "linux"],
];

/**
 * Resolves whatever was recorded for an instance — a picker value, a distro
 * name, or a raw `uname` / os-release string — to a known instance type.
 */
export function normalizeInstanceType(value: string | null | undefined): InstanceType {
  if (!value) return DEFAULT_INSTANCE_TYPE;
  const text = value.trim().toLowerCase();
  if (isInstanceType(text)) return text;
  for (const [pattern, type] of RECOGNITION_RULES) {
    if (pattern.test(text)) return type;
  }
  return DEFAULT_INSTANCE_TYPE;
}

export function instanceTypeMeta(value: string | null | undefined): InstanceTypeMeta {
  return INSTANCE_TYPES[normalizeInstanceType(value)];
}

/** Human-readable platform name, for labels and tooltips. */
export function instanceTypeLabel(value: string | null | undefined): string {
  return instanceTypeMeta(value).label;
}
