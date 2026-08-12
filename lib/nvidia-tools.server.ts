const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";

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

interface RepositoryTreeEntry {
  path?: string;
  type?: string;
  size?: number;
}

export interface RepositoryInspectionOptions {
  /** File/path fragments explicitly mentioned by the user. */
  pathHints?: string[];
  /** Maximum number of raw source files to include in the model context. */
  maxFiles?: number;
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
export function extractCodePathHints(value: string): string[] {
  const candidates = value.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g) ?? [];
  return [...new Set(candidates
    .map((candidate) => candidate.replace(/^\/+|\/+$/g, ""))
    .filter((candidate) => /\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php|json|yml|yaml|md)$/i.test(candidate) || /^(?:app|src|lib|components|api|routes|server|client)\//i.test(candidate)))]
    .slice(0, 16);
}

export async function inspectPublicRepository(source: string, options: RepositoryInspectionOptions = {}) {
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

  const rawFiles = await fetchRelevantRawFiles(repo, repoMeta?.default_branch ?? repo.branch, options);

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
      rawFiles,
    },
    null,
    2,
  );
}

async function fetchRelevantRawFiles(
  repo: ResolvedRepo,
  branch: string,
  options: RepositoryInspectionOptions,
): Promise<Array<{ path: string; content: string; url: string }>> {
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "jules-deepdive" }, next: { revalidate: 300 } },
  );
  if (!treeResponse.ok) return [];

  const tree = await treeResponse.json() as { tree?: RepositoryTreeEntry[] };
  const files = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => ({ path: entry.path!, size: entry.size ?? 0 }));
  const hints = (options.pathHints ?? []).map((hint) => hint.toLowerCase());
  const sourceFile = /\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|c|cpp|h|sql)$/i;
  const ignored = /(^|\/)(?:node_modules|\.git|dist|build|coverage|vendor|\.next)(\/|$)/i;
  const scored = files
    .filter((file) => sourceFile.test(file.path) && !ignored.test(file.path) && file.size <= 180_000)
    .map((file) => {
      const lower = file.path.toLowerCase();
      const explicit = hints.some((hint) => lower === hint || lower.endsWith(`/${hint}`));
      const hintScore = hints.reduce((score, hint) => score + (lower.includes(hint) ? 8 : 0), 0);
      const important = /(?:route|api|server|client|service|tool|agent|mcp|github|index|main|app|lib)/i.test(file.path) ? 2 : 0;
      return { file, score: (explicit ? 100 : 0) + hintScore + important };
    })
    .sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path));
  const selected = scored.slice(0, Math.max(1, Math.min(options.maxFiles ?? 10, 16)));
  const filesWithContent = await Promise.all(selected.map(async ({ file }) => {
    const url = `${GITHUB_RAW_BASE}/${repo.owner}/${repo.repo}/${encodeURIComponent(branch)}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url, { headers: { "User-Agent": "jules-deepdive" }, next: { revalidate: 300 } });
    if (!response.ok) return null;
    return { path: file.path, content: (await response.text()).slice(0, 24_000), url };
  }));
  return filesWithContent.filter((file): file is { path: string; content: string; url: string } => Boolean(file));
}

export async function readWebPage(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "jules-plus research reader" }, next: { revalidate: 300 } });
  if (!response.ok) return `Could not read ${url} (${response.status}).`;
  const html = await response.text();
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").slice(0, 12000);
}
