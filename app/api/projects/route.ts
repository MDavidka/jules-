import { NextResponse } from "next/server";

import {
  handleRouteError,
  jsonError,
  parseJsonBody,
  searchParamsToObject,
} from "@/lib/api-response.server";
import { listProjects, upsertProject } from "@/lib/projects.server";
import { createProjectSchema, PROJECT_STATUS_VALUES } from "@/lib/validators";
import type { ProjectStatus } from "@/types/projects";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects?status=active
 *
 * Lists projects, newest activity first. The Projects tab requests `status=active`
 * so only work actually in flight is shown there.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { status } = searchParamsToObject(searchParams);

    if (status && !PROJECT_STATUS_VALUES.includes(status as ProjectStatus)) {
      return jsonError("Unknown project status filter.", 422, { code: "VALIDATION_ERROR" });
    }

    const items = await listProjects(status as ProjectStatus | undefined);

    return NextResponse.json(
      { items, activeCount: items.filter((project) => project.status === "active").length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/projects
 *
 * Creates or updates the project for a repository. Idempotent on `source`, so the
 * agent can call it repeatedly while learning more about the work.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("The project is invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const project = await upsertProject(parsed.data);

    return NextResponse.json(
      { project },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
