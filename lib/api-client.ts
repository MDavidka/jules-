import type { ApiErrorBody } from "@/types/jules";

/**
 * Thin typed wrapper around `fetch` for our own route handlers.
 * Never used to talk to Jules directly - the browser has no API key.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the server reports that no Jules API key is configured. */
  get isNotConfigured(): boolean {
    return this.status === 428 || this.code === "NOT_CONFIGURED";
  }

  /** True for missing env vars / undecryptable key - needs developer action. */
  get isConfigurationProblem(): boolean {
    return this.code === "CONFIGURATION_ERROR" || this.code === "DECRYPTION_ERROR";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(
      body.error || `Request failed with status ${response.status}.`,
      response.status,
      body.code,
      body.details,
    );
  }

  return payload as T;
}

/** Query keys, centralized so invalidation stays consistent. */
export const queryKeys = {
  config: ["jules", "config"] as const,
  sources: ["jules", "sources"] as const,
  source: (name: string) => ["jules", "source", name] as const,
  sessions: (source?: string | null) => ["jules", "sessions", source ?? "all"] as const,
  session: (name: string) => ["jules", "session", name] as const,
  activities: (name: string) => ["jules", "activities", name] as const,
  memory: ["jules", "memory"] as const,
  preferences: ["jules", "preferences"] as const,
};

/** Builds `/api/sources/...` and `/api/sessions/...` paths from a resource name. */
export function resourcePath(base: "sources" | "sessions", resourceName: string): string {
  const stripped = resourceName.replace(new RegExp(`^${base}/`), "");
  const encoded = stripped
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/${base}/${encoded}`;
}
