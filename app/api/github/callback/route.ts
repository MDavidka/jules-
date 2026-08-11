import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/callback
 * Exchanges the OAuth code for an access token and stores it encrypted in MongoDB.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
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

    return NextResponse.redirect(new URL("/?github=connected", process.env.APP_URL || "http://localhost:3000"));
  } catch {
    return NextResponse.redirect(new URL("/?github=error", process.env.APP_URL || "http://localhost:3000"));
  }
}
