/**
 * Pure streaming helpers for the assistant's memory block. Kept free of any
 * imports so it can be unit-tested in isolation and used from server code.
 */

/** Fence the model uses to hand structured board cards back to the server. */
export const MEMORY_FENCE = "```memory";

export interface MemoryBlockFilter {
  /** Returns the text that is safe to show for this token. */
  push(token: string): string;
  /** Flushes any remaining visible text once the stream ends. */
  flush(): string;
  /** The raw memory block, if the model produced one. */
  memoryBlock(): string | null;
}

/**
 * Splits streamed text into the part the user should see and a trailing memory
 * block. Tokens arrive in arbitrary chunks, so the tail of each chunk is held
 * back in case it is the beginning of the fence.
 */
export function createMemoryBlockFilter(): MemoryBlockFilter {
  // Enough characters to recognise a fence split across chunk boundaries.
  const holdBack = MEMORY_FENCE.length - 1;

  let pending = "";
  let captured: string | null = null;

  return {
    push(token: string): string {
      if (captured !== null) {
        captured += token;
        return "";
      }

      pending += token;
      const fenceIndex = pending.indexOf(MEMORY_FENCE);

      if (fenceIndex !== -1) {
        const visible = pending.slice(0, fenceIndex);
        captured = pending.slice(fenceIndex);
        pending = "";
        return visible;
      }

      if (pending.length <= holdBack) return "";

      const visible = pending.slice(0, pending.length - holdBack);
      pending = pending.slice(pending.length - holdBack);
      return visible;
    },

    flush(): string {
      if (captured !== null) return "";
      const visible = pending;
      pending = "";
      return visible;
    },

    memoryBlock(): string | null {
      return captured;
    },
  };
}
