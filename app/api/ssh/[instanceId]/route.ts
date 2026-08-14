import { NextResponse } from "next/server";

import { handleRouteError, jsonError } from "@/lib/api-response.server";
import { deleteSshInstance } from "@/lib/ssh.server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  try {
    const { instanceId } = await context.params;
    if (!instanceId || instanceId.length > 100) return jsonError("Invalid SSH instance.", 422, { code: "VALIDATION_ERROR" });
    await deleteSshInstance(instanceId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
