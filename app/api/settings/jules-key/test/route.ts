import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/api-response.server";
import { getAppProfile, profileHasKey } from "@/lib/mongodb.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/jules-key/test
 *
 * Reports whether a Jules API key is configured. Never reveals the stored key,
 * not even a masked form of it.
 */
export async function GET() {
  try {
    const profile = await getAppProfile();
    const configured = profileHasKey(profile);

    return NextResponse.json(
      {
        configured,
        configuredAt: configured ? (profile?.configuredAt ?? null) : null,
        lastValidatedAt: configured ? (profile?.lastValidatedAt ?? null) : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
