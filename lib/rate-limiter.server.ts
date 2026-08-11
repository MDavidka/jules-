import "server-only";

/**
 * Simple in-memory token bucket rate limiter for the NVIDIA API.
 * Limits to 20 requests per 60 seconds with automatic retry on 429 responses.
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
  refillBucket();

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return;
  }

  // Wait until the next refill cycle gives us at least one token
  const waitTime = Math.ceil(REFILL_INTERVAL_MS / MAX_TOKENS);
  await new Promise((resolve) => setTimeout(resolve, waitTime));
  refillBucket();
  bucket.tokens = Math.max(0, bucket.tokens - 1);
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
