import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { createSshInstance, listPendingSshActions, listSshInstances } from "@/lib/ssh.server";
import { sshInstanceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [instances, approvals] = await Promise.all([listSshInstances(), listPendingSshActions()]);
    return NextResponse.json({ instances, approvals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = sshInstanceSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonError("The SSH instance details are invalid.", 422, { code: "VALIDATION_ERROR" });
    const instance = await createSshInstance(parsed.data);
    return NextResponse.json({ instance }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
