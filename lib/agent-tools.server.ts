import "server-only";

import { z } from "zod";

import { getToolLabel, isConfirmationRequired } from "@/lib/agent-tool-labels";
import {
  getRepoOverview,
  GitHubError,
  listRepoFiles,
  listRepoIssues,
  parseRepoRef,
  readRepoFile,
} from "@/lib/github-public.server";
import {
  createSession,
  getSession,
  listSessions,
  listSources,
  normalizeSession,
  normalizeSource,
  sendMessage,
} from "@/lib/jules-client.server";
import { connectToDatabase, MemoryNote } from "@/lib/mongodb.server";
import type { MemoryNoteDoc } from "@/lib/mongodb.server";
import {
  attachSessionToProject,
  listProjects,
  markSessionStopped,
  upsertProject,
} from "@/lib/projects.server";
import type { ChatToolDefinition } from "@/lib/nvidia-client.server";
import type { NormalizedSource } from "@/types/jules";
import type { ProjectStatus } from "@/types/projects";

/**
 * The tool surface exposed to the NVIDIA model.
 *
 * Design rules:
 *  1. The agent's primary job is to GATHER CONTEXT - read repos, read issues, and
 *     persist what it learns as memory and project facts. Those tools run
 *     automatically.
 *  2. Anything that spends Jules capacity or changes a running task
 *     (`start_jules`, `stop_jules`) requires explicit user confirmation in the UI.
 *     `requiresConfirmation` below is the single source of truth for that.
 *  3. Every result is small and JSON-serializable, because it is fed straight back
 *     into the model's context on the next turn.
 */

/* -------------------------------------------------------------------------- */
/*                             Tool result shapes                             */
/* -------------------------------------------------------------------------- */

export interface ToolOutcome {
  ok: boolean;
  /** Serialized back to the model as the `tool` message content. */
  data: unknown;
  /** Short human sentence rendered in the UI trace. */
  summary: string;
}

export interface AgentContext {
  /** Repository currently selected in the composer, if any. */
  source: string | null;
  branch: string | null;
  signal?: AbortSignal;
}

/* -------------------------------------------------------------------------- */
/*                              Tool declarations                             */
/* -------------------------------------------------------------------------- */

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Verb phrase shown in the UI trace. Sourced from the shared label module. */
  label: string;
  /** When true the UI must ask the user before this runs. */
  requiresConfirmation: boolean;
}

/** Declarations without the presentation fields, which are merged in below. */
type AgentToolDeclaration = Omit<AgentToolSpec, "label" | "requiresConfirmation">;

const noParams = { type: "object", properties: {}, additionalProperties: false } as const;

