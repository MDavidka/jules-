import "server-only";

import mongoose, { Schema, type Model } from "mongoose";

import { ConfigurationError } from "@/lib/crypto.server";

/**
 * Mongoose connection + models. Server-only.
 *
 * Uses a global cache so that Next.js hot reloads and serverless invocations
 * reuse a single connection instead of exhausting the pool.
 */

function getMongoUri(): string {
  const uri = process.env.MONGO_URI;

  if (!uri || uri.trim().length === 0) {
    throw new ConfigurationError(
      "MONGO_URI is not set. Add your MongoDB connection string to the environment " +
        "(see .env.example) and restart the server.",
    );
  }

  return uri;
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __julesMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache =
  global.__julesMongooseCache ?? (global.__julesMongooseCache = { conn: null, promise: null });

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = getMongoUri();
    cache.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10_000,
      })
      .catch((error) => {
        // Reset so the next request can retry instead of reusing a failed promise.
        cache.promise = null;
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/* -------------------------------------------------------------------------- */
/*                              App profile model                             */
/* -------------------------------------------------------------------------- */

/**
 * A single local application profile. This app is single-tenant/local-first,
 * so exactly one document exists, pinned to a well-known `_id`.
 */
export const APP_PROFILE_ID = "local-app-profile";

export interface AppProfileDoc {
  _id: string;
  julesApiKeyEncrypted?: string | null;
  julesApiKeyIv?: string | null;
  julesApiKeyAuthTag?: string | null;
  configuredAt?: Date | null;
  lastValidatedAt?: Date | null;
  /** Persisted default automation mode applied to newly created sessions. */
  defaultAutomationMode?: string | null;
  /** Persisted default for requiring explicit plan approval. */
  defaultRequirePlanApproval?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AppProfileSchema = new Schema<AppProfileDoc>(
  {
    _id: { type: String, required: true, default: APP_PROFILE_ID },
    julesApiKeyEncrypted: { type: String, default: null },
    julesApiKeyIv: { type: String, default: null },
    julesApiKeyAuthTag: { type: String, default: null },
    configuredAt: { type: Date, default: null },
    lastValidatedAt: { type: Date, default: null },
    defaultAutomationMode: { type: String, default: "AUTOMATION_MODE_UNSPECIFIED" },
    defaultRequirePlanApproval: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false, _id: false },
);

export const AppProfile: Model<AppProfileDoc> =
  (mongoose.models.AppProfile as Model<AppProfileDoc>) ??
  mongoose.model<AppProfileDoc>("AppProfile", AppProfileSchema);

/* -------------------------------------------------------------------------- */
/*                               Memory model                                 */
/* -------------------------------------------------------------------------- */

/**
 * Persistent "memory" notes. These are a Jules+ feature (not a Jules API
 * resource): saved context snippets the user can opt into appending to a new
 * task prompt.
 */
export interface MemoryNoteDoc {
  _id: mongoose.Types.ObjectId;
  content: string;
  /** Optional source resource name to scope the note to one repository. */
  source?: string | null;
  /** When true the note is appended to new task prompts automatically. */
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MemoryNoteSchema = new Schema<MemoryNoteDoc>(
  {
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    source: { type: String, default: null },
    pinned: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

MemoryNoteSchema.index({ createdAt: -1 });

export const MemoryNote: Model<MemoryNoteDoc> =
  (mongoose.models.MemoryNote as Model<MemoryNoteDoc>) ??
  mongoose.model<MemoryNoteDoc>("MemoryNote", MemoryNoteSchema);

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export async function getAppProfile(): Promise<AppProfileDoc | null> {
  await connectToDatabase();
  return AppProfile.findById(APP_PROFILE_ID).lean<AppProfileDoc>().exec();
}

/** True when a full encrypted credential triple is present. */
export function profileHasKey(profile: AppProfileDoc | null): boolean {
  return Boolean(
    profile?.julesApiKeyEncrypted && profile?.julesApiKeyIv && profile?.julesApiKeyAuthTag,
  );
}
