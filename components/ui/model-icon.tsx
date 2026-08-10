"use client";

import * as React from "react";

import type { NvidiaModel } from "@/hooks/use-nvidia-models";
import { cn } from "@/lib/utils";

interface ModelIconProps {
  model: Pick<NvidiaModel, "label" | "iconUrl" | "iconFallback">;
  className?: string;
}

/** Uses the model's official SVGL mark and falls back to a readable label. */
export function ModelIcon({ model, className }: ModelIconProps) {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [model.iconUrl]);

  if (!model.iconUrl || hasError) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md border border-border/80 bg-secondary px-1 font-semibold leading-none text-foreground",
          className,
        )}
      >
        {model.iconFallback}
      </span>
    );
  }

  return (
    <img
      src={model.iconUrl}
      alt={`${model.label} logo`}
      className={cn("size-4 shrink-0 object-contain", className)}
      onError={() => setHasError(true)}
    />
  );
}
