import { NextResponse } from "next/server";

import { handleRouteError, jsonError, searchParamsToObject } from "@/lib/api-response.server";
import { listSources, normalizeSource } from "@/lib/jules-client.server";
import { listSourcesQuerySchema } from "@/lib/validators";
import type { NormalizedSource, PaginatedResult } from "@/types/jules";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources
 *
 * Proxies Jules `sources.list`. Supports `pageSize`, `pageToken` and the
 * upstream AIP-160 `filter` (name-only filtering).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = listSourcesQuerySchema.safeParse(searchParamsToObject(searchParams));

    if (!parsed.success) {
      return jsonError("Invalid query parameters.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    const { pageSize, pageToken, filter } = parsed.data;

    const upstream = await listSources({
      pageSize: pageSize ?? 100,
      pageToken,
      filter,
      signal: request.signal,
    });

    const items = (upstream.sources ?? [])
      .map(normalizeSource)
      .filter((source) => source.name.length > 0)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const payload: PaginatedResult<NormalizedSource> = {
      items,
      nextPageToken: upstream.nextPageToken ?? null,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
