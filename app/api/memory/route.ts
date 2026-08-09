import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { connectToDatabase, MemoryNote } from "@/lib/mongodb.server";
import { createMemorySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * Memory is a Jules+ feature stored in MongoDB, not a Jules API resource.
 * Pinned notes can be attached to a new task prompt from the composer.
 */

export async function GET() {
  try {
    await connectToDatabase();

    const notes = await MemoryNote.find({}).sort({ createdAt: -1 }).limit(200).lean().exec();

    return NextResponse.json(
      {
        items: notes.map((note) => ({
          id: String(note._id),
          content: note.content,
          source: note.source ?? null,
          pinned: note.pinned,
          createdAt: note.createdAt?.toISOString() ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = createMemorySchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("The memory entry is invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    await connectToDatabase();

    const created = await MemoryNote.create({
      content: parsed.data.content,
      source: parsed.data.source ?? null,
      pinned: parsed.data.pinned,
    });

    return NextResponse.json(
      {
        id: String(created._id),
        content: created.content,
        source: created.source ?? null,
        pinned: created.pinned,
        createdAt: created.createdAt?.toISOString() ?? null,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
