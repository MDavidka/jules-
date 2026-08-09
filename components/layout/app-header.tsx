"use client";

import { ChevronDown, LoaderCircle, Menu, RefreshCw } from "lucide-react";
import * as React from "react";

import { GitHubMark } from "@/components/icons/github-mark";
import { cn } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

interface AppHeaderProps {
  title: string;
  onOpenNav: () => void;
  onOpenRepoPicker: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  selectedSource: NormalizedSource | null;
  isLoadingSources: boolean;
}

export function AppHeader({
  title,
  onOpenNav,
  onOpenRepoPicker,
  onRefresh,
  isRefreshing,
  selectedSource,
  isLoadingSources,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-background px-2 pt-safe sm:px-4">
      <div className="flex h-14 w-full items-center gap-2">
        {/* Drawer toggle: mobile/tablet only - the sidebar is permanent on desktop. */}
        <button
          type="button"
          onClick={onOpenNav}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Open navigation menu</span>
        </button>

        <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground lg:text-base">
          {title}
        </h1>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <RefreshCw className={cn("h-[18px] w-[18px]", isRefreshing && "animate-spin")} aria-hidden="true" />
          <span className="sr-only">Refresh data from Jules</span>
        </button>

        {/* Active repository pill. */}
        <button
          type="button"
          onClick={onOpenRepoPicker}
          className="inline-flex min-h-10 max-w-[48%] shrink items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 text-xs text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="sr-only">Change repository. Currently: </span>
          <span className="truncate text-[13px] font-medium">
            {isLoadingSources && !selectedSource ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              (selectedSource?.fullName.split("/").pop() ?? "Select repo")
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground">
            <GitHubMark className="h-5 w-5 text-background" aria-hidden="true" />
          </span>
        </button>
      </div>
    </header>
  );
}
