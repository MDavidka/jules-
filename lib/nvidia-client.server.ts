import "server-only";

import { decryptSecret, DecryptionError } from "@/lib/crypto.server";
import {
  AppProfile,
  APP_PROFILE_ID,
  connectToDatabase,
  profileHasNvidiaKey,
} from "@/lib/mongodb.server";
import type { AppProfileDoc } from "@/lib/mongodb.server";

/**
 * Server-only client for the NVIDIA AI Builder inference API
 * (`https://integrate.api.nvidia.com/v1`), which is OpenAI-compatible.
 *
 * Mirrors `jules-client.server.ts`: the decrypted key never leaves this module, is
 * never logged, and upstream error bodies are sanitized before reaching a client.
 */

const DEFAULT_NVIDIA_API_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * The inference endpoint. Overridable via `NVIDIA_API_BASE_URL` so a self-hosted NIM
 * container can be used instead of the hosted build.nvidia.com endpoint (both speak
 * the same OpenAI-compatible API).
 */
export const NVIDIA_API_BASE_URL = (
  process.env.NVIDIA_API_BASE_URL?.trim() || DEFAULT_NVIDIA_API_BASE_URL
).replace(/\/+$/, "");

/** Chat completions can take a while on large reasoning models. */
const CHAT_TIMEOUT_MS = 120_000;
const SHORT_TIMEOUT_MS = 30_000;

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

export class NvidiaNotConfiguredError extends Error {
  constructor(
    message = "No NVIDIA API key is configured. Add one in Settings to chat with a model.",
  ) {
    super(message);
    this.name = "NvidiaNotConfiguredError";
  }
}

export class NvidiaApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NvidiaApiError";
    this.status = status;
  }
}

export { DecryptionError };

/* -------------------------------------------------------------------------- */
/*                              Key management                                */
/* -------------------------------------------------------------------------- */

/** Loads and decrypts the stored NVIDIA key. Returns null when unconfigured. */
async function loadApiKey(): Promise<string | null> {
  await connectToDatabase();
  const profile = await AppProfile.findById(APP_PROFILE_ID).lean<AppProfileDoc>().exec();

  if (!profileHasNvidiaKey(profile)) return null;

  return decryptSecret(
    {
      ciphertext: profile!.nvidiaApiKeyEncrypted!,
      iv: profile!.nvidiaApiKeyIv!,
      authTag: profile!.nvidiaApiKeyAuthTag!,
    },
    "nvidia",
  );
}

export async function isNvidiaConfigured(): Promise<boolean> {
  await connectToDatabase();
  const profile = await AppProfile.findById(APP_PROFILE_ID)
    .select("nvidiaApiKeyEncrypted nvidiaApiKeyIv nvidiaApiKeyAuthTag")
    .lean<AppProfileDoc>()
    .exec();
  return profileHasNvidiaKey(profile);
}

/* -------------------------------------------------------------------------- */
/*                              Error sanitizing                              */
/* -------------------------------------------------------------------------- */

interface OpenAiErrorBody {
  error?: { message?: string; type?: string; code?: string } | string;
  detail?: string | { msg?: string }[];
  message?: string;
  title?: string;
}

/** Maps an upstream failure to a safe, user-facing message. */
async function toSanitizedError(response: Response): Promise<NvidiaApiError> {
  let upstreamMessage: string | null = null;

  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as OpenAiErrorBody;

        if (typeof parsed.error === "string") {
          upstreamMessage = parsed.error;
        } else if (parsed.error?.message) {
          upstreamMessage = parsed.error.message;
        } else if (typeof parsed.detail === "string") {
          upstreamMessage = parsed.detail;
        } else if (Array.isArray(parsed.detail)) {
          upstreamMessage = parsed.detail
            .map((item) => item?.msg)
            .filter(Boolean)
            .join("; ");
        } else if (parsed.message) {
          upstreamMessage = parsed.message;
        } else if (parsed.title) {
          upstreamMessage = parsed.title;
        }
      } catch {
        // Non-JSON body (HTML error page): never forward it verbatim.
        upstreamMessage = null;
      }
    }
  } catch {
    upstreamMessage = null;
  }

  if (upstreamMessage) {
    // Trim pathological upstream messages and strip anything key-shaped.
    upstreamMessage = upstreamMessage.replace(/nvapi-[A-Za-z0-9_-]{6,}/g, "<redacted-key>").trim();
    if (upstreamMessage.length > 400) upstreamMessage = `${upstreamMessage.slice(0, 399)}…`;
    if (upstreamMessage.length === 0) upstreamMessage = null;
  }

  const fallbackByStatus: Record<number, string> = {
    400: "NVIDIA rejected the request as invalid. The selected model may not support tool calling.",
    401: "Your NVIDIA API key was rejected. Create a new key at build.nvidia.com and save it again.",
    403: "NVIDIA denied access to that model. Your key may not be entitled to it.",
    404: "That NVIDIA model was not found. Pick a different model.",
    422: "NVIDIA could not process the request payload.",
    429: "NVIDIA rate limit reached. Wait a moment and try again.",
    500: "NVIDIA had an internal error. Try again shortly.",
    503: "The NVIDIA endpoint is temporarily unavailable. Try again shortly.",
  };

  const message =
    upstreamMessage ??
    fallbackByStatus[response.status] ??
    `NVIDIA request failed with status ${response.status}.`;

  return new NvidiaApiError(message, response.status);
}

