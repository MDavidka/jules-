import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The purple Jules+ brand mark.
 * A Lucide icon over a CSS gradient - no hand-authored SVG.
 */
export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-2xl brand-gradient shadow-lg shadow-primary/25",
        className,
      )}
    >
      <Bot className={cn("text-white", iconClassName)} strokeWidth={2.25} />
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark className="h-10 w-10" iconClassName="h-6 w-6" />
      <span className="text-2xl font-bold tracking-tight text-foreground">Jules+</span>
    </span>
  );
}
