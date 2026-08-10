import { fetchGitHubRepositoryContext, parseGitHubRepo } from "@/lib/github-research.server";

export async function inspectPublicRepository(source: string) {
  const parsed = parseGitHubRepo(source);
  const name = parsed ? `${parsed.owner}/${parsed.repo}` : "";
  if (!name) return "No repository was selected.";
  const [repoResponse, readmeResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${name}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "jules-plus" }, next: { revalidate: 300 } }),
    fetch(`https://api.github.com/repos/${name}/readme`, { headers: { Accept: "application/vnd.github.raw+json", "User-Agent": "jules-plus" }, next: { revalidate: 300 } }),
  ]);
  const repo = repoResponse.ok ? await repoResponse.json() as { full_name?: string; description?: string; language?: string; topics?: string[] } : null;
  const readme = readmeResponse.ok ? (await readmeResponse.text()).slice(0, 12000) : "README unavailable.";
  const rawContext = await fetchGitHubRepositoryContext(name);
  return JSON.stringify({ repository: repo, readme, rawContext }, null, 2);
}

export async function readWebPage(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "jules-plus research reader" }, next: { revalidate: 300 } });
  if (!response.ok) return `Could not read ${url} (${response.status}).`;
  const html = await response.text();
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " ").slice(0, 12000);
}
