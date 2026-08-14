import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { approveSshAction } from "@/lib/ssh.server";
import { sshApprovalSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ actionId: string }> },
) {
  try {
    const { actionId } = await context.params;
    if (!actionId || actionId.length > 100) return jsonError("Invalid approval request.", 422, { code: "VALIDATION_ERROR" });
    const parsed = sshApprovalSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonError("Approval decision is invalid.", 422, { code: "VALIDATION_ERROR" });
    const result = await approveSshAction(actionId, parsed.data.approved);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
