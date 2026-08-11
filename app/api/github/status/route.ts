import { NextResponse } from "next/server";

import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/github/status
 * Returns whether a GitHub access token is currently stored.
 */
export async function GET() {
  try {
    await connectToDatabase();
    const profile = await AppProfile.findById(APP_PROFILE_ID)
      .select("githubAccessTokenEncrypted")
      .lean();

    const connected = Boolean(profile?.githubAccessTokenEncrypted);
    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