const AGENT_TOOL_DECLARATIONS: AgentToolDeclaration[] = [
  {
    name: "list_repositories",
    description:
      "List the GitHub repositories connected to the user's Jules account. Use this first when " +
      "you need to know what the user can actually work on.",
    parameters: noParams,
  },
  {
    name: "get_repository_overview",
    description:
      "Get metadata and a README excerpt for a PUBLIC GitHub repository: description, primary " +
      "language, topics, default branch, open issue count. Start here to understand a project.",
    parameters: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository in owner/repo form, e.g. vercel/next.js.",
        },
      },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "list_repository_files",
    description:
      "List the files and directories at one path in a PUBLIC repository. Use it to navigate " +
      "before reading a file. Omit `path` for the repository root.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository in owner/repo form." },
        path: { type: "string", description: "Directory path. Omit or empty for the root." },
        ref: { type: "string", description: "Branch, tag, or commit SHA. Defaults to the default branch." },
      },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "read_repository_file",
    description:
      "Read a single text file from a PUBLIC repository. Long files are truncated. Use this to " +
      "confirm how something actually works before proposing a change.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository in owner/repo form." },
        path: { type: "string", description: "File path relative to the repository root." },
        ref: { type: "string", description: "Branch, tag, or commit SHA." },
      },
      required: ["repo", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "list_repository_issues",
    description:
      "List recent issues for a PUBLIC repository. Useful for finding a concrete reported bug " +
      "to hand to Jules.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository in owner/repo form." },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Defaults to open." },
      },
      required: ["repo"],
      additionalProperties: false,
    },
  },
  {
    name: "list_memory",
    description:
      "Read the notes already saved about the user and their projects. Call this early so you " +
      "do not ask for information you have already been told.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "Optional Jules source name to scope the notes." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "save_memory",
    description:
      "Persist a durable fact about the user, their stack, their preferences, or a project. " +
      "Save anything worth remembering next session. Keep each note to one specific fact.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact to remember, as one clear sentence." },
        source: {
          type: "string",
          description: "Optional Jules source name to scope the note to one repository.",
        },
        pinned: {
          type: "boolean",
          description:
            "When true (default) the note is automatically attached to future Jules task prompts.",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "list_projects",
    description: "List the user's Jules+ projects and their status.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "paused", "done"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "save_project_info",
    description:
      "Create or update the project record for a repository: its name, a rolling summary of " +
      "what the user wants, structured facts, and its status. Only active projects appear in " +
      "the user's Projects tab, so use status to reflect reality.",
    parameters: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description:
            "Repository in owner/repo form, or a Jules source name. Defaults to the repository " +
            "currently selected in the composer.",
        },
        name: { type: "string", description: "Display name. Defaults to owner/repo." },
        summary: { type: "string", description: "One-paragraph summary of the goal." },
        facts: {
          type: "array",
          description: "Structured details, e.g. {label: 'Stack', value: 'Next.js + Mongo'}.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["label", "value"],
            additionalProperties: false,
          },
        },
        branch: { type: "string", description: "Working branch for this project." },
        status: { type: "string", enum: ["active", "paused", "done"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_jules_sessions",
    description:
      "List the user's Jules coding sessions with their current state, so you can report " +
      "progress or find a session to stop.",
    parameters: noParams,
  },
  {
    name: "get_jules_session",
    description: "Get the current state of one Jules session, including any pull request it opened.",
    parameters: {
      type: "object",
      properties: {
        session: { type: "string", description: "Jules session name, e.g. sessions/abc123." },
      },
      required: ["session"],
      additionalProperties: false,
    },
  },
  {
    name: "start_jules",
    description:
      "Hand a coding task to Jules, which will plan it, write the code, and open a pull " +
      "request. Write `prompt` as a complete, self-contained brief including the files and " +
      "behaviour you already verified - Jules cannot see this conversation. The user must " +
      "confirm before this runs.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The full task brief for Jules. Be specific and self-contained.",
        },
        repo: {
          type: "string",
          description:
            "Repository in owner/repo form, or a Jules source name. Defaults to the repository " +
            "currently selected in the composer.",
        },
        branch: { type: "string", description: "Starting branch. Defaults to the repo default." },
        title: { type: "string", description: "Short title for the task." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "stop_jules",
    description:
      "Ask a running Jules session to stop and mark it stopped in the project record. NOTE: the " +
      "Jules API has no hard cancel, so this sends an explicit stop instruction to the session " +
      "and stops tracking it - it cannot forcibly kill work already in progress. The user must " +
      "confirm before this runs.",
    parameters: {
      type: "object",
      properties: {
        session: { type: "string", description: "Jules session name, e.g. sessions/abc123." },
        reason: { type: "string", description: "Why it is being stopped. Included in the message." },
      },
      required: ["session"],
      additionalProperties: false,
    },
  },
];

/**
 * The full specs: declarations above, merged with the labels and confirmation flags
 * the UI also reads. Single source of truth for both sides.
 */
export const AGENT_TOOL_SPECS: AgentToolSpec[] = AGENT_TOOL_DECLARATIONS.map((declaration) => ({
  ...declaration,
  label: getToolLabel(declaration.name),
  requiresConfirmation: isConfirmationRequired(declaration.name),
}));

