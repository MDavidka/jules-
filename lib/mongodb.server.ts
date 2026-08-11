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
  nvidiaApiKeyEncrypted?: string | null;
  nvidiaApiKeyIv?: string | null;
  nvidiaApiKeyAuthTag?: string | null;
  githubAccessTokenEncrypted?: string | null;
  githubAccessTokenIv?: string | null;
  githubAccessTokenAuthTag?: string | null;
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
    nvidiaApiKeyEncrypted: { type: String, default: null },
    nvidiaApiKeyIv: { type: String, default: null },
    nvidiaApiKeyAuthTag: { type: String, default: null },
    githubAccessTokenEncrypted: { type: String, default: null },
    githubAccessTokenIv: { type: String, default: null },
    githubAccessTokenAuthTag: { type: String, default: null },
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
  /** Short board label. Falls back to a content excerpt when absent. */
  title?: string | null;
  /**
   * Board card category, used for the icon and accent on the memory board.
   * `note` is plain text; the others render structured `data`.
   */
  kind?: "note" | "stack" | "connection" | "code" | "config";
  /**
   * Free-form structured payload the assistant can write, e.g.
   * `{ framework: "next", startScript: "pnpm dev" }` or
   * `{ platform: "github", repo: "owner/name" }`.
   */
  data?: Record<string, unknown> | null;
  /** Ids of other memory notes this card links to on the board. */
  connections?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const MemoryNoteSchema = new Schema<MemoryNoteDoc>(
  {
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    source: { type: String, default: null },
    pinned: { type: Boolean, default: true },
    title: { type: String, default: null, trim: true, maxlength: 120 },
    kind: {
      type: String,
      enum: ["note", "stack", "connection", "code", "config"],
      default: "note",
    },
    // `Mixed` keeps the assistant free to store any JSON shape it needs.
    data: { type: Schema.Types.Mixed, default: null },
    connections: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

MemoryNoteSchema.index({ createdAt: -1 });

export const MemoryNote: Model<MemoryNoteDoc> =
  (mongoose.models.MemoryNote as Model<MemoryNoteDoc>) ??
  mongoose.model<MemoryNoteDoc>("MemoryNote", MemoryNoteSchema);

/** Wire shape for a memory note, shared by every memory route. */
export interface SerializedMemoryNote {
  id: string;
  content: string;
  source: string | null;
  pinned: boolean;
  title: string | null;
  kind: NonNullable<MemoryNoteDoc["kind"]>;
  data: Record<string, unknown> | null;
  connections: string[];
  createdAt: string | null;
}

export function serializeMemoryNote(
  note: Pick<
    MemoryNoteDoc,
    "_id" | "content" | "source" | "pinned" | "title" | "kind" | "data" | "connections" | "createdAt"
  >,
): SerializedMemoryNote {
  return {
    id: String(note._id),
    content: note.content,
    source: note.source ?? null,
    pinned: note.pinned,
    title: note.title ?? null,
    kind: note.kind ?? "note",
    data: (note.data as Record<string, unknown> | null) ?? null,
    connections: note.connections ?? [],
    createdAt: note.createdAt?.toISOString() ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*                         Conversation history model                         */
/* -------------------------------------------------------------------------- */

/**
 * Stores every user prompt and assistant response for agentic memory.
 * The agent retrieves older messages to maintain conversation continuity
 * and prioritizes shorter, high-signal messages for context injection.
 */
export interface ConversationMessageDoc {
  _id: mongoose.Types.ObjectId;
  role: "user" | "assistant";
  content: string;
  source: string | null;
  summary: string | null;
  tokenEstimate: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMessageSchema = new Schema<ConversationMessageDoc>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    source: { type: String, default: null },
    summary: { type: String, default: null, maxlength: 500 },
    tokenEstimate: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

ConversationMessageSchema.index({ source: 1, createdAt: -1 });

export const ConversationMessage: Model<ConversationMessageDoc> =
  (mongoose.models.ConversationMessage as Model<ConversationMessageDoc>) ??
  mongoose.model<ConversationMessageDoc>("ConversationMessage", ConversationMessageSchema);

/** Wire shape for a conversation message. */
export interface SerializedConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: string | null;
  summary: string | null;
  tokenEstimate: number;
  createdAt: string | null;
}

export function serializeConversationMessage(
  msg: Pick<ConversationMessageDoc, "_id" | "role" | "content" | "source" | "summary" | "tokenEstimate" | "createdAt">,
): SerializedConversationMessage {
  return {
    id: String(msg._id),
    role: msg.role,
    content: msg.content,
    source: msg.source ?? null,
    summary: msg.summary ?? null,
    tokenEstimate: msg.tokenEstimate,
    createdAt: msg.createdAt?.toISOString() ?? null,
  };
}

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
