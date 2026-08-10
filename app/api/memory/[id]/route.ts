import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { connectToDatabase, MemoryNote, serializeMemoryNote } from "@/lib/mongodb.server";
import { updateMemorySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** PATCH /api/memory/[id] - updates the pin flag and/or the board payload. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return jsonError("Invalid memory id.", 422, { code: "VALIDATION_ERROR" });
    }

    const parsed = updateMemorySchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      return jsonError("The memory update is invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    await connectToDatabase();
    const updated = await MemoryNote.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true },
    ).lean().exec();

    if (!updated) return jsonError("That memory entry no longer exists.", 404);

    return NextResponse.json(serializeMemoryNote(updated), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/memory/[id] */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return jsonError("Invalid memory id.", 422, { code: "VALIDATION_ERROR" });
    }

    await connectToDatabase();
    const deleted = await MemoryNote.findByIdAndDelete(id).exec();

    if (!deleted) return jsonError("That memory entry no longer exists.", 404);

    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
