import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { encryptSecret } from "@/lib/crypto.server";
import { validateApiKey } from "@/lib/jules-client.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";
import { julesApiKeySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * POST /api/settings/jules-key
 *
 * Validates a candidate key against the live Jules API, and only then encrypts
 * and persists it. The submitted key is never logged and never echoed back.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = julesApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("The API key is invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const { apiKey } = parsed.data;

    // Verify the key works BEFORE writing anything to the database.
    const validation = await validateApiKey(apiKey);

    if (!validation.ok) {
      // Nothing is persisted on failure.
      return jsonError(validation.message, validation.status === 401 ? 401 : 400, {
        code: "JULES_KEY_REJECTED",
      });
    }

    const encrypted = encryptSecret(apiKey);
    const now = new Date();

    await connectToDatabase();
    await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      {
        $set: {
          julesApiKeyEncrypted: encrypted.ciphertext,
          julesApiKeyIv: encrypted.iv,
          julesApiKeyAuthTag: encrypted.authTag,
          configuredAt: now,
          lastValidatedAt: now,
        },
        $setOnInsert: { _id: APP_PROFILE_ID },
      },
      { upsert: true, new: true },
    ).exec();

    // Return only sanitized metadata - never the key.
    return NextResponse.json(
      {
        configured: true,
        sourceCount: validation.sourceCount,
        configuredAt: now.toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/settings/jules-key
 *
 * Removes the encrypted credential triple. The client stops all Jules polling
 * and returns to the setup gate once this resolves.
 */
export async function DELETE() {
  try {
    await connectToDatabase();

    await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      {
        $set: {
          julesApiKeyEncrypted: null,
          julesApiKeyIv: null,
          julesApiKeyAuthTag: null,
          configuredAt: null,
          lastValidatedAt: null,
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
