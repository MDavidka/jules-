"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, queryKeys } from "@/lib/api-client";
import type { UpdatePreferencesInput } from "@/lib/validators";
import type { AutomationMode } from "@/types/jules";

export interface Preferences {
  defaultAutomationMode: AutomationMode;
  defaultRequirePlanApproval: boolean;
}

/** Automation defaults applied to newly created Jules sessions. */
export function usePreferences() {
  return useQuery<Preferences>({
    queryKey: queryKeys.preferences,
    queryFn: ({ signal }) => fetchJson<Preferences>("/api/preferences", { signal }),
    staleTime: 30_000,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation<Preferences, Error, UpdatePreferencesInput>({
    mutationFn: (input) =>
      fetchJson<Preferences>("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.preferences, data);
    },
  });
}
