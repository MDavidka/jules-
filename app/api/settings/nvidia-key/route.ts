import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { encryptSecret } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";
import { julesApiKeySchema } from "@/lib/validators";
import { NVIDIA_MODELS } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = julesApiKeySchema.safeParse(body);
    if (!parsed.success) return jsonError("The NVIDIA API key is invalid.", 422, { code: "VALIDATION_ERROR" });
    const encrypted = encryptSecret(parsed.data.apiKey);
    await connectToDatabase();
    await AppProfile.findByIdAndUpdate(APP_PROFILE_ID, {
      $set: {
        nvidiaApiKeyEncrypted: encrypted.ciphertext,
        nvidiaApiKeyIv: encrypted.iv,
        nvidiaApiKeyAuthTag: encrypted.authTag,
      },
      $setOnInsert: { _id: APP_PROFILE_ID },
    }, { upsert: true }).exec();
    return NextResponse.json({ configured: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE() {
  try {
    await connectToDatabase();
    await AppProfile.findByIdAndUpdate(APP_PROFILE_ID, { $set: {
      nvidiaApiKeyEncrypted: null,
      nvidiaApiKeyIv: null,
      nvidiaApiKeyAuthTag: null,
    }}).exec();
    return NextResponse.json({ configured: false });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET() {
  try {
    await connectToDatabase();
    const profile = await AppProfile.findById(APP_PROFILE_ID).select("nvidiaApiKeyEncrypted nvidiaApiKeyIv nvidiaApiKeyAuthTag").lean();
    return NextResponse.json({ configured: Boolean(profile?.nvidiaApiKeyEncrypted && profile?.nvidiaApiKeyIv && profile?.nvidiaApiKeyAuthTag) });
  } catch (error) {
    return handleRouteError(error);
  }
}


