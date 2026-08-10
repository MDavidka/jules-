import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";
import { listNvidiaModelIds } from "@/lib/nvidia-client.server";
import { isKnownModel, NVIDIA_MODELS, DEFAULT_MODEL_ID } from "@/lib/nvidia-models";
import { selectedModelSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/nvidia/models
 *
 * Returns the curated catalog intersected with the models NVIDIA is actually serving
 * right now, so a retired model is never offered in the picker.
 *
 * The upstream model list is public (no key required), which means the picker still
 * populates before the user has saved a key.
 */
export async function GET() {
  try {
    let liveIds: string[] = [];
    let live = true;

    try {
      liveIds = await listNvidiaModelIds();
    } catch {
      // Never let a transient catalog outage empty the picker: fall back to the
      // full curated list and tell the client the data is unverified.
      live = false;
    }

    const available = new Set(liveIds);
    const items = live
      ? NVIDIA_MODELS.filter((model) => available.has(model.id))
      : NVIDIA_MODELS;

    // If the intersection is somehow empty, the catalog shape changed upstream.
    const resolved = items.length > 0 ? items : NVIDIA_MODELS;

    return NextResponse.json(
      {
        items: resolved,
        defaultModel: resolved.some((model) => model.id === DEFAULT_MODEL_ID)
          ? DEFAULT_MODEL_ID
          : resolved[0]!.id,
        live,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/nvidia/models
 *
 * Persists the user's model choice so it is restored on the next visit.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = selectedModelSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("A model id is required.", 422, { code: "VALIDATION_ERROR" });
    }

    if (!isKnownModel(parsed.data.model)) {
      return jsonError("That model is not in the supported catalog.", 422, {
        code: "UNKNOWN_MODEL",
      });
    }

    await connectToDatabase();
    await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      {
        $set: { nvidiaDefaultModel: parsed.data.model },
        $setOnInsert: { _id: APP_PROFILE_ID },
      },
      { upsert: true },
    ).exec();

    return NextResponse.json(
      { model: parsed.data.model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
