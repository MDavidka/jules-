import {
  Clock3,
  House,
  SquarePen,
  SquareTerminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type ViewId =
  | "new-task"
  | "memory"
  | "repositories"
  | "automations"
  | "dashboard"
  | "checks"
  | "settings"
  | "session";

export interface NavItem {
  id: Exclude<ViewId, "session" | "settings">;
  label: string;
  icon: LucideIcon;
}

/** Primary navigation, in the same order as the reference design. */
export const NAV_ITEMS: NavItem[] = [
  { id: "new-task", label: "New Task", icon: SquarePen },
  { id: "memory", label: "Memory", icon: Workflow },
  { id: "automations", label: "Automations", icon: Clock3 },
  { id: "dashboard", label: "Sessions", icon: House },
  { id: "checks", label: "SSH / Checks", icon: SquareTerminal },
];

export const VIEW_TITLES: Record<ViewId, string> = {
  "new-task": "New Task",
  memory: "Memory",
  repositories: "Repositories",
  automations: "Automations",
  dashboard: "Sessions",
  checks: "SSH / Checks",
  settings: "Settings",
  session: "Session",
};
