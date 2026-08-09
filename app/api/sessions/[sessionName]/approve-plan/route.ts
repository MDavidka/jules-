import { NextResponse } from "next/server";

import { handleRouteError, jsonError, sessionResourceName } from "@/lib/api-response.server";
import { approvePlan } from "@/lib/jules-client.server";
import { sessionResourceNameSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/[sessionName]/approve-plan
 *
 * Calls Jules `sessions.approvePlan`. Upstream takes an empty request body and
 * returns an empty response, so success is signalled by `{ approved: true }`.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionName: string }> },
) {
  try {
    const { sessionName } = await context.params;
    const parsed = sessionResourceNameSchema.safeParse(sessionResourceName(sessionName));

    if (!parsed.success) {
      return jsonError("Invalid session name.", 422, { code: "VALIDATION_ERROR" });
    }

    await approvePlan(parsed.data);

    return NextResponse.json(
      { approved: true, session: parsed.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
