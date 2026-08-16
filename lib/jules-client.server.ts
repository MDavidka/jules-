import "server-only";

import { decryptSecret, DecryptionError } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase, profileHasKey } from "@/lib/mongodb.server";
import type { AppProfileDoc } from "@/lib/mongodb.server";
import {
  JULES_API_BASE_URL,
  type CreateSessionRequest,
  type JulesActivity,
  type JulesSession,
  type JulesSource,
  type ListActivitiesResponse,
  type ListSessionsResponse,
  type ListSourcesResponse,
  type NormalizedActivity,
  type NormalizedSession,
  type NormalizedSource,
  type SessionState,
} from "@/types/jules";

/**
 * Server-only Jules API service.
 *
 * The decrypted API key never leaves this module: it is read from MongoDB,
 * decrypted, and attached to the outbound `X-Goog-Api-Key` header. Neither the
 * key nor request headers are ever logged, and upstream error bodies are
 * sanitized before being surfaced to the client.
 */

const REQUEST_TIMEOUT_MS = 30_000;

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

/** Raised when no API key has been configured yet. */
export class NotConfiguredError extends Error {
  constructor(message = "No Jules API key is configured. Add one to get started.") {
    super(message);
    this.name = "NotConfiguredError";
  }
}

/** Raised for non-2xx upstream responses. Message is always sanitized. */
export class JulesApiError extends Error {
  readonly status: number;
  readonly upstreamStatus: string | null;

  constructor(message: string, status: number, upstreamStatus: string | null = null) {
    super(message);
    this.name = "JulesApiError";
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

export { DecryptionError };

/* -------------------------------------------------------------------------- */
/*                              Key management                                */
/* -------------------------------------------------------------------------- */

/**
 * Loads and decrypts the stored key. Returns null when unconfigured.
 * The result must never be logged or returned to a client.
 */
async function loadApiKey(): Promise<string | null> {
  await connectToDatabase();
  const profile = await AppProfile.findById(APP_PROFILE_ID).lean<AppProfileDoc>().exec();

  if (!profileHasKey(profile)) return null;

  return decryptSecret({
    ciphertext: profile!.julesApiKeyEncrypted!,
    iv: profile!.julesApiKeyIv!,
    authTag: profile!.julesApiKeyAuthTag!,
  });
}

export async function isConfigured(): Promise<boolean> {
  await connectToDatabase();
  const profile = await AppProfile.findById(APP_PROFILE_ID)
    .select("julesApiKeyEncrypted julesApiKeyIv julesApiKeyAuthTag")
    .lean<AppProfileDoc>()
    .exec();
  return profileHasKey(profile);
}

/* -------------------------------------------------------------------------- */
/*                              Error sanitizing                              */
/* -------------------------------------------------------------------------- */

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Maps an upstream failure to a safe, user-facing message.
 * Raw upstream text is only used when it is a recognizable Google error message,
 * which never contains credentials.
 */
async function toSanitizedError(response: Response): Promise<JulesApiError> {
  let upstreamMessage: string | null = null;
  let upstreamStatus: string | null = null;

  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as GoogleErrorBody;
        upstreamMessage = parsed.error?.message ?? null;
        upstreamStatus = parsed.error?.status ?? null;
      } catch {
        // Non-JSON body: ignore it entirely rather than forwarding raw HTML.
        upstreamMessage = null;
      }
    }
  } catch {
    upstreamMessage = null;
  }

  /**
   * Some upstream messages are technically accurate but actively misleading to
   * an end user. Google's API gateway rejects an unrecognized key with
   * "API keys are not supported by this API...", which reads as though Jules
   * does not accept API keys at all. Rewrite those into actionable guidance.
   */
  const MESSAGE_REWRITES: { pattern: RegExp; message: string }[] = [
    {
      pattern: /API keys are not supported by this API/i,
      message:
        "Google did not recognize that API key. Make sure you pasted a Jules API key created in " +
        "Jules Settings (jules.google.com/settings), with no extra characters.",
    },
    {
      pattern: /API key not valid|API_KEY_INVALID/i,
      message:
        "That API key is not valid. Create a new key in Jules Settings and paste it again.",
    },
    {
      pattern: /has not been used in project|SERVICE_DISABLED|is disabled/i,
      message:
        "The Jules API is not enabled for this key's project. Generate the key from Jules Settings rather than the Google Cloud console.",
    },
  ];

  if (upstreamMessage) {
    const rewrite = MESSAGE_REWRITES.find((entry) => entry.pattern.test(upstreamMessage!));
    if (rewrite) upstreamMessage = rewrite.message;
  }

  const fallbackByStatus: Record<number, string> = {
    400: "Jules rejected the request as invalid.",
    401: "Your Jules API key was rejected. Generate a new key in Jules Settings and save it again.",
    403:
      "Jules denied access. Confirm the Jules GitHub App is installed and has access to the repository.",
    404: "The requested Jules resource was not found.",
    409: "This Jules session cannot accept that action in its current state.",
    429: "Jules rate limit reached. Wait a moment and try again.",
    500: "Jules had an internal error. Try again shortly.",
    503: "Jules is temporarily unavailable. Try again shortly.",
  };

  const message =
    upstreamMessage ??
    fallbackByStatus[response.status] ??
    `Jules request failed with status ${response.status}.`;

  return new JulesApiError(message, response.status, upstreamStatus);
}

