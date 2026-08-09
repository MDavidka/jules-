/**
 * Human labels for the agent's tools, and which ones are gated behind user
 * confirmation.
 *
 * Shared by the server tool layer and the client action trail, so a tool can never
 * be described one way in the UI and another way in the executor. Must stay free of
 * server-only imports.
 */

export const AGENT_TOOL_LABELS: Record<string, string> = {
  list_repositories: "Listing connected repositories",
  get_repository_overview: "Reading repository overview",
  list_repository_files: "Browsing repository files",
  read_repository_file: "Reading a file",
  list_repository_issues: "Reading open issues",
  list_memory: "Recalling saved memory",
  save_memory: "Saving to memory",
  list_projects: "Reading projects",
  save_project_info: "Updating the project",
  list_jules_sessions: "Checking Jules tasks",
  get_jules_session: "Checking a Jules task",
  start_jules: "Starting Jules",
  stop_jules: "Stopping Jules",
};

/**
 * Tools that must not run until the user accepts the action card. These are exactly
 * the operations that spend Jules capacity or interrupt work already running.
 */
export const CONFIRMATION_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  "start_jules",
  "stop_jules",
]);

export function getToolLabel(name: string): string {
  return AGENT_TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

export function isConfirmationRequired(name: string): boolean {
  return CONFIRMATION_REQUIRED_TOOLS.has(name);
}
