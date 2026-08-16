import { instanceTypeMeta } from "@/lib/instance-types";
import { cn } from "@/lib/utils";

/**
 * The real platform logo for a VPS instance, taken from the SVGL marks vendored
 * into /public/svgl. Decorative by default: pass `labelled` where the icon is
 * the only thing identifying the platform.
 *
 * The type-to-logo mapping (including the distros that fall back to the generic
 * Tux) lives in lib/instance-types.ts.
 */
export function InstanceTypeIcon({
  type,
  className,
  labelled = false,
}: {
  type: string | null | undefined;
  className?: string;
  labelled?: boolean;
}) {
  const meta = instanceTypeMeta(type);

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      title={labelled ? meta.label : undefined}
      {...(labelled ? { role: "img", "aria-label": meta.label } : { "aria-hidden": "true" })}
    >
      <img
        src={`/svgl/${meta.logo}.svg`}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
