import { z } from "zod";

const repoPattern = /(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;
const allowedFiles = ["README.md", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "src/index.ts", "src/index.tsx", "app/page.tsx"];

export function parseGitHubRepo(value: string) {
  const match = repoPattern.exec(value.trim().replace(/\.git$/, ""));
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function fetchGitHubRepositoryContext(value: string) {
  const parsed = parseGitHubRepo(value);
  if (!parsed) return "No valid public GitHub repository was provided.";
  const base = `https://raw.githubusercontent.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/HEAD`;
  const files = await Promise.all(allowedFiles.map(async (file) => {
    const response = await fetch(`${base}/${file}`, { next: { revalidate: 300 } });
    if (!response.ok) return null;
    const content = (await response.text()).slice(0, 12000);
    return `--- ${file} ---\n${content}`;
  }));
  return [`Repository: ${parsed.owner}/${parsed.repo}`, ...files.filter(Boolean)].join("\n\n");
}
