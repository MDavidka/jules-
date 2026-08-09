/** Client-facing shapes for the Jules+ "project" concept. */

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectFact {
  label: string;
  value: string;
  recordedAt: string | null;
}

export interface ProjectSessionRef {
  name: string;
  title: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  /** Jules source resource name, e.g. `sources/github/owner/repo`. */
  source: string;
  sourceFullName: string | null;
  branch: string | null;
  status: ProjectStatus;
  summary: string | null;
  facts: ProjectFact[];
  sessions: ProjectSessionRef[];
  /** Sessions with no `stoppedAt`, i.e. runs this project still considers live. */
  runningSessionCount: number;
  lastActivityAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
};
