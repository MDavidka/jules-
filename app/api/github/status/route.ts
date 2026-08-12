import { NextResponse } from "next/server";

import { loadConnectedGitHubToken } from "@/lib/github-token.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/status
 * Returns whether a decryptable GitHub access token is currently stored.
 */
export async function GET() {
  try {
    const token = await loadConnectedGitHubToken();
    return NextResponse.json({ connected: Boolean(token) });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
