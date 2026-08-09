import { NextResponse } from "next/server";

import {
  handleRouteError,
  jsonError,
  searchParamsToObject,
  sessionResourceName,
} from "@/lib/api-response.server";
import { listActivities, normalizeActivity } from "@/lib/jules-client.server";
import { listActivitiesQuerySchema, sessionResourceNameSchema } from "@/lib/validators";
import type { NormalizedActivity, PaginatedResult, Plan } from "@/types/jules";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/[sessionName]/activities
 *
 * Proxies Jules `sessions.activities.list`. This is the real source of
 * "real-time" progress: the client polls it every 4s for active sessions.
 * Activities are returned oldest-first so the timeline reads top to bottom.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionName: string }> },
) {
  try {
    const { sessionName } = await context.params;
    const parsedName = sessionResourceNameSchema.safeParse(sessionResourceName(sessionName));

    if (!parsedName.success) {
      return jsonError("Invalid session name.", 422, { code: "VALIDATION_ERROR" });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = listActivitiesQuerySchema.safeParse(searchParamsToObject(searchParams));
    if (!parsedQuery.success) {
      return jsonError("Invalid query parameters.", 422, { code: "VALIDATION_ERROR" });
    }

    const upstream = await listActivities(parsedName.data, {
      pageSize: parsedQuery.data.pageSize ?? 100,
      pageToken: parsedQuery.data.pageToken,
      signal: request.signal,
    });

    const items = (upstream.activities ?? [])
      .map(normalizeActivity)
      .sort((a, b) => (a.createTime ?? "").localeCompare(b.createTime ?? ""));

    // The most recent generated plan drives the approval UI.
    const latestPlan: Plan | null =
      [...items].reverse().find((activity) => activity.kind === "planGenerated")?.plan ?? null;

    const approvedPlanIds = items
      .filter((activity) => activity.kind === "planApproved")
      .map((activity) => activity.planId)
      .filter((planId): planId is string => Boolean(planId));

    const payload: PaginatedResult<NormalizedActivity> & {
      latestPlan: Plan | null;
      approvedPlanIds: string[];
    } = {
      items,
      nextPageToken: upstream.nextPageToken ?? null,
      latestPlan,
      approvedPlanIds,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
