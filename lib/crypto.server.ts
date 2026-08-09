import "server-only";

import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for the API keys this app stores (Jules and NVIDIA).
 *
 * The symmetric key is derived from `JULES_KEY_ENCRYPTION_SECRET` using HKDF
 * (SHA-256) so that the raw env secret is never used directly as a cipher key.
 * A fresh random 12-byte IV is generated for every write, and the GCM auth tag
 * is stored separately so tampering is detected on decrypt.
 *
 * Each credential gets its own HKDF `info` string, so the Jules key and the NVIDIA
 * key are encrypted under *different* derived keys even though they share one env
 * secret. A ciphertext therefore cannot be moved from one field to the other.
 *
 * This module is server-only. Decrypted values are never logged.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 12; // GCM standard nonce length

/**
 * HKDF `info` per credential. The `jules` value is frozen: changing it would make
 * every already-stored Jules key undecryptable.
 */
const HKDF_INFO: Record<SecretPurpose, string> = {
  jules: "jules-plus:jules-api-key:v1",
  nvidia: "jules-plus:nvidia-api-key:v1",
};

/** Which credential a ciphertext belongs to. */
export type SecretPurpose = "jules" | "nvidia";

const PURPOSE_LABELS: Record<SecretPurpose, string> = {
  jules: "Jules API key",
  nvidia: "NVIDIA API key",
};

/**
 * Static salt is acceptable here: HKDF's security relies on the secret's
 * entropy, and a fixed salt keeps key derivation deterministic across restarts.
 */
const HKDF_SALT = "jules-plus:hkdf-salt:v1";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

/** Reads and validates the encryption secret without ever returning its value. */
function getEncryptionSecret(): string {
  const secret = process.env.JULES_KEY_ENCRYPTION_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new ConfigurationError(
      "JULES_KEY_ENCRYPTION_SECRET is not set. Generate a 32-byte secret with " +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
        "and add it to your environment before storing a Jules API key.",
    );
  }

  // Require meaningful entropy. 32 chars is the practical floor for a
  // base64/hex encoded 32-byte value.
  if (secret.length < 32) {
    throw new ConfigurationError(
      "JULES_KEY_ENCRYPTION_SECRET is too short. It must represent at least 32 bytes of high-entropy data.",
    );
  }

  return secret;
}

const cachedKeys = new Map<SecretPurpose, Buffer>();

function deriveKey(purpose: SecretPurpose): Buffer {
  const cached = cachedKeys.get(purpose);
  if (cached) return cached;

  const secret = getEncryptionSecret();

  // Accept base64 or hex encoded secrets as raw bytes; fall back to utf-8.
  let ikm: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    ikm = Buffer.from(secret, "hex");
  } else if (/^[A-Za-z0-9+/]{43,}={0,2}$/.test(secret)) {
    const decoded = Buffer.from(secret, "base64");
    ikm = decoded.length >= KEY_LENGTH ? decoded : Buffer.from(secret, "utf8");
  } else {
    ikm = Buffer.from(secret, "utf8");
  }

  const derived = crypto.hkdfSync(
    "sha256",
    ikm,
    Buffer.from(HKDF_SALT, "utf8"),
    Buffer.from(HKDF_INFO[purpose], "utf8"),
    KEY_LENGTH,
  );

  const key = Buffer.from(derived);
  cachedKeys.set(purpose, key);
  return key;
}

export interface EncryptedPayload {
  /** base64 ciphertext */
  ciphertext: string;
  /** base64 initialization vector */
  iv: string;
  /** base64 GCM authentication tag */
  authTag: string;
}

/**
 * Encrypts a plaintext secret. Throws ConfigurationError if env is missing.
 * `purpose` defaults to `"jules"` so existing call sites keep their exact behaviour.
 */
export function encryptSecret(
  plaintext: string,
  purpose: SecretPurpose = "jules",
): EncryptedPayload {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Cannot encrypt an empty value.");
  }

  const key = deriveKey(purpose);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypts a previously encrypted secret.
 * Never log the return value of this function.
 */
export function decryptSecret(
  payload: EncryptedPayload,
  purpose: SecretPurpose = "jules",
): string {
  const key = deriveKey(purpose);

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    // Deliberately swallow the underlying error: it can leak key material
    // details. Most common cause is a rotated JULES_KEY_ENCRYPTION_SECRET.
    throw new DecryptionError(
      `Stored ${PURPOSE_LABELS[purpose]} could not be decrypted. This usually means ` +
        "JULES_KEY_ENCRYPTION_SECRET changed. Delete and re-add the key in Settings.",
    );
  }
}

/** Redacts a secret for safe display, e.g. `AIza••••••4f2b`. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••••${secret.slice(-4)}`;
}
