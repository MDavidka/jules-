import { cn } from "@/lib/utils";

/** Loading placeholder. Decorative: hidden from assistive tech. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-white/[0.06]", className)}
      {...props}
    />
  );
}

export { Skeleton };
