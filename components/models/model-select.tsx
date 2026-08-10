"use client";

import * as React from "react";

import { ModelIcon } from "@/components/models/model-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { findModel, type NvidiaModel } from "@/lib/nvidia-models";

interface ModelSelectProps {
  models: NvidiaModel[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

/**
 * The composer's model picker. Occupies the slot the branch selector used to hold,
 * and shows the publisher's real brand mark for the active model.
 */
export function ModelSelect({
  models,
  value,
  onChange,
  disabled = false,
  isLoading = false,
  className,
}: ModelSelectProps) {
  // Prefer the live list, but fall back to the static catalog so the trigger still
  // renders a proper name and icon before /api/nvidia/models resolves.
  const selected = React.useMemo(
    () => models.find((model) => model.id === value) ?? findModel(value),
    [models, value],
  );

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || models.length === 0}>
      <SelectTrigger
        aria-label="Model"
        className={cn(
          "h-10 min-h-10 w-auto max-w-[12rem] gap-1.5 rounded-full border-border/80 bg-transparent pl-2.5 pr-2.5 text-[13px] font-medium",
          className,
        )}
      >
        {selected ? (
          <ModelIcon model={selected} className="h-[18px] w-[18px]" />
        ) : (
          <span
            aria-hidden="true"
            className="h-[18px] w-[18px] shrink-0 animate-pulse rounded-[5px] bg-white/10"
          />
        )}
        <SelectValue placeholder={isLoading ? "Loading…" : "Model"}>
          {selected?.label ?? (isLoading ? "Loading…" : "Model")}
        </SelectValue>
      </SelectTrigger>

      <SelectContent className="w-[min(20rem,92vw)]">
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id} className="py-2.5 pl-8 pr-2">
            <span className="flex items-start gap-2.5">
              <ModelIcon model={model} className="mt-0.5 h-[18px] w-[18px]" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{model.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {model.vendorLabel} · {model.blurb}
                </span>
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
