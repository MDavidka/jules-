import Image from "next/image";

import { cn } from "@/lib/utils";

/** Shared transparent brand mark used across the shell and empty states. */
export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center justify-center", className)}>
      <Image
        src="/jules-deepdive-logo.png"
        alt=""
        width={48}
        height={48}
        className={cn("h-full w-full object-contain mix-blend-screen", iconClassName)}
        priority
      />
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark className="h-10 w-10" iconClassName="h-6 w-6" />
      <span className="text-2xl font-bold tracking-tight text-foreground">Jules DeepDive</span>
    </span>
  );
}