const SPECS_BY_NAME = new Map(AGENT_TOOL_SPECS.map((spec) => [spec.name, spec]));

/** The `tools` payload sent to the NVIDIA chat completions endpoint. */
export const AGENT_TOOLS: ChatToolDefinition[] = AGENT_TOOL_SPECS.map((spec) => ({
  type: "function",
  function: {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
  },
}));

export function getToolSpec(name: string): AgentToolSpec | null {
  return SPECS_BY_NAME.get(name) ?? null;
}



/* -------------------------------------------------------------------------- */
/*                             Argument validation                            */
/* -------------------------------------------------------------------------- */

const repoRefSchema = z.string().trim().min(1, "A repository is required.");

const schemas = {
  get_repository_overview: z.object({ repo: repoRefSchema }),
  list_repository_files: z.object({
    repo: repoRefSchema,
    path: z.string().trim().max(400).optional(),
    ref: z.string().trim().max(255).optional(),
  }),
  read_repository_file: z.object({
    repo: repoRefSchema,
    path: z.string().trim().min(1, "A file path is required.").max(400),
    ref: z.string().trim().max(255).optional(),
  }),
  list_repository_issues: z.object({
    repo: repoRefSchema,
    state: z.enum(["open", "closed", "all"]).optional(),
  }),
  list_memory: z.object({ source: z.string().trim().max(300).optional() }),
  save_memory: z.object({
    content: z.string().trim().min(3, "Memory needs content.").max(4000),
    source: z.string().trim().max(300).optional(),
    pinned: z.boolean().optional(),
  }),
  list_projects: z.object({ status: z.enum(["active", "paused", "done"]).optional() }),
  save_project_info: z.object({
    repo: z.string().trim().max(300).optional(),
    name: z.string().trim().max(200).optional(),
    summary: z.string().trim().max(4000).optional(),
    facts: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(120),
          value: z.string().trim().min(1).max(2000),
        }),
      )
      .max(25)
      .optional(),
    branch: z.string().trim().max(255).optional(),
    status: z.enum(["active", "paused", "done"]).optional(),
  }),
  get_jules_session: z.object({ session: z.string().trim().min(1) }),
  start_jules: z.object({
    prompt: z.string().trim().min(10, "The task brief is too short for Jules to act on.").max(10_000),
    repo: z.string().trim().max(300).optional(),
    branch: z.string().trim().max(255).optional(),
    title: z.string().trim().max(200).optional(),
  }),
  stop_jules: z.object({
    session: z.string().trim().min(1),
    reason: z.string().trim().max(1000).optional(),
  }),
};

/* -------------------------------------------------------------------------- */
/*                              Source resolution                             */
/* -------------------------------------------------------------------------- */

/** Normalizes a session name the model may have written without its prefix. */
function normalizeSessionName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("sessions/")) return trimmed;
  return `sessions/${trimmed.replace(/^\/+/, "")}`;
}

let cachedSources: { at: number; items: NormalizedSource[] } | null = null;

/** Jules sources, cached briefly so one turn's tool calls don't refetch repeatedly. */
async function getSources(signal?: AbortSignal): Promise<NormalizedSource[]> {
  if (cachedSources && Date.now() - cachedSources.at < 30_000) return cachedSources.items;

  const response = await listSources({ pageSize: 100, signal });
  const items = (response.sources ?? [])
    .map(normalizeSource)
    .filter((source) => Boolean(source.name));

  cachedSources = { at: Date.now(), items };
  return items;
}

/**
 * Resolves whatever the model supplied into a real Jules source, falling back to the
 * repository selected in the composer. Jules cannot act on a repo it is not connected
 * to, so this fails loudly with the list of valid options.
 */
