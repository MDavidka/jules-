"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, fetchJson } from "@/lib/api-client";
import { DEFAULT_MODEL_ID, type NvidiaModel } from "@/lib/nvidia-models";

/** Query keys for the NVIDIA agent layer. */
export const nvidiaKeys = {
  config: ["nvidia", "config"] as const,
  models: ["nvidia", "models"] as const,
};

export interface NvidiaConfigStatus {
  configured: boolean;
  configuredAt: string | null;
  lastValidatedAt: string | null;
  defaultModel: string;
}

/**
 * Whether the NVIDIA key is configured. Unlike the Jules key this does NOT gate the
 * whole app - it only gates the chat agent.
 */
export function useNvidiaConfig() {
  return useQuery<NvidiaConfigStatus>({
    queryKey: nvidiaKeys.config,
    queryFn: () => fetchJson<NvidiaConfigStatus>("/api/settings/nvidia-key/test"),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status >= 500) return false;
      return failureCount < 2;
    },
  });
}

export function useSaveNvidiaKey() {
  const queryClient = useQueryClient();

  return useMutation<{ configured: true; configuredAt: string }, Error, string>({
    mutationFn: (apiKey: string) =>
      fetchJson<{ configured: true; configuredAt: string }>("/api/settings/nvidia-key", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: async () => {
      queryClient.setQueryData<NvidiaConfigStatus>(nvidiaKeys.config, (previous) => ({
        configured: true,
        configuredAt: previous?.configuredAt ?? new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
        defaultModel: previous?.defaultModel ?? DEFAULT_MODEL_ID,
      }));

      await queryClient.invalidateQueries({ queryKey: nvidiaKeys.config });
    },
  });
}

export function useDeleteNvidiaKey() {
  const queryClient = useQueryClient();

  return useMutation<{ configured: false }, Error, void>({
    mutationFn: () =>
      fetchJson<{ configured: false }>("/api/settings/nvidia-key", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.setQueryData<NvidiaConfigStatus>(nvidiaKeys.config, {
        configured: false,
        configuredAt: null,
        lastValidatedAt: null,
        defaultModel: DEFAULT_MODEL_ID,
      });
    },
  });
}

export interface ModelListResponse {
  items: NvidiaModel[];
  defaultModel: string;
  /** False when the live NVIDIA catalog could not be reached for this response. */
  live: boolean;
}

/** The model picker's options: curated catalog ∩ models NVIDIA is serving now. */
export function useNvidiaModels() {
  return useQuery<ModelListResponse>({
    queryKey: nvidiaKeys.models,
    queryFn: () => fetchJson<ModelListResponse>("/api/nvidia/models"),
    // The upstream catalog changes rarely; no need to refetch aggressively.
    staleTime: 10 * 60_000,
  });
}

/** Remembers the selected model server-side. Failures here are non-blocking. */
export function useSaveSelectedModel() {
  const queryClient = useQueryClient();

  return useMutation<{ model: string }, Error, string>({
    mutationFn: (model: string) =>
      fetchJson<{ model: string }>("/api/nvidia/models", {
        method: "POST",
        body: JSON.stringify({ model }),
      }),
    onSuccess: ({ model }) => {
      queryClient.setQueryData<NvidiaConfigStatus>(nvidiaKeys.config, (previous) =>
        previous ? { ...previous, defaultModel: model } : previous,
      );
    },
  });
}
