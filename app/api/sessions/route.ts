import { NextResponse } from "next/server";

import {
  handleRouteError,
  jsonError,
  parseJsonBody,
  searchParamsToObject,
} from "@/lib/api-response.server";
import {
  createSession,
  getSource,
  listSessions,
  normalizeSession,
  normalizeSource,
} from "@/lib/jules-client.server";
import { getAppProfile } from "@/lib/mongodb.server";
import { createSessionSchema, listSessionsQuerySchema } from "@/lib/validators";
import type {
  AutomationMode,
  CreateSessionRequest,
  NormalizedSession,
  PaginatedResult,
} from "@/types/jules";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions
 *
 * Proxies Jules `sessions.list` and normalizes each session for the frontend
 * (status bucket, title/prompt preview, timestamps, source, branch, PR URL,
 * plan-approval state).
 *
 * NOTE: upstream `sessions.list` supports ONLY `pageSize` and `pageToken` - it
 * has no filter parameter. The optional `source` query param is therefore
 * applied here, after the page is fetched.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = listSessionsQuerySchema.safeParse(searchParamsToObject(searchParams));

    if (!parsed.success) {
      return jsonError("Invalid query parameters.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const { pageSize, pageToken, source } = parsed.data;

    const upstream = await listSessions({
      pageSize: pageSize ?? 50,
      pageToken,
      signal: request.signal,
    });

    let items = (upstream.sessions ?? [])
      .map(normalizeSession)
      .filter((session) => session.name.length > 0);

    if (source) {
      items = items.filter((session) => session.source === source);
    }

    // Newest activity first.
    items.sort((a, b) => {
      const left = a.updateTime ?? a.createTime ?? "";
      const right = b.updateTime ?? b.createTime ?? "";
      return right.localeCompare(left);
    });

    const payload: PaginatedResult<NormalizedSession> & { activeCount: number } = {
      items,
      nextPageToken: upstream.nextPageToken ?? null,
      activeCount: items.filter((session) => session.isActive || session.activity === "waiting")
        .length,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/sessions
 *
 * Creates a new Jules session. Returns the created session immediately - the
 * work itself runs asynchronously on Jules, so this only confirms submission.
 */
function normalizeSessionInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  const source = typeof body.source === "string" ? body.source.trim() : body.source;
  if (typeof source !== "string" || source.startsWith("sources/")) return value;
  if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(source)) {
    return { ...body, source: `sources/github/${source}` };
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = createSessionSchema.safeParse(normalizeSessionInput(body));

    if (!parsed.success) {
      return jsonError("The task could not be submitted.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
          const key = issue.path.join(".") || "_";
          if (!acc[key]) acc[key] = issue.message;
          return acc;
        }, {}),
      });
    }

    const { prompt, source, branch, title, automationMode, requirePlanApproval } = parsed.data;

    // Fall back to the user's saved Automations defaults when unspecified.
    const profile = await getAppProfile();
    const resolvedAutomationMode =
      automationMode ?? ((profile?.defaultAutomationMode as AutomationMode | undefined) || undefined);
    const resolvedRequireApproval =
      requirePlanApproval ?? profile?.defaultRequirePlanApproval ?? undefined;

    /**
     * `GitHubRepoContext.startingBranch` is required upstream, so when the
     * client does not choose a branch we resolve the repository's default.
     */
    let startingBranch = branch;
    if (!startingBranch) {
      const resolvedSource = normalizeSource(await getSource(source, request.signal));
      startingBranch = resolvedSource.defaultBranch ?? undefined;

      if (!startingBranch) {
        return jsonError(
          "Jules did not report a default branch for this repository. Pick a branch explicitly.",
          422,
          { code: "BRANCH_REQUIRED" },
        );
      }
    }

    const payload: CreateSessionRequest = {
      prompt,
      sourceContext: {
        source,
        githubRepoContext: { startingBranch },
      },
      ...(title ? { title } : {}),
      ...(resolvedAutomationMode && resolvedAutomationMode !== "AUTOMATION_MODE_UNSPECIFIED"
        ? { automationMode: resolvedAutomationMode }
        : {}),
      ...(resolvedRequireApproval !== undefined
        ? { requirePlanApproval: resolvedRequireApproval }
        : {}),
    };

    const created = await createSession(payload);

    return NextResponse.json(
      {
        session: normalizeSession(created),
        // Explicitly communicates async semantics: submitted, not finished.
        submitted: true,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
