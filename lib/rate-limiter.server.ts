import "server-only";

/**
 * Simple in-memory token bucket rate limiter for the NVIDIA API.
 * Limits to 20 requests per 60 seconds with automatic retry on 429 responses.
 *
 * LIMITATION: This bucket lives in module-level memory, meaning each serverless
 * function instance (or edge worker) gets its own independent counter. Under
 * horizontal scaling the effective limit becomes 20 x instance_count, making
 * this a best-effort throttle rather than a globally enforced ceiling. For a
 * single-instance deployment (e.g. a long-running Node server or a single
 * Vercel serverless region) this is sufficient. For multi-instance deployments,
 * consider persisting remaining tokens in Redis or MongoDB.
 */

const MAX_TOKENS = 20;
const REFILL_INTERVAL_MS = 60_000; // 60 seconds
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3_000;

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const bucket: TokenBucket = {
  tokens: MAX_TOKENS,
  lastRefill: Date.now(),
};

function refillBucket(): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;

  if (elapsed >= REFILL_INTERVAL_MS) {
    bucket.tokens = MAX_TOKENS;
    bucket.lastRefill = now;
  } else {
    // Partial refill based on elapsed time
    const tokensToAdd = Math.floor((elapsed / REFILL_INTERVAL_MS) * MAX_TOKENS);
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }
}

async function waitForToken(): Promise<void> {
  const waitTime = Math.ceil(REFILL_INTERVAL_MS / MAX_TOKENS);

  // Loop until a token is actually available. Under concurrent requests,
  // another caller may consume the token produced by refill before we can
  // grab it, so we must re-check after each sleep cycle.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    refillBucket();

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return;
    }

    // No token available - wait for the next refill opportunity
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes a rate-limited fetch request. Waits if the token bucket is empty and
 * retries with exponential backoff on 429 responses.
 */
export async function rateLimitedFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  await waitForToken();

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
      await waitForToken();
    }

    const response = await fetch(url, init);

    if (response.status !== 429) {
      return response;
    }

    lastResponse = response;
  }

  // If all retries exhausted, return the last 429 response
  return lastResponse!;
}
