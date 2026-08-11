import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/connect
 * Redirects the user to GitHub OAuth authorize page to connect their account.
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

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo",
  });

  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}
