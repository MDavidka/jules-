import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { encryptSecret } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";
import { validateNvidiaApiKey } from "@/lib/nvidia-client.server";
import { nvidiaApiKeySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/settings/nvidia-key
 *
 * Validates a candidate NVIDIA AI Builder key against the live inference API, and
 * only then encrypts and persists it. Stored under its own HKDF-derived key, exactly
 * like the Jules credential. The submitted key is never logged and never echoed back.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = nvidiaApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("The API key is invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const { apiKey } = parsed.data;

    // Verify the key works BEFORE writing anything to the database.
    const validation = await validateNvidiaApiKey(apiKey);

    if (!validation.ok) {
      return jsonError(validation.message, validation.status === 401 ? 401 : 400, {
        code: "NVIDIA_KEY_REJECTED",
      });
    }

    const encrypted = encryptSecret(apiKey, "nvidia");
    const now = new Date();

    await connectToDatabase();
    await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      {
        $set: {
          nvidiaApiKeyEncrypted: encrypted.ciphertext,
          nvidiaApiKeyIv: encrypted.iv,
          nvidiaApiKeyAuthTag: encrypted.authTag,
          nvidiaConfiguredAt: now,
          nvidiaLastValidatedAt: now,
        },
        $setOnInsert: { _id: APP_PROFILE_ID },
      },
      { upsert: true, new: true },
    ).exec();

    // Return only sanitized metadata - never the key.
    return NextResponse.json(
      { configured: true, configuredAt: now.toISOString() },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/settings/nvidia-key
 *
 * Removes the encrypted NVIDIA credential. The Jules key is untouched, so the rest
 * of the app keeps working - only the chat agent is disabled.
 */
export async function DELETE() {
  try {
    await connectToDatabase();

    await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      {
        $set: {
          nvidiaApiKeyEncrypted: null,
          nvidiaApiKeyIv: null,
          nvidiaApiKeyAuthTag: null,
          nvidiaConfiguredAt: null,
          nvidiaLastValidatedAt: null,
        },
      },
      { upsert: false },
    ).exec();

    return NextResponse.json(
      { configured: false },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
