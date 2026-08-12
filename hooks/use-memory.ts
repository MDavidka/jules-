"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, queryKeys } from "@/lib/api-client";
import type { CreateMemoryInput, MemoryKind } from "@/lib/validators";

export interface MemoryNote {
  id: string;
  content: string;
  source: string | null;
  pinned: boolean;
  /** Short board label; falls back to a content excerpt when null. */
  title: string | null;
  kind: MemoryKind;
  /** Structured payload the assistant can write, rendered on the board. */
  data: Record<string, unknown> | null;
  /** Ids of other notes this card is linked to. */
  connections: string[];
  createdAt: string | null;
}

/**
 * Memory is a Jules DeepDive feature persisted in MongoDB (Jules exposes no memory
 * resource). Pinned notes can be attached to a new task prompt.
 */
export function useMemory() {
  return useQuery<{ items: MemoryNote[] }>({
    queryKey: queryKeys.memory,
    queryFn: ({ signal }) => fetchJson<{ items: MemoryNote[] }>("/api/memory", { signal }),
    staleTime: 15_000,
  });
}

export function useCreateMemory() {
  const queryClient = useQueryClient();

  return useMutation<MemoryNote, Error, CreateMemoryInput>({
    mutationFn: (input) =>
      fetchJson<MemoryNote>("/api/memory", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.memory }),
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: true }, Error, string>({
    mutationFn: (id) => fetchJson<{ deleted: true }>(`/api/memory/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.memory }),
  });
}

export function useToggleMemoryPin() {
  const queryClient = useQueryClient();

  return useMutation<MemoryNote, Error, { id: string; pinned: boolean }>({
    mutationFn: ({ id, pinned }) =>
      fetchJson<MemoryNote>(`/api/memory/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.memory }),
  });
}
