import { NextResponse } from "next/server";

import { loadConnectedGitHubToken } from "@/lib/github-token.server";
import { validateGitHubConnection } from "@/lib/nvidia-tools.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/status
 * Validates the stored GitHub token against GitHub and returns safe account metadata.
 * The token itself is never returned.
 */
export async function GET() {
  try {
    const token = await loadConnectedGitHubToken();
    const status = await validateGitHubConnection(token ?? undefined);
    return NextResponse.json(status, { status: status.connected ? 200 : 401 });
  } catch {
    return NextResponse.json(
      { connected: false, scopes: [], canReadRepositories: false, error: "GitHub connection validation failed." },
      { status: 503 },
    );
  }
}
