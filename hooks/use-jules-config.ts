"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, fetchJson, queryKeys } from "@/lib/api-client";

export interface JulesConfigStatus {
  configured: boolean;
  configuredAt: string | null;
  lastValidatedAt: string | null;
}

/** Drives the setup gate: everything else is disabled until `configured`. */
export function useJulesConfig() {
  return useQuery<JulesConfigStatus>({
    queryKey: queryKeys.config,
    queryFn: () => fetchJson<JulesConfigStatus>("/api/settings/jules-key/test"),
    staleTime: 30_000,
    // A configuration/database error is not worth hammering.
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status >= 500) return false;
      return failureCount < 2;
    },
  });
}

export interface SaveKeyResponse {
  configured: true;
  sourceCount: number;
  configuredAt: string;
}

export function useSaveApiKey() {
  const queryClient = useQueryClient();

  return useMutation<SaveKeyResponse, Error, string>({
    mutationFn: (apiKey: string) =>
      fetchJson<SaveKeyResponse>("/api/settings/jules-key", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: async () => {
      // Flip the gate, then let repositories/sessions load fresh.
      queryClient.setQueryData<JulesConfigStatus>(queryKeys.config, (previous) => ({
        configured: true,
        configuredAt: previous?.configuredAt ?? new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
      }));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.config }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sources }),
        queryClient.invalidateQueries({ queryKey: ["jules", "sessions"] }),
      ]);
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation<{ configured: false }, Error, void>({
    mutationFn: () =>
      fetchJson<{ configured: false }>("/api/settings/jules-key", { method: "DELETE" }),
    onSuccess: () => {
      // Stop every Jules poll immediately and drop cached Jules data.
      queryClient.setQueryData<JulesConfigStatus>(queryKeys.config, {
        configured: false,
        configuredAt: null,
        lastValidatedAt: null,
      });

      queryClient.removeQueries({ queryKey: queryKeys.sources });
      queryClient.removeQueries({ queryKey: ["jules", "sessions"] });
      queryClient.removeQueries({ queryKey: ["jules", "session"] });
      queryClient.removeQueries({ queryKey: ["jules", "activities"] });
      queryClient.removeQueries({ queryKey: ["jules", "source"] });
    },
  });
}
