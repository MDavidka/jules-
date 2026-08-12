/**
 * Shared vocabulary for the assistant's status row. Lives outside the client
 * component so server code (the chat route, the research agent) can emit these
 * values without importing React.
 */
export const AGENT_ACTIVITIES = [
  "thinking",
  "reading",
  "searching",
  "inspecting",
  "saving",
  "working",
  "waiting",
  "done",
] as const;

export type AgentActivity = (typeof AGENT_ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<AgentActivity, string> = {
  thinking: "analyzing your request..",
  reading: "reading documentation..",
  searching: "searching the web..",
  inspecting: "understanding the repository..",
  saving: "saving to memory..",
  working: "composing response..",
  waiting: "rate limited, retrying..",
  done: "done",
};

export function isAgentActivity(value: unknown): value is AgentActivity {
  return typeof value === "string" && (AGENT_ACTIVITIES as readonly string[]).includes(value);
}
