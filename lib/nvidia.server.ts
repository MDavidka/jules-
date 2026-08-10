import { decryptSecret } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";

/** OpenAI-compatible chat completions endpoint for NVIDIA-hosted models. */
export const NVIDIA_CHAT_COMPLETIONS_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export async function loadNvidiaApiKey() {
  await connectToDatabase();
  const profile = await AppProfile.findById(APP_PROFILE_ID).select("nvidiaApiKeyEncrypted nvidiaApiKeyIv nvidiaApiKeyAuthTag").lean();
  if (!profile?.nvidiaApiKeyEncrypted || !profile.nvidiaApiKeyIv || !profile.nvidiaApiKeyAuthTag) return null;
  return decryptSecret({ ciphertext: profile.nvidiaApiKeyEncrypted, iv: profile.nvidiaApiKeyIv, authTag: profile.nvidiaApiKeyAuthTag });
}
