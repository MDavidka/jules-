"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validators";
import type { Project, ProjectStatus } from "@/types/projects";

export const projectKeys = {
  all: ["jules", "projects"] as const,
  list: (status?: ProjectStatus | "all") => ["jules", "projects", status ?? "all"] as const,
};

export interface ProjectListResponse {
  items: Project[];
  activeCount: number;
}

/**
 * Projects are a Jules+ concept: the working context the NVIDIA agent accumulates
 * per repository. The Projects tab only asks for `active` ones.
 */
export function useProjects(status?: ProjectStatus | "all") {
  const query = status && status !== "all" ? `?status=${status}` : "";

  return useQuery<ProjectListResponse>({
    queryKey: projectKeys.list(status),
    queryFn: ({ signal }) =>
      fetchJson<ProjectListResponse>(`/api/projects${query}`, { signal }),
    staleTime: 10_000,
  });
}

export function useUpsertProject() {
  const queryClient = useQueryClient();

  return useMutation<{ project: Project }, Error, CreateProjectInput>({
    mutationFn: (input) =>
      fetchJson<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation<{ project: Project }, Error, { id: string } & UpdateProjectInput>({
    mutationFn: ({ id, ...patch }) =>
      fetchJson<{ project: Project }>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: true }, Error, string>({
    mutationFn: (id) =>
      fetchJson<{ deleted: true }>(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
