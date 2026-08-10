import { z } from "zod";

import { AUTOMATION_MODES } from "@/types/jules";

/**
 * Shared Zod schemas. Imported by BOTH client forms and server route handlers
 * so validation rules cannot drift between the two.
 */

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

export const julesApiKeySchema = z.object({
  apiKey: z
    .string({ required_error: "An API key is required." })
    .trim()
    .min(1, "An API key is required.")
    .max(512, "That key is longer than any valid Jules API key.")
    // Reject whitespace inside the key: a common copy/paste error.
    .refine((value) => !/\s/.test(value), "The API key must not contain spaces or line breaks."),
});

export type JulesApiKeyInput = z.infer<typeof julesApiKeySchema>;

export const nvidiaApiKeySchema = z.object({
  apiKey: z
    .string({ required_error: "An NVIDIA API key is required." })
    .trim()
    .min(1, "An NVIDIA API key is required.")
    .max(512, "That key is longer than any valid NVIDIA API key.")
    .refine((value) => !/\s/.test(value), "The API key must not contain spaces or line breaks.")
    // NVIDIA build keys are `nvapi-` prefixed. Warn rather than hard-fail on shape
    // so a future prefix change does not lock the user out.
    .refine(
      (value) => value.startsWith("nvapi-") || value.length >= 20,
      "That does not look like an NVIDIA API key. Keys from build.nvidia.com start with `nvapi-`.",
    ),
});

export type NvidiaApiKeyInput = z.infer<typeof nvidiaApiKeySchema>;

/* -------------------------------------------------------------------------- */
/*                                   Sources                                  */
/* -------------------------------------------------------------------------- */

/** Jules source resource name, e.g. `sources/github/owner/repo`. */
export const sourceResourceNameSchema = z
  .string()
  .trim()
  .min(1, "A repository is required.")
  .regex(/^sources\/[A-Za-z0-9._\-/]+$/, "Must be a Jules source name like sources/github/owner/repo.");

/** Jules session resource name, e.g. `sessions/abc123`. */
export const sessionResourceNameSchema = z
  .string()
  .trim()
  .min(1, "A session is required.")
  .regex(/^sessions\/[A-Za-z0-9._-]+$/, "Must be a Jules session name like sessions/{session}.");

export const paginationSchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  pageToken: z.string().trim().min(1).optional(),
});

export const listSourcesQuerySchema = paginationSchema.extend({
  filter: z.string().trim().min(1).max(500).optional(),
});

export const listSessionsQuerySchema = paginationSchema.extend({
  /**
   * Client-side convenience filter. The upstream `sessions.list` method does
   * NOT support filtering, so this is applied by our route handler after
   * fetching a page.
   */
  source: sourceResourceNameSchema.optional(),
});

export const listActivitiesQuerySchema = paginationSchema;

/* -------------------------------------------------------------------------- */
/*                                  Sessions                                  */
/* -------------------------------------------------------------------------- */

export const PROMPT_MIN_LENGTH = 5;
export const PROMPT_MAX_LENGTH = 10_000;

