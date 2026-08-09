"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson, queryKeys, resourcePath } from "@/lib/api-client";
import type { NormalizedSource, PaginatedResult } from "@/types/jules";

/** Repositories connected to Jules via the Jules GitHub App. */
export function useSources(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  return useQuery<PaginatedResult<NormalizedSource>>({
    queryKey: queryKeys.sources,
    queryFn: ({ signal }) =>
      fetchJson<PaginatedResult<NormalizedSource>>("/api/sources?pageSize=100", { signal }),
    enabled,
    // Repository lists change rarely; refresh on demand instead of polling.
    staleTime: 60_000,
  });
}

/** A single source, including its branch list, for the branch picker. */
export function useSource(sourceName: string | null, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  return useQuery<NormalizedSource>({
    queryKey: queryKeys.source(sourceName ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<NormalizedSource>(resourcePath("sources", sourceName!), { signal }),
    enabled: enabled && Boolean(sourceName),
    staleTime: 60_000,
  });
}
