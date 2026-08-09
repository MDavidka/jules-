"use client";

import {
  ExternalLink,
  GitBranch,
  Github,
  Lock,
  RefreshCw,
  SquarePen,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSources } from "@/hooks/use-sources";
import { cn, errorMessage } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

interface RepositoriesViewProps {
  enabled: boolean;
  selectedSource: string | null;
  onSelectSource: (sourceName: string) => void;
  onNewTask: () => void;
}

export function RepositoriesView({
  enabled,
  selectedSource,
  onSelectSource,
  onNewTask,
}: RepositoriesViewProps) {
  const sourcesQuery = useSources({ enabled });
  const sources = sourcesQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Repositories</h2>
          <p className="text-sm text-muted-foreground">
            Sources the Jules GitHub App can access.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void sourcesQuery.refetch()}
          disabled={sourcesQuery.isFetching}
        >
          <RefreshCw
            className={cn("h-4 w-4", sourcesQuery.isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {sourcesQuery.isPending ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="space-y-2.5 rounded-2xl border border-border/70 bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </li>
          ))}
        </ul>
      ) : sourcesQuery.isError ? (
        <ErrorState
          title="Could not load repositories"
          message={errorMessage(sourcesQuery.error)}
          onRetry={() => void sourcesQuery.refetch()}
          isRetrying={sourcesQuery.isFetching}
        />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={Github}
          title="No repositories connected"
          description="Install the Jules GitHub App and grant it access to a repository, then refresh."
          action={
            <Button size="sm" variant="outline" asChild>
              <a href="https://jules.google.com" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4" aria-hidden="true" />
                Open Jules
                <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </a>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {sources.map((source) => (
            <RepositoryCard
              key={source.name}
              source={source}
              isSelected={source.name === selectedSource}
              onSelect={onSelectSource}
              onNewTask={onNewTask}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RepositoryCard({
  source,
  isSelected,
  onSelect,
  onNewTask,
}: {
  source: NormalizedSource;
  isSelected: boolean;
  onSelect: (sourceName: string) => void;
  onNewTask: () => void;
}) {
  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl border bg-card p-4 transition-colors",
        isSelected ? "border-primary/40" : "border-border/70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-foreground">{source.fullName}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {source.isPrivate ? (
              <Badge variant="outline" className="gap-1 border-border/80">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Private
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border/80">
                Public
              </Badge>
            )}
            {source.defaultBranch ? (
              <Badge variant="outline" className="gap-1 border-border/80">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {source.defaultBranch}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-border/80">
              {source.branches.length} {source.branches.length === 1 ? "branch" : "branches"}
            </Badge>
          </div>
        </div>
        {isSelected ? <Badge variant="primary">Active</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={isSelected ? "secondary" : "outline"}
          onClick={() => onSelect(source.name)}
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onSelect(source.name);
            onNewTask();
          }}
        >
          <SquarePen className="h-4 w-4" aria-hidden="true" />
          New task
        </Button>
        {source.githubUrl ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={source.githubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" aria-hidden="true" />
              GitHub
              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
