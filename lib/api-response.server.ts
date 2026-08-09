import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ConfigurationError, DecryptionError } from "@/lib/crypto.server";
import { JulesApiError, NotConfiguredError } from "@/lib/jules-client.server";
import { formatZodError } from "@/lib/validators";
import type { ApiErrorBody } from "@/types/jules";

/**
 * Uniform error mapping for every route handler.
 *
 * Guarantees that nothing sensitive (API keys, auth headers, connection
 * strings, stack traces) is ever included in a response body.
 */

export function jsonError(
  message: string,
  status: number,
  extra?: Omit<ApiErrorBody, "error">,
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>({ error: message, ...extra }, { status });
}

export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  // 1. Request body / query validation failures.
  if (error instanceof ZodError) {
    return jsonError("The request was invalid.", 422, {
      code: "VALIDATION_ERROR",
      details: formatZodError(error),
    });
  }

  // 2. Missing environment configuration - surfaced clearly for the developer.
  if (error instanceof ConfigurationError) {
    return jsonError(error.message, 500, { code: "CONFIGURATION_ERROR" });
  }

  // 3. Stored key exists but cannot be decrypted (rotated secret).
  if (error instanceof DecryptionError) {
    return jsonError(error.message, 500, { code: "DECRYPTION_ERROR" });
  }

  // 4. No key configured yet -> the client shows the setup gate.
  if (error instanceof NotConfiguredError) {
    return jsonError(error.message, 428, { code: "NOT_CONFIGURED" });
  }

  // 5. Sanitized upstream Jules failures.
  if (error instanceof JulesApiError) {
    // Normalize upstream 5xx to 502 so the client can distinguish "our bug"
    // from "Jules is unhappy".
    const status = error.status >= 500 ? 502 : error.status;
    return jsonError(error.message, status, {
      code: error.upstreamStatus ?? "JULES_API_ERROR",
    });
  }

  // 6. MongoDB connectivity problems get an actionable, non-leaking message.
  if (isMongoConnectionError(error)) {
    return jsonError(
      "Could not connect to MongoDB. Verify MONGO_URI is correct and the database is reachable.",
      503,
      { code: "DATABASE_UNAVAILABLE" },
    );
  }

  // 7. Anything else: log server-side only, return an opaque message.
  console.error("[jules+] Unhandled route error:", sanitizeForLog(error));
  return jsonError("An unexpected server error occurred.", 500, { code: "INTERNAL_ERROR" });
}

function isMongoConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "MongooseServerSelectionError" ||
    error.name === "MongoServerSelectionError" ||
    error.name === "MongoNetworkError" ||
    /ECONNREFUSED|ENOTFOUND|failed to connect/i.test(error.message)
  );
}

/**
 * Strips anything that could contain credentials before logging.
 * Never pass request headers or decrypted values through here.
 */
function sanitizeForLog(error: unknown): string {
  if (!(error instanceof Error)) return "non-error value thrown";

  const redacted = error.message
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, "mongodb://<redacted>")
    .replace(/(X-Goog-Api-Key\s*[:=]\s*)\S+/gi, "$1<redacted>")
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, "<redacted-key>");

  return `${error.name}: ${redacted}`;
}

/** Parses `URLSearchParams` into a plain object for Zod. */
export function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (value !== "") result[key] = value;
  }
  return result;
}

/** Safely parses a JSON request body, throwing a clean 400 on malformed input. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new JulesApiError("Request body must be valid JSON.", 400);
  }
}

/**
 * Rebuilds a Jules resource name from a Next.js catch-all segment array.
 * e.g. ["github","owner","repo"] + "sources" -> "sources/github/owner/repo"
 *
 * Only used for SOURCES, whose names contain nested slashes. Next.js allows a
 * catch-all segment only as the final part of a route, so this pattern cannot
 * be used for sessions (which need `/activities`, `/messages`, etc. beneath).
 */
export function resourceNameFromSegments(prefix: string, segments: string[] | undefined): string {
  const decoded = (segments ?? []).map((segment) => decodeURIComponent(segment));
  return [prefix, ...decoded].join("/");
}

/**
 * Builds a `sessions/{session}` resource name from a single dynamic segment.
 * Jules session names never contain slashes, so one segment is sufficient.
 */
export function sessionResourceName(segment: string): string {
  return `sessions/${decodeURIComponent(segment)}`;
}
