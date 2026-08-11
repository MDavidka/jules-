import { handleRouteError, jsonError } from "@/lib/api-response.server";
import {
  connectToDatabase,
  ConversationMessage,
  serializeConversationMessage,
} from "@/lib/mongodb.server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/conversations?source=<source>&limit=<n>
 * List recent conversation messages for a source, limit 50.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const source = url.searchParams.get("source") || null;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 50);

    await connectToDatabase();

    const messages = await ConversationMessage.find(
      source ? { source } : { source: null },
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<Array<import("@/lib/mongodb.server").ConversationMessageDoc>>()
      .exec();

    return NextResponse.json({
      messages: messages.map(serializeConversationMessage),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/conversations
 * Save a new conversation message.
 * Body: { role, content, source?, summary? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      role?: unknown;
      content?: unknown;
      source?: unknown;
      summary?: unknown;
    };

    const role = body.role;
    if (role !== "user" && role !== "assistant") {
      return jsonError("role must be 'user' or 'assistant'.", 422, { code: "VALIDATION_ERROR" });
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return jsonError("content is required.", 422, { code: "VALIDATION_ERROR" });
    }

    const source = typeof body.source === "string" ? body.source : null;
    const summary = typeof body.summary === "string" ? body.summary.slice(0, 500) : null;
    const tokenEstimate = Math.ceil(content.length / 4);

    await connectToDatabase();

    const doc = await ConversationMessage.create({
      role,
      content: content.slice(0, 20000),
      source,
      summary,
      tokenEstimate,
    });

    return NextResponse.json(serializeConversationMessage(doc), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
