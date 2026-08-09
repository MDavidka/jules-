import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/api-response.server";
import { getAppProfile, profileHasNvidiaKey } from "@/lib/mongodb.server";
import { DEFAULT_MODEL_ID, resolveModelId } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/nvidia-key/test
 *
 * Reports whether an NVIDIA API key is configured, plus the last model the user
 * selected. Never reveals the stored key, not even a masked form of it.
 */
export async function GET() {
  try {
    const profile = await getAppProfile();
    const configured = profileHasNvidiaKey(profile);

    return NextResponse.json(
      {
        configured,
        configuredAt: configured ? (profile?.nvidiaConfiguredAt ?? null) : null,
        lastValidatedAt: configured ? (profile?.nvidiaLastValidatedAt ?? null) : null,
        // Fall back to the default when the saved model has since been retired.
        defaultModel: profile?.nvidiaDefaultModel
          ? resolveModelId(profile.nvidiaDefaultModel)
          : DEFAULT_MODEL_ID,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
