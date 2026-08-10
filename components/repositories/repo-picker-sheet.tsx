"use client";

import { Check, FolderGit2, Github, LoaderCircle, Lock } from "lucide-react";
import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

interface RepoPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: NormalizedSource[];
  isLoading: boolean;
  selectedSource: string | null;
  onSelect: (sourceName: string) => void;
}

/** Bottom-sheet repository picker, driven by real Jules sources. */
export function RepoPickerSheet({
  open,
  onOpenChange,
  sources,
  isLoading,
  selectedSource,
  onSelect,
}: RepoPickerSheetProps) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sources;
    return sources.filter((source) => source.fullName.toLowerCase().includes(term));
  }, [sources, query]);

  // Reset the search each time the sheet opens.
  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="px-0 pb-safe"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="pr-14">
          <SheetTitle>Select a repository</SheetTitle>
          <SheetDescription>
            Repositories the Jules GitHub App can access.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter repositories…"
            aria-label="Filter repositories"
          />
        </div>

        <div className="scrollbar-thin max-h-[52dvh] overflow-y-auto px-3 pb-4">
          {isLoading ? (
            <p className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading repositories from Jules…
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Github}
              title={sources.length === 0 ? "No repositories connected" : "No matches"}
              description={
                sources.length === 0
                  ? "Install the Jules GitHub App and grant it access to a repository."
                  : "Try a different search term."
              }
              className="mt-3 border-0 bg-transparent"
            />
          ) : (
            <ul className="space-y-1 pt-1">
              {filtered.map((source) => {
                const isSelected = source.name === selectedSource;

                return (
                  <li key={source.name}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(source.name);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex w-full touch-target items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected ? "bg-accent" : "hover:bg-white/[0.04]",
                      )}
                    >
                      <FolderGit2
                        className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          {source.fullName}
                        </span>
                        {source.defaultBranch ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            default: {source.defaultBranch}
                          </span>
                        ) : null}
                      </span>
                      {source.isPrivate ? (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : null}
                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
