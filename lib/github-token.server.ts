import "server-only";

import { decryptSecret } from "@/lib/crypto.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase } from "@/lib/mongodb.server";
import type { AppProfileDoc } from "@/lib/mongodb.server";

/**
 * Loads the connected GitHub token only on the server. The token is decrypted
 * for the duration of the request and is never returned to a browser or logged.
 */
export async function loadConnectedGitHubToken(): Promise<string | null> {
  await connectToDatabase();
  const profile = await AppProfile.findById(APP_PROFILE_ID)
    .select("githubAccessTokenEncrypted githubAccessTokenIv githubAccessTokenAuthTag")
    .lean<AppProfileDoc>()
    .exec();

  if (
    !profile?.githubAccessTokenEncrypted ||
    !profile.githubAccessTokenIv ||
    !profile.githubAccessTokenAuthTag
  ) {
    return null;
  }

  // Do not swallow database/decryption failures: the MCP bridge must not
  // silently switch from a connected user identity to an unrelated fallback.
  return decryptSecret({
    ciphertext: profile.githubAccessTokenEncrypted,
    iv: profile.githubAccessTokenIv,
    authTag: profile.githubAccessTokenAuthTag,
  });
}
