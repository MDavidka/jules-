import { NextResponse } from "next/server";

import { handleRouteError, jsonError, sessionResourceName } from "@/lib/api-response.server";
import { getSession, normalizeSession } from "@/lib/jules-client.server";
import { sessionResourceNameSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/[sessionName]
 *
 * Retrieves a single session and normalizes it. Polled every 4s by the client
 * while the session is active.
 *
 * A single dynamic segment (not a catch-all) is correct here: Jules session
 * names are always `sessions/{session}` with no nested slashes, and Next.js
 * only permits a catch-all as the final path segment - which would forbid the
 * `/activities`, `/approve-plan` and `/messages` children below it.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionName: string }> },
) {
  try {
    const { sessionName } = await context.params;
    const parsed = sessionResourceNameSchema.safeParse(sessionResourceName(sessionName));

    if (!parsed.success) {
      return jsonError("Invalid session name.", 422, { code: "VALIDATION_ERROR" });
    }

    const session = await getSession(parsed.data, request.signal);

    return NextResponse.json(normalizeSession(session), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
