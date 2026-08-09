import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { connectToDatabase, MemoryNote } from "@/lib/mongodb.server";

export const dynamic = "force-dynamic";

/** PATCH /api/memory/[id] - toggles the pinned flag. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return jsonError("Invalid memory id.", 422, { code: "VALIDATION_ERROR" });
    }

    const body = (await parseJsonBody(request)) as { pinned?: unknown };
    if (typeof body?.pinned !== "boolean") {
      return jsonError("`pinned` must be a boolean.", 422, { code: "VALIDATION_ERROR" });
    }

    await connectToDatabase();
    const updated = await MemoryNote.findByIdAndUpdate(
      id,
      { $set: { pinned: body.pinned } },
      { new: true },
    ).exec();

    if (!updated) return jsonError("That memory entry no longer exists.", 404);

    return NextResponse.json(
      { id: String(updated._id), pinned: updated.pinned },
      { headers: { "Cache-Control": "no-store" } },
    );
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
