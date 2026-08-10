const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";
const USER_AGENT = "jules-plus research reader";
const REQUEST_TIMEOUT_MS = 15_000;
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "jules-plus",
} as const;

const README_FILES = ["README.md", "readme.md", "README.txt", "README"];
const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "deno.json",
];

interface ResolvedRepo {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Resolves a GitHub repository from a Jules source name
 * (`sources/github/owner/repo`), a full GitHub link
 * (`https://github.com/owner/repo`), or a plain `owner/repo`.
 */
function resolveGitHubRepo(value: string): ResolvedRepo | null {
  const input = value.trim().replace(/[),.;!?]+$/, "");
  if (!input) return null;

  const source = input.match(/^sources\/github\/([^/\s]+)\/([^/\s?#]+)/i);
  if (source) return { owner: source[1]!, repo: stripGitSuffix(source[2]!), branch: "HEAD" };

  try {
    const url = new URL(input);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo || ["topics", "settings", "features", "marketplace"].includes(owner.toLowerCase())) return null;
    return { owner, repo: stripGitSuffix(repo), branch: "HEAD" };
  } catch {
    // Fall through to the short owner/repo format.
  }

  const plain = input.match(/^([^/\s]+)\/([^/\s?#]+)$/);
  if (plain) return { owner: plain[1]!, repo: stripGitSuffix(plain[2]!), branch: "HEAD" };

  return null;
}

function stripGitSuffix(repo: string) {
  return repo.replace(/\.git$/, "");
}

/** Extracts public GitHub repository links from an agent prompt. */
export function extractPublicRepositoryLinks(value: string): string[] {
  const matches = value.match(/https?:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:[^\s<>'\"]*)?/gi) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[),.;!?]+$/, "")))].slice(0, 4);
}

/**
 * Research for the user agent: resolves `(link)owner/repo` on the backend and
 * pulls the repository's raw git content (README plus common manifests) so the
 * model can describe what the codebase is about.
 */
export async function inspectPublicRepository(source: string) {
  const repo = resolveGitHubRepo(source);
  if (!repo) return "No repository was selected.";

  const rawBase = `${GITHUB_RAW_BASE}/${repo.owner}/${repo.repo}/HEAD`;
  const probePaths = [...README_FILES, ...MANIFEST_FILES];

  const [repoResponse, apiReadmeResponse, ...probeResponses] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "jules-plus" },
      next: { revalidate: 300 },
    }),
    fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/readme`, {
      headers: { Accept: "application/vnd.github.raw+json", "User-Agent": "jules-plus" },
      next: { revalidate: 300 },
    }),
    ...probePaths.map((path) =>
      fetch(`${rawBase}/${path}`, {
        headers: { "User-Agent": "jules-plus" },
        next: { revalidate: 300 },
      }),
    ),
  ]);

  const repoMeta = repoResponse.ok
    ? (await repoResponse.json()) as {
        full_name?: string;
        description?: string;
        language?: string;
        default_branch?: string;
        topics?: string[];
      }
    : null;

  let readme = "README unavailable.";
  const readmeResponses = probeResponses.slice(0, README_FILES.length);
  for (let index = 0; index < readmeResponses.length; index += 1) {
    const response = readmeResponses[index];
    if (response?.ok) {
      readme = (await response.text()).slice(0, 12000);
      break;
    }
  }
  if (readme === "README unavailable." && apiReadmeResponse.ok) {
    readme = (await apiReadmeResponse.text()).slice(0, 12000);
  }

  const manifests: Array<{ path: string; content: string }> = [];
  const manifestResponses = probeResponses.slice(README_FILES.length);
  for (let index = 0; index < manifestResponses.length; index += 1) {
    const response = manifestResponses[index];
    if (!response?.ok) continue;
    manifests.push({ path: MANIFEST_FILES[index]!, content: (await response.text()).slice(0, 4000) });
  }

  return JSON.stringify(
    {
      repository: {
        fullName: repoMeta?.full_name ?? `${repo.owner}/${repo.repo}`,
        description: repoMeta?.description ?? null,
        language: repoMeta?.language ?? null,
        defaultBranch: repoMeta?.default_branch ?? repo.branch,
        topics: repoMeta?.topics ?? [],
        url: `https://github.com/${repo.owner}/${repo.repo}`,
      },
      readme,
      manifests,
    },
    null,
    2,
  );
}

export async function readWebPage(url: string) {
  if (!isFetchableHttpUrl(url)) return `Refused to read ${url}: only public http(s) pages are allowed.`;

  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9" },
    next: { revalidate: 300 },
  });
  if (!response.ok) return `Could not read ${url} (${response.status}).`;

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/|json|xml/i.test(contentType)) return `Skipped ${url}: unsupported content type (${contentType || "unknown"}).`;

  const html = await response.text();
  return htmlToText(html).slice(0, 12000);
}

/* -------------------------------------------------------------------------- */
/*                              Web search tool                               */
/* -------------------------------------------------------------------------- */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Keyless web search via the DuckDuckGo HTML endpoint. Results are best-effort:
 * on failure the agent still gets a readable explanation instead of an error.
 */
