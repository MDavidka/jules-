"use client";

import {
  Check,
  ExternalLink,
  Github,
  LoaderCircle,
  PanelsTopLeft,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useSources } from "@/hooks/use-sources";
import { errorMessage } from "@/lib/utils";

/**
 * Skills & Plugins reports the real integration surface Jules exposes today:
 * the API key connection and the Jules GitHub App's repository access.
 * Nothing here is simulated - if Jules adds a plugin API this is where it goes.
 */
export function SkillsView({ enabled }: { enabled: boolean }) {
  const sourcesQuery = useSources({ enabled });
  const sources = sourcesQuery.data?.items ?? [];
  const hasSources = sources.length > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Skills &amp; Plugins</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Integrations wired into this workspace.
        </p>
      </div>

      {sourcesQuery.isError ? (
        <ErrorState
          title="Could not check integrations"
          message={errorMessage(sourcesQuery.error)}
          onRetry={() => void sourcesQuery.refetch()}
          isRetrying={sourcesQuery.isFetching}
        />
      ) : (
        <ul className="space-y-2">
          <li className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/60">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">Jules API</p>
                <Badge className="gap-1 border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Connected
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Requests are signed server-side with your encrypted API key.
              </p>
            </div>
          </li>

          <li className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/60">
              <Github className="h-4 w-4 text-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">Jules GitHub App</p>
                {sourcesQuery.isPending ? (
                  <Badge variant="outline" className="gap-1 border-border/80">
                    <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Checking
                  </Badge>
                ) : hasSources ? (
                  <Badge className="gap-1 border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {sources.length} {sources.length === 1 ? "repo" : "repos"}
                  </Badge>
                ) : (
                  <Badge className="gap-1 border border-amber-500/25 bg-amber-500/10 text-amber-300">
                    <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                    No access
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {hasSources
                  ? "Jules can read and open pull requests in these repositories."
                  : "Install the app and grant repository access so Jules can start working."}
              </p>
              <Button size="sm" variant="outline" asChild>
                <a href="https://jules.google.com" target="_blank" rel="noopener noreferrer">
                  Manage access
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </li>
        </ul>
      )}

      <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-border/80 bg-card/40 p-3.5">
        <PanelsTopLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          The Jules alpha API exposes no plugin or skill resource yet, so this page reflects only
          real, verifiable integration state rather than placeholder entries.
        </p>
      </div>
    </div>
  );
}
