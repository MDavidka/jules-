import { NextResponse } from "next/server";

import {
  handleRouteError,
  jsonError,
  parseJsonBody,
  sessionResourceName,
} from "@/lib/api-response.server";
import { sendMessage } from "@/lib/jules-client.server";
import { sendMessageSchema, sessionResourceNameSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/sessions/[sessionName]/messages
 *
 * Calls Jules `sessions.sendMessage`. Upstream returns an empty body, so the
 * client relies on the activities poll to surface the new message.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionName: string }> },
) {
  try {
    const { sessionName } = await context.params;
    const parsedName = sessionResourceNameSchema.safeParse(sessionResourceName(sessionName));

    if (!parsedName.success) {
      return jsonError("Invalid session name.", 422, { code: "VALIDATION_ERROR" });
    }

    const body = await parseJsonBody(request);
    const parsedBody = sendMessageSchema.safeParse(body);

    if (!parsedBody.success) {
      return jsonError("The message could not be sent.", 422, {
        code: "VALIDATION_ERROR",
        details: parsedBody.error.issues.map((issue) => issue.message),
      });
    }

    await sendMessage(parsedName.data, parsedBody.data.prompt);

    return NextResponse.json(
      { sent: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
