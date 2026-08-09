import "server-only";

/**
 * Read-only access to PUBLIC GitHub repositories, used by the NVIDIA agent to
 * understand a codebase before it asks Jules to change anything.
 *
 * Deliberately limited:
 *  - unauthenticated by default, so it can only ever see public data;
 *  - GET requests only, so it can never mutate a repository;
 *  - every payload is truncated before being handed to a model, because tool
 *    results are fed straight back into the context window.
 *
 * `GITHUB_TOKEN` is optional. When present it is used purely to raise the rate
 * limit from 60 to 5,000 requests/hour; it is never required and never returned.
 */

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;

/** Caps chosen to keep a single tool result well under a model's context budget. */
const MAX_FILE_CHARS = 8_000;
const MAX_README_CHARS = 4_000;
const MAX_TREE_ENTRIES = 300;
const MAX_ISSUES = 15;

export class GitHubError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

/** Parses `owner/repo`, a full GitHub URL, or a Jules source resource name. */
export function parseRepoRef(input: string): { owner: string; repo: string } {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^sources\/github\//, "")
    .replace(/^sources\//, "")
    .replace(/\.git$/, "")
    .replace(/^\/+|\/+$/g, "");

  const segments = cleaned.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new GitHubError(
      `"${input}" is not a repository reference. Use the owner/repo form, e.g. vercel/next.js.`,
      400,
    );
  }

  const [owner, repo] = segments;

  // Reject anything that could escape the intended path.
  const valid = /^[A-Za-z0-9._-]+$/;
  if (!valid.test(owner!) || !valid.test(repo!)) {
    throw new GitHubError(`"${input}" is not a valid repository reference.`, 400);
  }

  return { owner: owner!, repo: repo! };
}