/* -------------------------------------------------------------------------- */
/*                                 Transport                                  */
/* -------------------------------------------------------------------------- */

interface JulesRequestOptions {
  method?: "GET" | "POST";
  /** Path relative to the API base, must begin with `/`. */
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  /** Explicit key, used by the validation flow before anything is persisted. */
  apiKey?: string;
  signal?: AbortSignal;
}

async function julesRequest<T>({
  method = "GET",
  path,
  query,
  body,
  apiKey,
  signal,
}: JulesRequestOptions): Promise<T> {
  const key = apiKey ?? (await loadApiKey());

  if (!key) throw new NotConfiguredError();

  const url = new URL(`${JULES_API_BASE_URL}${path}`);
  if (query) {
    for (const [param, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(param, String(value));
    }
  }

  // Combine caller cancellation with our own timeout.
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signals: AbortSignal[] = [timeoutController.signal];
  if (signal) signals.push(signal);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-Goog-Api-Key": key,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      // Always hit the live API; never serve a cached Jules response.
      cache: "no-store",
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    clearTimeout(timeout);

    if (timeoutController.signal.aborted) {
      throw new JulesApiError("The Jules API did not respond in time. Try again.", 504);
    }
    if (signal?.aborted) throw error; // Propagate genuine client cancellation.

    throw new JulesApiError("Could not reach the Jules API. Check your network connection.", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw await toSanitizedError(response);

  // approvePlan and sendMessage return an empty body on success.
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new JulesApiError("Jules returned a malformed response.", 502);
  }
}

/**
 * Encodes a Jules resource name for use in a URL path, preserving the `/`
 * separators that are structurally meaningful (e.g. `sources/github/owner/repo`).
 */
export function encodeResourceName(name: string): string {
  return name
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/* -------------------------------------------------------------------------- */
/*                              Public operations                             */
/* -------------------------------------------------------------------------- */

/**
 * Validates a candidate API key against `GET /sources?pageSize=1`.
 * Used before the key is ever persisted.
 */
export async function validateApiKey(
  apiKey: string,
): Promise<{ ok: true; sourceCount: number } | { ok: false; message: string; status: number }> {
  try {
    const result = await julesRequest<ListSourcesResponse>({
      path: "/sources",
      query: { pageSize: 1 },
      apiKey,
    });

    return { ok: true, sourceCount: result.sources?.length ?? 0 };
  } catch (error) {
    if (error instanceof JulesApiError) {
      return { ok: false, message: error.message, status: error.status };
    }
    return {
      ok: false,
      message: "Could not validate the key against the Jules API. Try again.",
      status: 502,
    };
  }
}

export async function listSources(params: {
  pageSize?: number;
  pageToken?: string;
  filter?: string;
  signal?: AbortSignal;
}): Promise<ListSourcesResponse> {
  return julesRequest<ListSourcesResponse>({
    path: "/sources",
    query: {
      pageSize: params.pageSize,
      pageToken: params.pageToken,
      filter: params.filter,
    },
    signal: params.signal,
  });
}

export async function getSource(sourceName: string, signal?: AbortSignal): Promise<JulesSource> {
  return julesRequest<JulesSource>({
    path: `/${encodeResourceName(sourceName)}`,
    signal,
  });
}

export async function listSessions(params: {
  pageSize?: number;
  pageToken?: string;
  signal?: AbortSignal;
}): Promise<ListSessionsResponse> {
  return julesRequest<ListSessionsResponse>({
    path: "/sessions",
    query: { pageSize: params.pageSize, pageToken: params.pageToken },
    signal: params.signal,
  });
}

export async function getSession(sessionName: string, signal?: AbortSignal): Promise<JulesSession> {
  return julesRequest<JulesSession>({
    path: `/${encodeResourceName(sessionName)}`,
    signal,
  });
}

export async function createSession(payload: CreateSessionRequest): Promise<JulesSession> {
  return julesRequest<JulesSession>({
    method: "POST",
    path: "/sessions",
    body: payload,
  });
}

export async function listActivities(
  sessionName: string,
  params: { pageSize?: number; pageToken?: string; signal?: AbortSignal } = {},
): Promise<ListActivitiesResponse> {
  return julesRequest<ListActivitiesResponse>({
    path: `/${encodeResourceName(sessionName)}/activities`,
    query: { pageSize: params.pageSize, pageToken: params.pageToken },
    signal: params.signal,
  });
}

/** Approves the pending plan. Upstream requires an empty request body. */
export async function approvePlan(sessionName: string): Promise<void> {
  await julesRequest<Record<string, never>>({
    method: "POST",
    path: `/${encodeResourceName(sessionName)}:approvePlan`,
    body: {},
  });
}

export async function sendMessage(sessionName: string, prompt: string): Promise<void> {
  await julesRequest<Record<string, never>>({
    method: "POST",
    path: `/${encodeResourceName(sessionName)}:sendMessage`,
    body: { prompt },
  });
}

/* -------------------------------------------------------------------------- */
/*                                Normalizers                                 */
/* -------------------------------------------------------------------------- */

const ACTIVE_STATES: ReadonlySet<SessionState> = new Set<SessionState>([
  "QUEUED",
  "PLANNING",
  "IN_PROGRESS",
]);

const WAITING_STATES: ReadonlySet<SessionState> = new Set<SessionState>([
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "PAUSED",
]);

function activityBucket(state: SessionState): NormalizedSession["activity"] {
  if (ACTIVE_STATES.has(state)) return "active";
  if (WAITING_STATES.has(state)) return "waiting";
  if (state === "COMPLETED") return "done";
  if (state === "FAILED") return "failed";
  return "unknown";
}

export function normalizeSource(source: JulesSource): NormalizedSource {
  const owner = source.githubRepo?.owner ?? null;
  const repo = source.githubRepo?.repo ?? null;
  const name = source.name ?? "";
  const id = source.id ?? name.replace(/^sources\//, "");

  const branches = (source.githubRepo?.branches ?? [])
    .map((branch) => branch.displayName)
    .filter((value): value is string => Boolean(value));

  const defaultBranch = source.githubRepo?.defaultBranch?.displayName ?? null;

  // Ensure the default branch is selectable even if absent from `branches`.
  if (defaultBranch && !branches.includes(defaultBranch)) branches.unshift(defaultBranch);

  return {
    name,
    id,
    owner,
    repo,
    fullName: owner && repo ? `${owner}/${repo}` : id || name,
    isPrivate: source.githubRepo?.isPrivate ?? false,
    defaultBranch,
    branches,
    githubUrl: owner && repo ? `https://github.com/${owner}/${repo}` : null,
  };
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Removes leaked model-tool protocol markup from text returned by Jules.
 *
 * Some upstream responses contain a DSML tool-call block intended for the
 * model/runtime, not for the session transcript. The block can arrive with
 * whitespace inserted between its delimiters, and it can be incomplete while
 * the upstream activity is still being assembled, so both complete blocks and
 * an unterminated block are handled here before the text reaches the UI.
 */
export function sanitizeActivityText(value: string | null | undefined): string | null {
  if (!value) return null;

  const openingMarker = /<\s*\/?\s*\|?\s*DSML\b/i;
  if (!openingMarker.test(value)) return value;

  const toolBlock = /<\s*\/?\s*\|?\s*DSML\s*\|?\s*\/?\s*toolcalls?\s*>[\s\S]*?(?:<\s*\/\s*\|?\s*DSML\s*\|?\s*\/?\s*toolcalls?\s*>|<\s*\|?\s*DSML\s*\|?\s*\/\s*toolcalls?\s*>)/gi;
  let sanitized = value.replace(toolBlock, "");

  // Streaming/incomplete activities may not contain a closing marker yet.
  // Drop the partial protocol payload rather than exposing its internals.
  if (openingMarker.test(sanitized)) {
    sanitized = sanitized.slice(0, sanitized.search(openingMarker));
  }

  return sanitized
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}

export function normalizeSession(session: JulesSession): NormalizedSession {
  const state: SessionState = session.state ?? "STATE_UNSPECIFIED";
  const name = session.name ?? "";
  const prompt = session.prompt ?? "";

  const sourceName = session.sourceContext?.source ?? null;
  const sourceFullName = sourceName
    ? sourceName.replace(/^sources\/github\//, "").replace(/^sources\//, "")
    : null;

  const pullRequest = session.outputs?.find((output) => output.pullRequest)?.pullRequest ?? null;

  return {
    name,
    id: session.id ?? name.replace(/^sessions\//, ""),
    title: session.title?.trim() || truncate(prompt, 60) || "Untitled task",
    promptPreview: truncate(prompt, 160),
    prompt,
    state,
    activity: activityBucket(state),
    isActive: ACTIVE_STATES.has(state),
    requiresPlanApproval: state === "AWAITING_PLAN_APPROVAL",
    awaitingUserFeedback: state === "AWAITING_USER_FEEDBACK",
    source: sourceName,
    sourceFullName,
    branch: session.sourceContext?.githubRepoContext?.startingBranch ?? null,
    createTime: session.createTime ?? null,
    updateTime: session.updateTime ?? null,
    julesUrl: session.url ?? null,
    pullRequestUrl: pullRequest?.url ?? null,
    pullRequestTitle: pullRequest?.title ?? null,
  };
}

export function normalizeActivity(activity: JulesActivity): NormalizedActivity {
  const name = activity.name ?? "";
  const id = activity.id ?? name.split("/").pop() ?? "";

  let kind: NormalizedActivity["kind"] = "unknown";
  let title = activity.description?.trim() || "Activity";
  let body: string | null = null;

  if (activity.agentMessaged) {
    kind = "agentMessaged";
    title = "Jules";
    body = sanitizeActivityText(activity.agentMessaged.agentMessage);
  } else if (activity.userMessaged) {
    kind = "userMessaged";
    title = "You";
    body = sanitizeActivityText(activity.userMessaged.userMessage);
  } else if (activity.planGenerated) {
    kind = "planGenerated";
    title = "Plan generated";
    body = null;
  } else if (activity.planApproved) {
    kind = "planApproved";
    title = "Plan approved";
  } else if (activity.progressUpdated) {
    kind = "progressUpdated";
    title = activity.progressUpdated.title?.trim() || "Progress update";
    body = sanitizeActivityText(activity.progressUpdated.description);
  } else if (activity.sessionCompleted) {
    kind = "sessionCompleted";
    title = "Session completed";
  } else if (activity.sessionFailed) {
    kind = "sessionFailed";
    title = "Session failed";
    body = sanitizeActivityText(activity.sessionFailed.reason);
  }

  return {
    name,
    id,
    kind,
    title,
    body,
    createTime: activity.createTime ?? null,
    originator: activity.originator ?? null,
    plan: activity.planGenerated?.plan ?? null,
    planId: activity.planApproved?.planId ?? null,
    failureReason: sanitizeActivityText(activity.sessionFailed?.reason),
    artifacts: activity.artifacts ?? [],
  };
}