export async function searchWeb(query: string, limit = 5): Promise<string> {
  const term = query.trim();
  if (!term) return "No search query was provided.";

  try {
    const response = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(term)}`,
      {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
        },
        body: `q=${encodeURIComponent(term)}`,
        cache: "no-store",
      },
    );
    if (!response.ok) return `Web search for "${term}" failed (${response.status}).`;

    const results = parseDuckDuckGoResults(await response.text(), limit);
    if (results.length === 0) return `Web search for "${term}" returned no usable results.`;

    return JSON.stringify({ query: term, results }, null, 2);
  } catch (error) {
    return `Web search for "${term}" was unavailable: ${error instanceof Error ? error.message : "unknown error"}.`;
  }
}

function parseDuckDuckGoResults(html: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const linkPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetPattern.exec(html))) snippets.push(htmlToText(snippetMatch[1]!));

  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkPattern.exec(html)) && results.length < limit) {
    const url = resolveDuckDuckGoHref(linkMatch[1]!);
    if (!url) continue;

    results.push({
      title: htmlToText(linkMatch[2]!).slice(0, 200),
      url,
      snippet: (snippets[results.length] ?? "").slice(0, 400),
    });
  }

  return results;
}

/** DuckDuckGo wraps outbound links in a redirect carrying the real target in `uddg`. */
function resolveDuckDuckGoHref(href: string): string | null {
  const decoded = decodeHtmlEntities(href);
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded;

  try {
    const url = new URL(absolute);
    const target = url.searchParams.get("uddg");
    const finalUrl = target ? new URL(target) : url;
    return /^https?:$/.test(finalUrl.protocol) ? finalUrl.toString() : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                        Deep repository inspection                          */
/* -------------------------------------------------------------------------- */

/**
 * Lists a repository's file tree so a multi-step agent can decide which files
 * are worth reading next.
 */
export async function listRepositoryTree(source: string, limit = 400): Promise<string> {
  const repo = resolveGitHubRepo(source);
  if (!repo) return "No repository was selected.";

  const branch = await resolveDefaultBranch(repo);
  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: GITHUB_API_HEADERS, next: { revalidate: 300 } },
  );
  if (!response.ok) {
    return `Could not list ${repo.owner}/${repo.repo} at ${branch} (${response.status}).`;
  }

  const payload = (await response.json()) as {
    truncated?: boolean;
    tree?: Array<{ path?: string; type?: string; size?: number }>;
  };
  const files = (payload.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path && !isIgnoredPath(entry.path))
    .slice(0, limit)
    .map((entry) => ({ path: entry.path!, size: entry.size ?? null }));

  return JSON.stringify(
    {
      repository: `${repo.owner}/${repo.repo}`,
      branch,
      truncated: Boolean(payload.truncated) || files.length >= limit,
      fileCount: files.length,
      files,
    },
    null,
    2,
  );
}

/** Reads a single file from a public repository, for step-by-step exploration. */
export async function readRepositoryFile(source: string, path: string): Promise<string> {
  const repo = resolveGitHubRepo(source);
  if (!repo) return "No repository was selected.";

  const cleanPath = path.trim().replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("..")) return `Invalid file path: ${path}`;

  const branch = await resolveDefaultBranch(repo);
  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetchWithTimeout(
    `${GITHUB_RAW_BASE}/${repo.owner}/${repo.repo}/${encodeURIComponent(branch)}/${encodedPath}`,
    { headers: { "User-Agent": USER_AGENT }, next: { revalidate: 300 } },
  );
  if (!response.ok) return `Could not read ${cleanPath} (${response.status}).`;

  const content = (await response.text()).slice(0, 20000);
  return JSON.stringify({ repository: `${repo.owner}/${repo.repo}`, branch, path: cleanPath, content }, null, 2);
}

async function resolveDefaultBranch(repo: ResolvedRepo): Promise<string> {
  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
      { headers: GITHUB_API_HEADERS, next: { revalidate: 300 } },
    );
    if (!response.ok) return "HEAD";
    const meta = (await response.json()) as { default_branch?: string };
    return meta.default_branch ?? "HEAD";
  } catch {
    return "HEAD";
  }
}

/** Build output, lockfiles, and binaries are noise for code understanding. */
function isIgnoredPath(path: string) {
  return (
    /(^|\/)(node_modules|\.git|dist|build|out|coverage|vendor|__pycache__|\.next|\.venv)\//.test(path) ||
    /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|go\.sum)$/.test(path) ||
    /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|mp4|mp3|woff2?|ttf|eot|so|dll|exe|bin|wasm)$/i.test(path)
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

async function fetchWithTimeout(url: string, init: RequestInit & { next?: { revalidate: number } }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Blocks non-http(s) schemes and obvious loopback/private-network targets. */
function isFetchableHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;

    const host = url.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:lt|#60);/gi, "<")
    .replace(/&(?:gt|#62);/gi, ">")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:#39|apos|#x27);/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}
