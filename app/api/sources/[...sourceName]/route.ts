import { NextResponse } from "next/server";

import {
  handleRouteError,
  jsonError,
  resourceNameFromSegments,
} from "@/lib/api-response.server";
import { getSource, normalizeSource } from "@/lib/jules-client.server";
import { sourceResourceNameSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/[...sourceName]
 *
 * Retrieves a single source, including its branch list when Jules returns one.
 * The catch-all segments rebuild the full resource name, e.g. a request to
 * `/api/sources/github/owner/repo` maps to `sources/github/owner/repo`.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ sourceName: string[] }> },
) {
  try {
    const { sourceName: segments } = await context.params;
    const resourceName = resourceNameFromSegments("sources", segments);

    const parsed = sourceResourceNameSchema.safeParse(resourceName);
    if (!parsed.success) {
      return jsonError("Invalid source name.", 422, { code: "VALIDATION_ERROR" });
    }

    const source = await getSource(parsed.data, request.signal);
    const normalized = normalizeSource(source);

    return NextResponse.json(normalized, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