async function githubRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = process.env.GITHUB_TOKEN;

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signals: AbortSignal[] = [timeoutController.signal];
  if (signal) signals.push(signal);

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "jules-plus-agent",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new GitHubError("GitHub did not respond in time.", 504);
    }
    if (signal?.aborted) throw error;
    throw new GitHubError("Could not reach GitHub.", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new GitHubError(
      "Not found on GitHub. The repository or path may be private, renamed, or misspelled - " +
        "this tool can only read public repositories.",
      404,
    );
  }

  if (response.status === 403 || response.status === 429) {
    throw new GitHubError(
      "GitHub rate limit reached for anonymous requests. Try again in a few minutes, or set " +
        "GITHUB_TOKEN on the server to raise the limit.",
      429,
    );
  }

  if (!response.ok) {
    throw new GitHubError(`GitHub request failed with status ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n…[truncated, ${value.length - max} more characters]`;
}

/* -------------------------------------------------------------------------- */
/*                                 Operations                                 */
/* -------------------------------------------------------------------------- */

interface GitHubRepoResponse {
  full_name?: string;
  description?: string | null;
  default_branch?: string;
  language?: string | null;
  topics?: string[];
  stargazers_count?: number;
  open_issues_count?: number;
  license?: { spdx_id?: string } | null;
  pushed_at?: string;
  archived?: boolean;
  private?: boolean;
  html_url?: string;
}

export interface RepoOverview {
  repo: string;
  description: string | null;
  defaultBranch: string;
  primaryLanguage: string | null;
  topics: string[];
  stars: number;
  openIssues: number;
  license: string | null;
  lastPushedAt: string | null;
  archived: boolean;
  url: string | null;
  readmeExcerpt: string | null;
}

export async function getRepoOverview(ref: string, signal?: AbortSignal): Promise<RepoOverview> {
  const { owner, repo } = parseRepoRef(ref);

  const data = await githubRequest<GitHubRepoResponse>(`/repos/${owner}/${repo}`, signal);

  if (data.private) {
    throw new GitHubError(
      "That repository is private. The agent can only read public repositories - ask Jules " +
        "directly for private work, since it has installed GitHub App access.",
      403,
    );
  }

  // A missing README is normal, so never fail the whole overview because of it.
  let readmeExcerpt: string | null = null;
  try {
    const readme = await githubRequest<{ content?: string; encoding?: string }>(
      `/repos/${owner}/${repo}/readme`,
      signal,
    );

    if (readme.content && readme.encoding === "base64") {
      readmeExcerpt = truncate(
        Buffer.from(readme.content, "base64").toString("utf8"),
        MAX_README_CHARS,
      );
    }
  } catch {
    readmeExcerpt = null;
  }

  return {
    repo: data.full_name ?? `${owner}/${repo}`,
    description: data.description ?? null,
    defaultBranch: data.default_branch ?? "main",
    primaryLanguage: data.language ?? null,
    topics: data.topics ?? [],
    stars: data.stargazers_count ?? 0,
    openIssues: data.open_issues_count ?? 0,
    license: data.license?.spdx_id ?? null,
    lastPushedAt: data.pushed_at ?? null,
    archived: Boolean(data.archived),
    url: data.html_url ?? null,
    readmeExcerpt,
  };
}

export interface RepoTreeResult {
  repo: string;
  ref: string;
  path: string;
  entries: { path: string; type: "file" | "dir"; size?: number }[];
  truncated: boolean;
}

/** Lists one directory level. Cheaper and more predictable than a recursive tree. */
export async function listRepoFiles(
  ref: string,
  params: { path?: string; gitRef?: string } = {},
  signal?: AbortSignal,
): Promise<RepoTreeResult> {
  const { owner, repo } = parseRepoRef(ref);

  const path = (params.path ?? "").replace(/^\/+|\/+$/g, "");
  if (path.includes("..")) throw new GitHubError("Path traversal is not allowed.", 400);

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const query = params.gitRef ? `?ref=${encodeURIComponent(params.gitRef)}` : "";
  const data = await githubRequest<
    { name?: string; path?: string; type?: string; size?: number }[] | { type?: string }
  >(`/repos/${owner}/${repo}/contents/${encodedPath}${query}`, signal);

  if (!Array.isArray(data)) {
    throw new GitHubError(
      `"${path || "/"}" is a file, not a directory. Use read_repository_file instead.`,
      400,
    );
  }

  const all = data.map((entry) => ({
    path: entry.path ?? entry.name ?? "",
    type: entry.type === "dir" ? ("dir" as const) : ("file" as const),
    ...(typeof entry.size === "number" && entry.size > 0 ? { size: entry.size } : {}),
  }));

  return {
    repo: `${owner}/${repo}`,
    ref: params.gitRef ?? "default",
    path: path || "/",
    entries: all.slice(0, MAX_TREE_ENTRIES),
    truncated: all.length > MAX_TREE_ENTRIES,
  };
}

export interface RepoFileResult {
  repo: string;
  path: string;
  ref: string;
  content: string;
  truncated: boolean;
  totalBytes: number;
}

export async function readRepoFile(
  ref: string,
  params: { path: string; gitRef?: string },
  signal?: AbortSignal,
): Promise<RepoFileResult> {
  const { owner, repo } = parseRepoRef(ref);

  const path = params.path.replace(/^\/+/, "");
  if (!path) throw new GitHubError("A file path is required.", 400);
  if (path.includes("..")) throw new GitHubError("Path traversal is not allowed.", 400);

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const query = params.gitRef ? `?ref=${encodeURIComponent(params.gitRef)}` : "";
  const data = await githubRequest<{
    content?: string;
    encoding?: string;
    size?: number;
    type?: string;
  }>(`/repos/${owner}/${repo}/contents/${encodedPath}${query}`, signal);

  if (data.type === "dir") {
    throw new GitHubError(
      `"${path}" is a directory. Use list_repository_files instead.`,
      400,
    );
  }

  if (!data.content || data.encoding !== "base64") {
    throw new GitHubError(
      `"${path}" could not be read as text. It may be binary or too large for the contents API.`,
      400,
    );
  }

  const decoded = Buffer.from(data.content, "base64").toString("utf8");

  // Reject binaries that happen to decode: a NUL byte is never valid source text.
  if (decoded.includes("\u0000")) {
    throw new GitHubError(`"${path}" looks like a binary file.`, 400);
  }

  return {
    repo: `${owner}/${repo}`,
    path,
    ref: params.gitRef ?? "default",
    content: truncate(decoded, MAX_FILE_CHARS),
    truncated: decoded.length > MAX_FILE_CHARS,
    totalBytes: data.size ?? decoded.length,
  };
}

export interface RepoIssuesResult {
  repo: string;
  issues: {
    number: number;
    title: string;
    state: string;
    labels: string[];
    comments: number;
    updatedAt: string | null;
    excerpt: string | null;
    url: string | null;
  }[];
}

/** Recent issues, a fast way for the agent to find a real reported problem. */
export async function listRepoIssues(
  ref: string,
  params: { state?: "open" | "closed" | "all" } = {},
  signal?: AbortSignal,
): Promise<RepoIssuesResult> {
  const { owner, repo } = parseRepoRef(ref);
  const state = params.state ?? "open";

  const data = await githubRequest<
    {
      number?: number;
      title?: string;
      state?: string;
      body?: string | null;
      comments?: number;
      updated_at?: string;
      html_url?: string;
      pull_request?: unknown;
      labels?: ({ name?: string } | string)[];
    }[]
  >(
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=${MAX_ISSUES}&sort=updated`,
    signal,
  );

  return {
    repo: `${owner}/${repo}`,
    issues: (data ?? [])
      // The issues endpoint also returns PRs; the agent asked for issues.
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number ?? 0,
        title: issue.title ?? "(untitled)",
        state: issue.state ?? state,
        labels: (issue.labels ?? [])
          .map((label) => (typeof label === "string" ? label : label?.name))
          .filter((label): label is string => Boolean(label)),
        comments: issue.comments ?? 0,
        updatedAt: issue.updated_at ?? null,
        excerpt: issue.body ? truncate(issue.body, 600) : null,
        url: issue.html_url ?? null,
      })),
  };
}
