"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useDocumentVisibility } from "@/hooks/use-document-visibility";
import { fetchJson, queryKeys, resourcePath } from "@/lib/api-client";
import type { CreateSessionInput } from "@/lib/validators";
import type {
  NormalizedActivity,
  NormalizedSession,
  PaginatedResult,
  Plan,
} from "@/types/jules";

/**
 * Adaptive polling intervals.
 *
 * Jules is asynchronous and offers no WebSocket/streaming API, so "real-time"
 * here means short-interval polling that backs off when nothing is happening.
 */
export const POLL_INTERVALS = {
  /** Active session detail + activities. */
  ACTIVE_DETAIL_MS: 4_000,
  /** Sessions list while any session is active. */
  ACTIVE_LIST_MS: 10_000,
  /** Everything settled (completed/failed/idle). */
  IDLE_MS: 30_000,
} as const;

type SessionsResponse = PaginatedResult<NormalizedSession> & { activeCount: number };

/* -------------------------------------------------------------------------- */
/*                               Sessions list                                */
/* -------------------------------------------------------------------------- */

export function useSessions(options: { enabled?: boolean; source?: string | null } = {}) {
  const { enabled = true, source = null } = options;
  const isVisible = useDocumentVisibility();
  const queryClient = useQueryClient();

  const query = useQuery<SessionsResponse>({
    queryKey: queryKeys.sessions(source),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (source) params.set("source", source);
      // `signal` comes from TanStack Query's AbortController: an in-flight
      // request is cancelled when the query unmounts or is refetched.
      return fetchJson<SessionsResponse>(`/api/sessions?${params.toString()}`, { signal });
    },
    enabled,
    refetchInterval: (query) => {
      // Pause entirely while the tab is hidden.
      if (!isVisible) return false;

      const hasActive = (query.state.data?.activeCount ?? 0) > 0;
      return hasActive ? POLL_INTERVALS.ACTIVE_LIST_MS : POLL_INTERVALS.IDLE_MS;
    },
    // Do not keep polling a backgrounded tab.
    refetchIntervalInBackground: false,
    staleTime: 2_000,
  });

  // Refresh immediately when the app becomes visible again.
  const wasVisible = React.useRef(isVisible);
  React.useEffect(() => {
    if (isVisible && !wasVisible.current && enabled) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(source) });
    }
    wasVisible.current = isVisible;
  }, [isVisible, enabled, source, queryClient]);

  return query;
}

/* -------------------------------------------------------------------------- */
/*                              Session details                               */
/* -------------------------------------------------------------------------- */

export function useSession(sessionName: string | null, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const isVisible = useDocumentVisibility();
  const queryClient = useQueryClient();
  const isEnabled = enabled && Boolean(sessionName);

  const query = useQuery<NormalizedSession>({
    queryKey: queryKeys.session(sessionName ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<NormalizedSession>(resourcePath("sessions", sessionName!), { signal }),
    enabled: isEnabled,
    refetchInterval: (query) => {
      if (!isVisible) return false;

      const data = query.state.data;
      if (!data) return POLL_INTERVALS.ACTIVE_DETAIL_MS;

      // Terminal states stop polling entirely.
      if (data.activity === "done" || data.activity === "failed") return false;

      // Active or waiting on the user -> fast polling.
      if (data.isActive || data.activity === "waiting") return POLL_INTERVALS.ACTIVE_DETAIL_MS;

      return POLL_INTERVALS.IDLE_MS;
    },
    refetchIntervalInBackground: false,
    staleTime: 1_000,
  });

  const wasVisible = React.useRef(isVisible);
  React.useEffect(() => {
    if (isVisible && !wasVisible.current && isEnabled && sessionName) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionName) });
    }
    wasVisible.current = isVisible;
  }, [isVisible, isEnabled, sessionName, queryClient]);

  return query;
}

/* -------------------------------------------------------------------------- */
/*                                 Activities                                 */
/* -------------------------------------------------------------------------- */

type ActivitiesResponse = PaginatedResult<NormalizedActivity> & {
  latestPlan: Plan | null;
  approvedPlanIds: string[];
};

export function useActivities(
  sessionName: string | null,
  options: { enabled?: boolean; isSessionActive?: boolean } = {},
) {
  const { enabled = true, isSessionActive = true } = options;
  const isVisible = useDocumentVisibility();
  const queryClient = useQueryClient();
  const isEnabled = enabled && Boolean(sessionName);

  const query = useQuery<ActivitiesResponse>({
    queryKey: queryKeys.activities(sessionName ?? ""),
    queryFn: ({ signal }) =>
      fetchJson<ActivitiesResponse>(`${resourcePath("sessions", sessionName!)}/activities?pageSize=100`, {
        signal,
      }),
    enabled: isEnabled,
    refetchInterval: () => {
      if (!isVisible) return false;
      // Mirror the session's own cadence: 4s while working, 30s once settled.
      return isSessionActive ? POLL_INTERVALS.ACTIVE_DETAIL_MS : POLL_INTERVALS.IDLE_MS;
    },
    refetchIntervalInBackground: false,
    staleTime: 1_000,
  });

  const wasVisible = React.useRef(isVisible);
  React.useEffect(() => {
    if (isVisible && !wasVisible.current && isEnabled && sessionName) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities(sessionName) });
    }
    wasVisible.current = isVisible;
  }, [isVisible, isEnabled, sessionName, queryClient]);

  return query;
}

/* -------------------------------------------------------------------------- */
/*                                 Mutations                                  */
/* -------------------------------------------------------------------------- */

interface CreateSessionResponse {
  session: NormalizedSession;
  submitted: true;
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation<CreateSessionResponse, Error, CreateSessionInput>({
    mutationFn: (input) =>
      fetchJson<CreateSessionResponse>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData<NormalizedSession>(
        queryKeys.session(data.session.name),
        data.session,
      );
      void queryClient.invalidateQueries({ queryKey: ["jules", "sessions"] });
    },
  });
}

export function useApprovePlan(sessionName: string) {
  const queryClient = useQueryClient();

  return useMutation<{ approved: true }, Error, void>({
    mutationFn: () =>
      fetchJson<{ approved: true }>(`${resourcePath("sessions", sessionName)}/approve-plan`, {
        method: "POST",
      }),
    onSuccess: () => {
      // The plan approval only takes effect upstream; refetch to observe it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionName) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities(sessionName) });
      void queryClient.invalidateQueries({ queryKey: ["jules", "sessions"] });
    },
  });
}

export function useSendMessage(sessionName: string) {
  const queryClient = useQueryClient();

  return useMutation<{ sent: true }, Error, string>({
    mutationFn: (prompt) =>
      fetchJson<{ sent: true }>(`${resourcePath("sessions", sessionName)}/messages`, {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: () => {
      // sendMessage returns an empty body upstream, so the new activity only
      // appears once the activities list is refetched.
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities(sessionName) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionName) });
    },
  });
}
