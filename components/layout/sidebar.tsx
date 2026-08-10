"use client";

import { Ellipsis, FolderGit2, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import * as React from "react";

import { BrandLockup } from "@/components/layout/brand-mark";
import { NAV_ITEMS, type ViewId } from "@/components/layout/nav-items";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, initialFor } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  sources: NormalizedSource[];
  isLoadingSources: boolean;
  selectedSource: string | null;
  onSelectSource: (sourceName: string) => void;
  /** Called after any navigation so the mobile drawer can close itself. */
  onAfterNavigate?: () => void;
}

export function Sidebar({
  activeView,
  onNavigate,
  sources,
  isLoadingSources,
  selectedSource,
  onSelectSource,
  onAfterNavigate,
}: SidebarProps) {
  const handleNavigate = (view: ViewId) => {
    onNavigate(view);
    onAfterNavigate?.();
  };

  const handleSelectSource = (sourceName: string) => {
    onSelectSource(sourceName);
    onAfterNavigate?.();
  };

  // The connected GitHub account, derived from real Jules sources.
  const owner = sources[0]?.owner ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="px-5 pb-2 pt-6">
        <BrandLockup />
      </div>

      <nav aria-label="Main navigation" className="px-3 pt-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full touch-target items-center gap-3 rounded-xl px-3 text-[15px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                    isActive
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Projects: the real repositories connected to Jules. */}
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-5 pb-1">
          <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
          <button
            type="button"
            onClick={() => handleNavigate("repositories")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Ellipsis className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Manage all repositories</span>
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {isLoadingSources ? (
            <ul className="space-y-1.5 px-2 py-1.5" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <li key={index} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3.5 flex-1" />
                </li>
              ))}
            </ul>
          ) : sources.length === 0 ? (
            <p className="px-2 py-2 text-sm leading-relaxed text-muted-foreground/80">
              No repositories yet. Install the Jules GitHub App to connect one.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sources.map((source) => {
                const isSelected = selectedSource === source.name;

                return (
                  <li key={source.name}>
                    <button
                      type="button"
                      onClick={() => handleSelectSource(source.name)}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex w-full touch-target items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                        isSelected
                          ? "bg-sidebar-accent text-foreground"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      )}
                    >
                      <FolderGit2 className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className="truncate">{source.fullName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Footer: real connection status, plus access to Settings. */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => handleNavigate("settings")}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {isLoadingSources ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              initialFor(owner ?? "Jules")
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {owner ?? "Jules account"}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
              {sources.length} {sources.length === 1 ? "repo" : "repos"} connected
            </span>
          </span>
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Open settings</span>
        </button>
      </div>
    </div>
  );
}
