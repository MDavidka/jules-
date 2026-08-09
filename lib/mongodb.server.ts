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
  /**
   * NVIDIA AI Builder credential, stored exactly like the Jules key: AES-256-GCM
   * ciphertext + IV + auth tag, encrypted under its own HKDF-derived key.
   */
  nvidiaApiKeyEncrypted?: string | null;
  nvidiaApiKeyIv?: string | null;
  nvidiaApiKeyAuthTag?: string | null;
  nvidiaConfiguredAt?: Date | null;
  nvidiaLastValidatedAt?: Date | null;
  /** Last model the user picked in the composer, restored on next visit. */
  nvidiaDefaultModel?: string | null;
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
    nvidiaApiKeyEncrypted: { type: String, default: null },
    nvidiaApiKeyIv: { type: String, default: null },
    nvidiaApiKeyAuthTag: { type: String, default: null },
    nvidiaConfiguredAt: { type: Date, default: null },
    nvidiaLastValidatedAt: { type: Date, default: null },
    nvidiaDefaultModel: { type: String, default: null },
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
/*                               Project model                                */
/* -------------------------------------------------------------------------- */

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A Jules session the agent started, tracked against its project. */
export interface ProjectSessionRef {
  /** Jules resource name, e.g. `sessions/abc123`. */
  name: string;
  title?: string | null;
  startedAt: Date;
  /** Set when the agent stopped tracking this run. */
  stoppedAt?: Date | null;
}

/** A structured fact the agent learned about the project from the user. */
export interface ProjectFact {
  label: string;
  value: string;
  recordedAt: Date;
}

/**
 * A "project" is a Jules+ concept: the working context the NVIDIA agent builds up
 * about one repository. Only `active` projects surface in the Projects tab.
 */
export interface ProjectDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  /** Jules source resource name, e.g. `sources/github/owner/repo`. */
  source: string;
  /** Human-readable `owner/repo`, denormalized so the list renders without Jules. */
  sourceFullName?: string | null;
  branch?: string | null;
  status: ProjectStatus;
  /** Rolling summary the agent maintains of what the user wants. */
  summary?: string | null;
  facts: ProjectFact[];
  sessions: ProjectSessionRef[];
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectFactSchema = new Schema<ProjectFact>(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    value: { type: String, required: true, trim: true, maxlength: 2000 },
    recordedAt: { type: Date, default: () => new Date() },
  },
  { _id: false, versionKey: false },
);

const ProjectSessionRefSchema = new Schema<ProjectSessionRef>(
  {
    name: { type: String, required: true, trim: true },
    title: { type: String, default: null },
    startedAt: { type: Date, default: () => new Date() },
    stoppedAt: { type: Date, default: null },
  },
  { _id: false, versionKey: false },
);

const ProjectSchema = new Schema<ProjectDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    source: { type: String, required: true, trim: true },
    sourceFullName: { type: String, default: null },
    branch: { type: String, default: null },
    status: { type: String, enum: PROJECT_STATUSES, default: "active" },
    summary: { type: String, default: null, maxlength: 4000 },
    facts: { type: [ProjectFactSchema], default: [] },
    sessions: { type: [ProjectSessionRefSchema], default: [] },
    lastActivityAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

// The agent upserts by source, and the tab lists active projects newest-first.
ProjectSchema.index({ source: 1 }, { unique: true });
ProjectSchema.index({ status: 1, lastActivityAt: -1 });

export const Project: Model<ProjectDoc> =
  (mongoose.models.Project as Model<ProjectDoc>) ??
  mongoose.model<ProjectDoc>("Project", ProjectSchema);

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

/** True when a full encrypted NVIDIA credential triple is present. */
export function profileHasNvidiaKey(profile: AppProfileDoc | null): boolean {
  return Boolean(
    profile?.nvidiaApiKeyEncrypted && profile?.nvidiaApiKeyIv && profile?.nvidiaApiKeyAuthTag,
  );
}
