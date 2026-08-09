/**
 * Type definitions mirroring the Google Jules API (v1alpha).
 *
 * Reference: https://developers.google.com/jules/api/reference/rest/v1alpha
 *
 * These types describe the RAW upstream payloads. Normalized, frontend-facing
 * shapes are suffixed with `Normalized` and are what our route handlers return.
 */

export const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

/* -------------------------------------------------------------------------- */
/*                                   Sources                                  */
/* -------------------------------------------------------------------------- */

export interface GitHubBranch {
  displayName?: string;
}

export interface GitHubRepo {
  owner?: string;
  repo?: string;
  isPrivate?: boolean;
  defaultBranch?: GitHubBranch;
  branches?: GitHubBranch[];
}

/** An input source of data for a session. `name` looks like `sources/github/owner/repo`. */
export interface JulesSource {
  name?: string;
  id?: string;
  githubRepo?: GitHubRepo;
}

export interface ListSourcesResponse {
  sources?: JulesSource[];
  nextPageToken?: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Sessions                                  */
/* -------------------------------------------------------------------------- */

export const SESSION_STATES = [
  "STATE_UNSPECIFIED",
  "QUEUED",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "IN_PROGRESS",
  "PAUSED",
  "FAILED",
  "COMPLETED",
] as const;

export type SessionState = (typeof SESSION_STATES)[number];

export const AUTOMATION_MODES = ["AUTOMATION_MODE_UNSPECIFIED", "AUTO_CREATE_PR"] as const;

export type AutomationMode = (typeof AUTOMATION_MODES)[number];

export interface GitHubRepoContext {
  startingBranch?: string;
}

export interface SourceContext {
  source?: string;
  githubRepoContext?: GitHubRepoContext;
}

export interface PullRequest {
  url?: string;
  title?: string;
  description?: string;
}

export interface SessionOutput {
  pullRequest?: PullRequest;
}

export interface JulesSession {
  name?: string;
  id?: string;
  prompt?: string;
  sourceContext?: SourceContext;
  title?: string;
  requirePlanApproval?: boolean;
  automationMode?: AutomationMode;
  createTime?: string;
  updateTime?: string;
  state?: SessionState;
  url?: string;
  outputs?: SessionOutput[];
}

export interface ListSessionsResponse {
  sessions?: JulesSession[];
  nextPageToken?: string;
}

export interface CreateSessionRequest {
  prompt: string;
  sourceContext: {
    source: string;
    githubRepoContext?: GitHubRepoContext;
  };
  title?: string;
  requirePlanApproval?: boolean;
  automationMode?: AutomationMode;
}

/* -------------------------------------------------------------------------- */
/*                                 Activities                                 */
/* -------------------------------------------------------------------------- */

export interface PlanStep {
  id?: string;
  title?: string;
  description?: string;
  index?: number;
}

export interface Plan {
  id?: string;
  steps?: PlanStep[];
  createTime?: string;
}

export interface GitPatch {
  unidiffPatch?: string;
  baseCommitId?: string;
  suggestedCommitMessage?: string;
}

export interface ChangeSet {
  source?: string;
  gitPatch?: GitPatch;
}

export interface Media {
  data?: string;
  mimeType?: string;
}

export interface BashOutput {
  command?: string;
  output?: string;
  exitCode?: number;
}

export interface Artifact {
  changeSet?: ChangeSet;
  media?: Media;
  bashOutput?: BashOutput;
}

export interface JulesActivity {
  name?: string;
  id?: string;
  description?: string;
  createTime?: string;
  originator?: string;
  artifacts?: Artifact[];
  agentMessaged?: { agentMessage?: string };
  userMessaged?: { userMessage?: string };
  planGenerated?: { plan?: Plan };
  planApproved?: { planId?: string };
  progressUpdated?: { title?: string; description?: string };
  sessionCompleted?: Record<string, never>;
  sessionFailed?: { reason?: string };
}

export interface ListActivitiesResponse {
  activities?: JulesActivity[];
  nextPageToken?: string;
}

/* -------------------------------------------------------------------------- */
/*                          Normalized (frontend) types                       */
/* -------------------------------------------------------------------------- */

export interface NormalizedSource {
  /** Full Jules resource name, e.g. `sources/github/owner/repo`. */
  name: string;
  id: string;
  owner: string | null;
  repo: string | null;
  /** `owner/repo` when available, otherwise the raw id. */
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string | null;
  branches: string[];
  githubUrl: string | null;
}

export type ActivityKind =
  | "agentMessaged"
  | "userMessaged"
  | "planGenerated"
  | "planApproved"
  | "progressUpdated"
  | "sessionCompleted"
  | "sessionFailed"
  | "unknown";

export interface NormalizedActivity {
  name: string;
  id: string;
  kind: ActivityKind;
  /** Human-readable title for the timeline row. */
  title: string;
  /** Main body text, when the activity carries one. */
  body: string | null;
  createTime: string | null;
  originator: string | null;
  plan: Plan | null;
  planId: string | null;
  failureReason: string | null;
  artifacts: Artifact[];
}

export interface NormalizedSession {
  name: string;
  id: string;
  title: string;
  promptPreview: string;
  prompt: string;
  state: SessionState;
  /** Coarse bucket derived from `state`, used to drive polling + badges. */
  activity: "active" | "waiting" | "done" | "failed" | "unknown";
  isActive: boolean;
  requiresPlanApproval: boolean;
  awaitingUserFeedback: boolean;
  source: string | null;
  sourceFullName: string | null;
  branch: string | null;
  createTime: string | null;
  updateTime: string | null;
  julesUrl: string | null;
  pullRequestUrl: string | null;
  pullRequestTitle: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  nextPageToken: string | null;
}

/** Shape of every error body returned by our own route handlers. */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
