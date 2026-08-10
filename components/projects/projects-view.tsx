"use client";

import {
  CircleDot,
  FolderGit2,
  Github,
  MessageSquare,
  Pause,
  RefreshCw,
  Rocket,
  Trash2,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDeleteProject, useProjects, useUpdateProject } from "@/hooks/use-projects";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types/projects";

interface ProjectsViewProps {
  /** Focuses the chat on this project's repository. */
  onOpenChat: (sourceName: string) => void;
  onOpenSession: (sessionName: string) => void;
}

/**
 * The Projects tab.
 *
 * Only ACTIVE projects are listed by default - that is the whole point of the tab.
 * Paused and finished work is available behind a toggle so nothing is lost.
 */
export function ProjectsView({ onOpenChat, onOpenSession }: ProjectsViewProps) {
  const [scope, setScope] = React.useState<"active" | "all">("active");
  const projectsQuery = useProjects(scope === "active" ? "active" : "all");
  const projects = projectsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Projects</h2>
          <p className="text-sm text-muted-foreground">
            {scope === "active"
              ? "Work currently in flight. The agent keeps these up to date as you talk."
              : "Every project the agent has recorded."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void projectsQuery.refetch()}
          disabled={projectsQuery.isFetching}
        >
          <RefreshCw
            className={cn("h-4 w-4", projectsQuery.isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Project scope"
        className="inline-flex rounded-full border border-border/80 bg-card p-0.5"
      >
        {(["active", "all"] as const).map((option) => (
          <button
            key={option}
            role="tab"
            type="button"
            aria-selected={scope === option}
            onClick={() => setScope(option)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              scope === option
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "active" ? "Active" : "All"}
          </button>
        ))}
      </div>

      {projectsQuery.isPending ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1].map((index) => (
            <li key={index} className="space-y-2.5 rounded-2xl border border-border/70 bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </li>
          ))}
        </ul>
      ) : projectsQuery.isError ? (
        <ErrorState
          title="Could not load projects"
          message={errorMessage(projectsQuery.error)}
          onRetry={() => void projectsQuery.refetch()}
          isRetrying={projectsQuery.isFetching}
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title={scope === "active" ? "No active projects" : "No projects yet"}
          description="Projects appear here once you talk to the agent about a repository. It records the goal, the working branch, and any Jules run it starts."
        />
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpenChat={onOpenChat}
              onOpenSession={onOpenSession}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpenChat,
  onOpenSession,
}: {
  project: Project;
  onOpenChat: (sourceName: string) => void;
  onOpenSession: (sessionName: string) => void;
}) {
  const { toast } = useToast();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const githubUrl = project.sourceFullName
    ? `https://github.com/${project.sourceFullName}`
    : null;

  const handleStatus = async (status: "active" | "paused" | "done") => {
    try {
      await updateProject.mutateAsync({ id: project.id, status });
      toast({ title: `Project marked ${status}.`, variant: "success" });
    } catch (error) {
      toast({
        title: "Could not update the project",
        description: errorMessage(error),
        variant: "error",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync(project.id);
      toast({
        title: "Project removed",
        description: "The repository and any Jules work are untouched.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Could not remove the project",
        description: errorMessage(error),
        variant: "error",
      });
    }
  };

  const isBusy = updateProject.isPending || deleteProject.isPending;

  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl border bg-card p-4 transition-colors",
        project.status === "active" ? "border-primary/30" : "border-border/70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
          {project.sourceFullName && project.sourceFullName !== project.name ? (
            <p className="truncate text-xs text-muted-foreground">{project.sourceFullName}</p>
          ) : null}
        </div>
        <StatusBadge project={project} />
      </div>

      {project.summary ? (
        <p className="break-anywhere text-[13px] leading-relaxed text-muted-foreground">
          {project.summary}
        </p>
      ) : null}

      {project.facts.length > 0 ? (
        <dl className="flex flex-wrap gap-1.5">
          {project.facts.slice(0, 6).map((fact) => (
            <div
              key={fact.label}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1 text-[11px]"
            >
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="truncate font-medium text-foreground/90">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {project.branch ? (
          <Badge variant="outline" className="border-border/80">
            {project.branch}
          </Badge>
        ) : null}
        <Badge variant="outline" className="border-border/80">
          {project.sessions.length} Jules {project.sessions.length === 1 ? "run" : "runs"}
        </Badge>
        <span>Updated {formatRelativeTime(project.lastActivityAt)}</span>
      </div>

      {/* Jules runs the agent started for this project. */}
      {project.sessions.length > 0 ? (
        <ul className="space-y-1">
          {project.sessions
            .slice(-3)
            .reverse()
            .map((session) => (
              <li key={session.name}>
                <button
                  type="button"
                  onClick={() => onOpenSession(session.name)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Rocket
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      session.stoppedAt ? "text-muted-foreground" : "text-primary",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/90">
                    {session.title ?? session.name.replace(/^sessions\//, "")}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {session.stoppedAt ? "stopped" : "tracking"}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onOpenChat(project.source)}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Continue
        </Button>

        {project.status === "active" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={() => void handleStatus("paused")}
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
            Pause
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={() => void handleStatus("active")}
          >
            <CircleDot className="h-4 w-4" aria-hidden="true" />
            Reactivate
          </Button>
        )}

        {githubUrl ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" aria-hidden="true" />
              GitHub
            </a>
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-red-300"
          disabled={isBusy}
          onClick={() => void handleDelete()}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Remove {project.name} from projects</span>
        </Button>
      </div>
    </li>
  );
}

function StatusBadge({ project }: { project: Project }) {
  if (project.status === "active") {
    return (
      <Badge variant="primary" className="shrink-0">
        {project.runningSessionCount > 0
          ? `${project.runningSessionCount} running`
          : "Active"}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="shrink-0 border-border/80">
      {project.status === "paused" ? "Paused" : "Done"}
    </Badge>
  );
}
