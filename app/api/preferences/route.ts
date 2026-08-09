import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { AppProfile, APP_PROFILE_ID, connectToDatabase, getAppProfile } from "@/lib/mongodb.server";
import { updatePreferencesSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/**
 * Automation defaults applied to newly created Jules sessions.
 * Stored locally in MongoDB (Jules has no preferences resource).
 */

export async function GET() {
  try {
    const profile = await getAppProfile();

    return NextResponse.json(
      {
        defaultAutomationMode: profile?.defaultAutomationMode ?? "AUTOMATION_MODE_UNSPECIFIED",
        defaultRequirePlanApproval: profile?.defaultRequirePlanApproval ?? false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Those preferences are invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    await connectToDatabase();
    const updated = await AppProfile.findByIdAndUpdate(
      APP_PROFILE_ID,
      { $set: parsed.data, $setOnInsert: { _id: APP_PROFILE_ID } },
      { upsert: true, new: true },
    )
      .lean()
      .exec();

    return NextResponse.json(
      {
        defaultAutomationMode: updated?.defaultAutomationMode ?? "AUTOMATION_MODE_UNSPECIFIED",
        defaultRequirePlanApproval: updated?.defaultRequirePlanApproval ?? false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