export const createSessionSchema = z.object({
  prompt: z
    .string({ required_error: "Describe what you want Jules to do." })
    .trim()
    .min(PROMPT_MIN_LENGTH, `Describe the task in at least ${PROMPT_MIN_LENGTH} characters.`)
    .max(PROMPT_MAX_LENGTH, `Keep the prompt under ${PROMPT_MAX_LENGTH.toLocaleString()} characters.`),
  source: sourceResourceNameSchema,
  branch: z
    .string()
    .trim()
    .max(255, "Branch name is too long.")
    .optional()
    // Treat empty string from a form select as "not provided".
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  title: z.string().trim().max(200, "Title is too long.").optional(),
  automationMode: z.enum(AUTOMATION_MODES).optional(),
  requirePlanApproval: z.boolean().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const sendMessageSchema = z.object({
  prompt: z
    .string({ required_error: "Type a message to send." })
    .trim()
    .min(1, "Type a message to send.")
    .max(PROMPT_MAX_LENGTH, "Message is too long."),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/* -------------------------------------------------------------------------- */
/*                              Memory (Jules+)                               */
/* -------------------------------------------------------------------------- */

export const createMemorySchema = z.object({
  content: z
    .string({ required_error: "Write something to remember." })
    .trim()
    .min(3, "Write at least 3 characters.")
    .max(4000, "Keep memory entries under 4,000 characters."),
  source: sourceResourceNameSchema.optional(),
  pinned: z.boolean().optional().default(true),
});

export type CreateMemoryInput = z.infer<typeof createMemorySchema>;

/* -------------------------------------------------------------------------- */
/*                            Preferences (Jules+)                            */
/* -------------------------------------------------------------------------- */

export const updatePreferencesSchema = z
  .object({
    defaultAutomationMode: z.enum(AUTOMATION_MODES).optional(),
    defaultRequirePlanApproval: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one preference to update.",
  });

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/** Formats a ZodError into a flat field->message map for API responses. */
export function formatZodError(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }

  return fieldErrors;
}


/* -------------------------------------------------------------------------- */
/*                            Projects (Jules+)                               */
/* -------------------------------------------------------------------------- */

export const PROJECT_STATUS_VALUES = ["active", "paused", "done"] as const;

export const projectFactSchema = z.object({
  label: z.string().trim().min(1, "A fact needs a label.").max(120, "Label is too long."),
  value: z.string().trim().min(1, "A fact needs a value.").max(2000, "Value is too long."),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "A project needs a name.").max(200, "Name is too long."),
  source: sourceResourceNameSchema,
  branch: z
    .string()
    .trim()
    .max(255, "Branch name is too long.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  summary: z.string().trim().max(4000, "Summary is too long.").optional(),
  facts: z.array(projectFactSchema).max(50, "Too many facts at once.").optional(),
  status: z.enum(PROJECT_STATUS_VALUES).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    branch: z.string().trim().max(255).optional(),
    summary: z.string().trim().max(4000).optional(),
    status: z.enum(PROJECT_STATUS_VALUES).optional(),
    /** Facts are appended, not replaced, so the agent can accumulate context. */
    facts: z.array(projectFactSchema).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/* -------------------------------------------------------------------------- */
/*                          NVIDIA agent chat (Jules+)                        */
/* -------------------------------------------------------------------------- */

export const CHAT_MESSAGE_MAX_LENGTH = 8_000;
/** Hard cap on history sent upstream, to bound token usage and payload size. */
export const CHAT_HISTORY_MAX_MESSAGES = 80;

const chatToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

/**
 * The transcript is held by the client and posted back on each turn, so it must be
 * validated as untrusted input. The system prompt is always injected server-side and
 * is deliberately NOT accepted here.
 */
export const chatMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    content: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().max(CHAT_MESSAGE_MAX_LENGTH * 4).nullable(),
    tool_calls: z.array(chatToolCallSchema).max(10).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.string().max(120_000),
    tool_call_id: z.string().min(1),
  }),
]);

/** A confirmation-required action the user just accepted or rejected. */
export const resolvedActionSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.unknown()),
  approved: z.boolean(),
});

export const chatRequestSchema = z.object({
  model: z.string().trim().min(1, "Pick a model first."),
  messages: z
    .array(chatMessageSchema)
    .min(1, "Send a message to start.")
    .max(CHAT_HISTORY_MAX_MESSAGES, "This conversation is too long. Start a new chat."),
  /** Repository context for the turn, so the agent knows what it is looking at. */
  source: sourceResourceNameSchema.optional(),
  branch: z.string().trim().max(255).optional(),
  resolvedAction: resolvedActionSchema.optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export const selectedModelSchema = z.object({
  model: z.string().trim().min(1).max(200),
});
