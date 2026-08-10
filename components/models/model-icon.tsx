"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { NvidiaModel } from "@/lib/nvidia-models";

interface ModelIconProps {
  model: Pick<NvidiaModel, "icon" | "monogramColor" | "vendorLabel">;
  className?: string;
}

/**
 * Renders a model publisher's brand mark from `public/model-icons`.
 *
 * Falls back to a monogram tile in the publisher's brand colour when no authentic
 * mark is vendored, or if the SVG fails to load - never substitutes a different
 * company's logo.
 */
export function ModelIcon({ model, className }: ModelIconProps) {
  const [failed, setFailed] = React.useState(false);

  // Retry the real mark if the model changes to one with a different icon.
  React.useEffect(() => {
    setFailed(false);
  }, [model.icon]);

  if (!model.icon || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ backgroundColor: model.monogramColor ?? "hsl(0 0% 28%)" }}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold leading-none text-white",
          "h-4 w-4",
          className,
        )}
      >
        {model.vendorLabel.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local SVG, no optimization needed
    <img
      src={`/model-icons/${model.icon}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("h-4 w-4 shrink-0 object-contain", className)}
    />
  );
}
