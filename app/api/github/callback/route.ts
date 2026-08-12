import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/callback
 * Exchanges the OAuth code for an access token and stores it encrypted in MongoDB.
 * Validates the `state` parameter against the HttpOnly cookie set during /connect
 * to prevent CSRF-based token injection.
 *
 * NOTE: The stored access token has no recorded expiration and no refresh flow.
 * GitHub OAuth tokens for non-expiring apps do not expire unless revoked. If the
 * app is configured with token expiration, a refresh mechanism should be added.
 * For now, revocation is surfaced as an error state via /api/github/status.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
  }

  // Validate state against the cookie to prevent CSRF
  const cookieStore = await cookies();
  const storedState = cookieStore.get("github_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_APP_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };

    if (!tokenData.access_token || tokenData.error) {
      return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
    }

    // Encrypt the token and store it
    const encrypted = encryptSecret(tokenData.access_token);

    await connectToDatabase();
    await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      {
        $set: {
          githubAccessTokenEncrypted: encrypted.ciphertext,
          githubAccessTokenIv: encrypted.iv,
          githubAccessTokenAuthTag: encrypted.authTag,
        },
      },
      { upsert: true },
    );

    // Clear the state cookie after successful use
    const response = NextResponse.redirect(new URL("/?github=connected", process.env.APP_URL || "http://localhost:3000"));
    response.cookies.set("github_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/github/callback",
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
  }
}
