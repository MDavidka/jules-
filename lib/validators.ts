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

export const PROMPT_MIN_LENGTH = 1;
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
/*                              Memory (Jules DeepDive)                               */
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
/*                            Preferences (Jules DeepDive)                            */
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
