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

/**
 * Resolves a GitHub repository from a Jules source name
 * (`sources/github/owner/repo`), a full GitHub link
 * (`https://github.com/owner/repo`), or a plain `owner/repo`.
 */
function resolveGitHubRepo(value: string): ResolvedRepo | null {
  const input = value.trim();
  if (!input) return null;

  const source = input.match(/^sources\/github\/([^/\s]+)\/([^/\s]+)/);
  if (source) return { owner: source[1], repo: source[2], branch: "HEAD" };

  const url = input.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/);
  if (url) return { owner: url[1], repo: stripGitSuffix(url[2]), branch: "HEAD" };

  const plain = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (plain) return { owner: plain[1], repo: stripGitSuffix(plain[2]), branch: "HEAD" };

  return null;
}

function stripGitSuffix(repo: string) {
  return repo.replace(/\.git$/, "");
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
  for (let index = 0; index < README_FILES.length; index += 1) {
    const response = probeResponses[index];
    if (response?.ok) {
      readme = (await response.text()).slice(0, 12000);
      break;
    }
  }
  if (readme === "README unavailable." && apiReadmeResponse.ok) {
    readme = (await apiReadmeResponse.text()).slice(0, 12000);
  }

  const manifests: Array<{ path: string; content: string }> = [];
  for (let index = README_FILES.length; index < probePaths.length; index += 1) {
    const response = probeResponses[index - README_FILES.length];
    if (!response?.ok) continue;
    manifests.push({ path: probePaths[index], content: (await response.text()).slice(0, 4000) });
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
  const response = await fetch(url, { headers: { "User-Agent": "jules-plus research reader" }, next: { revalidate: 300 } });
  if (!response.ok) return `Could not read ${url} (${response.status}).`;
  const html = await response.text();
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").slice(0, 12000);
}