async function resolveSource(
  hint: string | undefined,
  context: AgentContext,
): Promise<NormalizedSource> {
  const sources = await getSources(context.signal);

  if (sources.length === 0) {
    throw new Error(
      "No repositories are connected to Jules. Install the Jules GitHub App and grant it access first.",
    );
  }

  const candidate = hint?.trim() || context.source;

  if (!candidate) {
    throw new Error(
      "No repository was specified and none is selected in the composer. Ask the user which " +
        `repository to use. Available: ${sources.map((source) => source.fullName).join(", ")}`,
    );
  }

  const exact = sources.find((source) => source.name === candidate);
  if (exact) return exact;

  // Accept owner/repo, a GitHub URL, or a bare repo name.
  let normalized = candidate
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^sources\/github\//, "")
    .replace(/^sources\//, "")
    .replace(/\.git$/, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

  const byFullName = sources.find((source) => source.fullName.toLowerCase() === normalized);
  if (byFullName) return byFullName;

  const bareName = normalized.split("/").pop() ?? normalized;
  const byRepo = sources.filter((source) => (source.repo ?? "").toLowerCase() === bareName);
  if (byRepo.length === 1) return byRepo[0]!;

  throw new Error(
    `"${candidate}" is not a repository connected to Jules. Available: ` +
      `${sources.map((source) => source.fullName).join(", ")}`,
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Executor                                  */
/* -------------------------------------------------------------------------- */

function parseArgs<T extends z.ZodTypeAny>(schema: T, args: unknown): z.infer<T> {
  const parsed = schema.safeParse(args ?? {});

  if (!parsed.success) {
    throw new Error(
      `Invalid arguments: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "value"} - ${issue.message}`).join("; ")}`,
    );
  }

  return parsed.data;
}

/**
 * Runs one tool call. Never throws: a failure is returned as `ok: false` so the model
 * sees the error, can explain it, and can try a different approach.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentContext,
): Promise<ToolOutcome> {
  try {
    return await run(name, args, context);
  } catch (error) {
    const message =
      error instanceof GitHubError || error instanceof Error
        ? error.message
        : "The tool failed for an unknown reason.";

    return { ok: false, data: { error: message }, summary: message };
  }
}

async function run(
  name: string,
  args: Record<string, unknown>,
  context: AgentContext,
): Promise<ToolOutcome> {
  switch (name) {
    /* ----------------------------- Repositories ---------------------------- */

    case "list_repositories": {
      const sources = await getSources(context.signal);

      return {
        ok: true,
        data: {
          repositories: sources.map((source) => ({
            source: source.name,
            repo: source.fullName,
            isPrivate: source.isPrivate,
            defaultBranch: source.defaultBranch,
            branches: source.branches.slice(0, 25),
          })),
          selected: context.source,
        },
        summary: `Found ${sources.length} connected ${sources.length === 1 ? "repository" : "repositories"}.`,
      };
    }

    case "get_repository_overview": {
      const input = parseArgs(schemas.get_repository_overview, args);
      const overview = await getRepoOverview(input.repo, context.signal);

      return {
        ok: true,
        data: overview,
        summary: `Read ${overview.repo}${overview.primaryLanguage ? ` (${overview.primaryLanguage})` : ""}.`,
      };
    }

    case "list_repository_files": {
      const input = parseArgs(schemas.list_repository_files, args);
      const result = await listRepoFiles(
        input.repo,
        { path: input.path, gitRef: input.ref },
        context.signal,
      );

      return {
        ok: true,
        data: result,
        summary: `Listed ${result.entries.length} ${result.entries.length === 1 ? "entry" : "entries"} in ${result.repo}/${result.path === "/" ? "" : result.path}.`,
      };
    }

    case "read_repository_file": {
      const input = parseArgs(schemas.read_repository_file, args);
      const result = await readRepoFile(
        input.repo,
        { path: input.path, gitRef: input.ref },
        context.signal,
      );

      return {
        ok: true,
        data: result,
        summary: `Read ${result.repo}/${result.path}${result.truncated ? " (truncated)" : ""}.`,
      };
    }

    case "list_repository_issues": {
      const input = parseArgs(schemas.list_repository_issues, args);
      const result = await listRepoIssues(input.repo, { state: input.state }, context.signal);

      return {
        ok: true,
        data: result,
        summary: `Found ${result.issues.length} ${input.state ?? "open"} ${result.issues.length === 1 ? "issue" : "issues"} in ${result.repo}.`,
      };
    }

    /* -------------------------------- Memory ------------------------------- */

    case "list_memory": {
      const input = parseArgs(schemas.list_memory, args);
      await connectToDatabase();

      const filter = input.source ? { source: input.source } : {};
      const notes = await MemoryNote.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean<MemoryNoteDoc[]>()
        .exec();

      return {
        ok: true,
        data: {
          notes: notes.map((note) => ({
            id: String(note._id),
            content: note.content,
            source: note.source ?? null,
            pinned: note.pinned,
            createdAt: note.createdAt?.toISOString() ?? null,
          })),
        },
        summary: `Recalled ${notes.length} memory ${notes.length === 1 ? "note" : "notes"}.`,
      };
    }

    case "save_memory": {
      const input = parseArgs(schemas.save_memory, args);
      await connectToDatabase();

      // Scope to a real Jules source when one was named, so the note is filterable.
      let scoped: string | null = null;
      if (input.source) {
        try {
          scoped = (await resolveSource(input.source, context)).name;
        } catch {
          scoped = null; // Unknown repo: save it as a global note rather than losing it.
        }
      }

      const created = await MemoryNote.create({
        content: input.content,
        source: scoped,
        pinned: input.pinned ?? true,
      });

      return {
        ok: true,
        data: {
          id: String(created._id),
          content: created.content,
          source: created.source ?? null,
          pinned: created.pinned,
          saved: true,
        },
        summary: `Saved to memory: "${truncateForUi(created.content, 80)}"`,
      };
    }

    /* ------------------------------- Projects ------------------------------ */

    case "list_projects": {
      const input = parseArgs(schemas.list_projects, args);
      const projects = await listProjects(input.status as ProjectStatus | undefined);

      return {
        ok: true,
        data: {
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            repo: project.sourceFullName,
            source: project.source,
            status: project.status,
            branch: project.branch,
            summary: project.summary,
            facts: project.facts.map((fact) => `${fact.label}: ${fact.value}`),
            runningSessions: project.runningSessionCount,
            lastActivityAt: project.lastActivityAt,
          })),
        },
        summary: `Found ${projects.length} ${projects.length === 1 ? "project" : "projects"}.`,
      };
    }

    case "save_project_info": {
      const input = parseArgs(schemas.save_project_info, args);
      const source = await resolveSource(input.repo, context);

      const project = await upsertProject({
        name: input.name ?? source.fullName,
        source: source.name,
        branch: input.branch ?? context.branch ?? source.defaultBranch ?? null,
        summary: input.summary ?? null,
        status: input.status as ProjectStatus | undefined,
        facts: input.facts,
      });

      return {
        ok: true,
        data: {
          id: project.id,
          name: project.name,
          repo: project.sourceFullName,
          status: project.status,
          summary: project.summary,
          factCount: project.facts.length,
          saved: true,
        },
        summary: `Updated project ${project.name}${input.facts?.length ? ` with ${input.facts.length} fact(s)` : ""}.`,
      };
    }

    /* ------------------------------- Sessions ------------------------------ */

    case "list_jules_sessions": {
      const response = await listSessions({ pageSize: 30, signal: context.signal });
      const sessions = (response.sessions ?? []).map(normalizeSession);

      return {
        ok: true,
        data: {
          sessions: sessions.map((session) => ({
            session: session.name,
            title: session.title,
            state: session.state,
            activity: session.activity,
            repo: session.sourceFullName,
            branch: session.branch,
            pullRequestUrl: session.pullRequestUrl,
            updateTime: session.updateTime,
          })),
        },
        summary: `Found ${sessions.length} Jules ${sessions.length === 1 ? "session" : "sessions"}.`,
      };
    }

    case "get_jules_session": {
      const input = parseArgs(schemas.get_jules_session, args);
      const session = normalizeSession(
        await getSession(normalizeSessionName(input.session), context.signal),
      );

      return {
        ok: true,
        data: {
          session: session.name,
          title: session.title,
          state: session.state,
          activity: session.activity,
          repo: session.sourceFullName,
          branch: session.branch,
          requiresPlanApproval: session.requiresPlanApproval,
          pullRequestUrl: session.pullRequestUrl,
        },
        summary: `${session.title} is ${session.state}.`,
      };
    }

    /* --------------------- Confirmation-required actions -------------------- */

    case "start_jules": {
      const input = parseArgs(schemas.start_jules, args);
      const source = await resolveSource(input.repo, context);

      // Jules requires an explicit starting branch.
      const branch = input.branch ?? context.branch ?? source.defaultBranch;
      if (!branch) {
        throw new Error(
          `Could not determine a starting branch for ${source.fullName}. Ask the user which branch to use.`,
        );
      }

      // Attach pinned memory so Jules gets the saved project context too.
      await connectToDatabase();
      const pinned = await MemoryNote.find({
        pinned: true,
        $or: [{ source: null }, { source: source.name }],
      })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean<MemoryNoteDoc[]>()
        .exec();

      const memoryBlock =
        pinned.length > 0
          ? `\n\n---\nProject memory:\n${pinned.map((note) => `- ${note.content}`).join("\n")}`
          : "";

      const session = normalizeSession(
        await createSession({
          prompt: `${input.prompt}${memoryBlock}`,
          sourceContext: {
            source: source.name,
            githubRepoContext: { startingBranch: branch },
          },
          ...(input.title ? { title: input.title } : {}),
        }),
      );

      const project = await attachSessionToProject({
        source: source.name,
        sessionName: session.name,
        title: session.title,
        projectName: source.fullName,
        branch,
      });

      return {
        ok: true,
        data: {
          started: true,
          session: session.name,
          title: session.title,
          state: session.state,
          repo: source.fullName,
          branch,
          memoryNotesAttached: pinned.length,
          projectId: project?.id ?? null,
          note: "Jules works asynchronously. Poll with get_jules_session for progress.",
        },
        summary: `Jules started on ${source.fullName} (${branch}).`,
      };
    }

    case "stop_jules": {
      const input = parseArgs(schemas.stop_jules, args);
      const sessionName = normalizeSessionName(input.session);

      const reason = input.reason?.trim();
      const stopMessage =
        "Please stop work on this task immediately. Do not make further changes or open a " +
        `pull request.${reason ? ` Reason: ${reason}` : ""}`;

      // The Jules v1alpha API has no cancel/abort method, so the strongest available
      // action is an explicit stop instruction plus dropping local tracking.
      let messageDelivered = true;
      let deliveryNote: string | null = null;

      try {
        await sendMessage(sessionName, stopMessage);
      } catch (error) {
        messageDelivered = false;
        deliveryNote =
          error instanceof Error
            ? error.message
            : "The stop instruction could not be delivered to Jules.";
      }

      const project = await markSessionStopped(sessionName);

      return {
        ok: true,
        data: {
          session: sessionName,
          stopInstructionDelivered: messageDelivered,
          ...(deliveryNote ? { deliveryError: deliveryNote } : {}),
          trackingStopped: Boolean(project),
          projectStatus: project?.status ?? null,
          caveat:
            "The Jules API exposes no hard cancel. Jules was asked to stop and is no longer " +
            "tracked as running, but any in-flight step may still finish.",
        },
        summary: messageDelivered
          ? `Asked Jules to stop ${sessionName.replace("sessions/", "")}.`
          : `Marked ${sessionName.replace("sessions/", "")} stopped, but the message failed to send.`,
      };
    }

    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

function truncateForUi(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}
