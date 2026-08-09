import {
  BrainCircuit,
  Clock3,
  Github,
  House,
  PanelsTopLeft,
  SquarePen,
  type LucideIcon,
} from "lucide-react";

export type ViewId =
  | "new-task"
  | "skills"
  | "memory"
  | "repositories"
  | "automations"
  | "dashboard"
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
  { id: "skills", label: "Skills & Plugins", icon: PanelsTopLeft },
  { id: "memory", label: "Memory", icon: BrainCircuit },
  { id: "repositories", label: "Repositories", icon: Github },
  { id: "automations", label: "Automations", icon: Clock3 },
  { id: "dashboard", label: "Dashboard", icon: House },
];

export const VIEW_TITLES: Record<ViewId, string> = {
  "new-task": "New Task",
  skills: "Skills & Plugins",
  memory: "Memory",
  repositories: "Repositories",
  automations: "Automations",
  dashboard: "Dashboard",
  settings: "Settings",
  session: "Task",
};
