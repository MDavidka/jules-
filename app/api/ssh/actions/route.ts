import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { createSshAction } from "@/lib/ssh.server";
import { sshActionSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const parsed = sshActionSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return jsonError("The SSH action is invalid.", 422, { code: "VALIDATION_ERROR" });
    const input = parsed.data;
    if (input.kind === "command" && !input.command?.trim()) return jsonError("A command is required.", 422, { code: "VALIDATION_ERROR" });
    if (input.kind === "write_file" && (!input.path?.startsWith("/") || input.content === undefined)) {
      return jsonError("An absolute path and file content are required.", 422, { code: "VALIDATION_ERROR" });
    }
    const result = await createSshAction(input);
    return NextResponse.json(result, { status: result.status === "pending" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
