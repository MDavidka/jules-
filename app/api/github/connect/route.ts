import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/connect
 * Redirects the user to GitHub OAuth authorize page to connect their account.
 * Generates a cryptographic `state` parameter stored in an HttpOnly cookie to
 * prevent CSRF-based token injection attacks.
 */
export function GET() {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const redirectUri = process.env.GITHUB_APP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "GitHub App not configured. Set GITHUB_APP_CLIENT_ID and GITHUB_APP_REDIRECT_URI in environment." },
      { status: 503 },
    );
  }

  // Generate a cryptographic random state to prevent CSRF attacks.
  const state = randomBytes(32).toString("hex");

  // Scope rationale: `repo` is intentionally used (not just `public_repo` or
  // `read:user`) because the MCP agent needs full repository access to perform
  // its fix workflow: reading private repository code, creating branches,
  // pushing commits, and opening pull requests. This is a deliberate
  // least-privilege-within-use-case choice - we request only the scopes the
  // agent actively uses, but `repo` is the minimum GitHub scope that covers
  // read + write operations on both public and private repositories.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user repo",
    state,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);

  // Store state in an HttpOnly secure cookie so the callback can validate it.
  response.cookies.set("github_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/github/callback",
    maxAge: 600, // 10 minutes - generous window for the OAuth round-trip
  });

  return response;
}