/* -------------------------------------------------------------------------- */
/*                                 Transport                                  */
/* -------------------------------------------------------------------------- */

interface NvidiaRequestOptions {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Explicit key, used by the validation flow before anything is persisted. */
  apiKey?: string;
  /** When false the request proceeds unauthenticated (the model list is public). */
  requireKey?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function nvidiaRequest<T>({
  method = "GET",
  path,
  body,
  apiKey,
  requireKey = true,
  timeoutMs = SHORT_TIMEOUT_MS,
  signal,
}: NvidiaRequestOptions): Promise<T> {
  const key = apiKey ?? (await loadApiKey());

  if (!key && requireKey) throw new NvidiaNotConfiguredError();

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signals: AbortSignal[] = [timeoutController.signal];
  if (signal) signals.push(signal);

  let response: Response;
  try {
    response = await fetch(`${NVIDIA_API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      throw new NvidiaApiError(
        "The NVIDIA API did not respond in time. Try a smaller model or ask again.",
        504,
      );
    }
    if (signal?.aborted) throw error; // Genuine client cancellation.

    throw new NvidiaApiError("Could not reach the NVIDIA API. Check your network connection.", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw await toSanitizedError(response);

  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NvidiaApiError("NVIDIA returned a malformed response.", 502);
  }
}

/* -------------------------------------------------------------------------- */
/*                        OpenAI-compatible chat types                        */
/* -------------------------------------------------------------------------- */

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

/**
 * Transcript messages, i.e. everything except the system prompt. The system prompt is
 * always rebuilt server-side and prepended at request time, so it never appears in the
 * history the client stores and posts back.
 */
export type ChatTranscriptMessage = Exclude<ChatMessage, { role: "system" }>;

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: ChatToolCall[];
      /** Some NVIDIA-hosted reasoning models return a separate thinking channel. */
      reasoning_content?: string | null;
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls: ChatToolCall[];
  finishReason: string | null;
}

/* -------------------------------------------------------------------------- */
/*                              Public operations                             */
/* -------------------------------------------------------------------------- */

interface NvidiaModelListResponse {
  data?: { id?: string; owned_by?: string }[];
}

/**
 * Validates a candidate key with a minimal authenticated chat request.
 *
 * `GET /v1/models` is public on this endpoint, so it cannot tell a good key from a
 * bad one - only an inference call actually exercises the credential.
 */
export async function validateNvidiaApiKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  try {
    await nvidiaRequest<ChatCompletionResponse>({
      method: "POST",
      path: "/chat/completions",
      apiKey,
      body: {
        model: "nvidia/nvidia-nemotron-nano-9b-v2",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      },
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof NvidiaApiError) {
      // A 404/403 on the probe model still proves the key itself was accepted.
      if (error.status === 404) return { ok: true };
      return { ok: false, message: error.message, status: error.status };
    }
    return {
      ok: false,
      message: "Could not validate the key against the NVIDIA API. Try again.",
      status: 502,
    };
  }
}

/** Lists model ids currently served by the endpoint. Works without a key. */
export async function listNvidiaModelIds(signal?: AbortSignal): Promise<string[]> {
  const result = await nvidiaRequest<NvidiaModelListResponse>({
    path: "/models",
    requireKey: false,
    signal,
  });

  return (result.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function chatCompletion({
  model,
  messages,
  tools,
  temperature = 0.2,
  maxTokens = 2048,
  signal,
}: ChatCompletionParams): Promise<ChatCompletionResult> {
  const result = await nvidiaRequest<ChatCompletionResponse>({
    method: "POST",
    path: "/chat/completions",
    timeoutMs: CHAT_TIMEOUT_MS,
    signal,
    body: {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    },
  });

  const choice = result.choices?.[0];
  const message = choice?.message;

  return {
    content: message?.content ?? null,
    toolCalls: Array.isArray(message?.tool_calls) ? message!.tool_calls! : [],
    finishReason: choice?.finish_reason ?? null,
  };
}
