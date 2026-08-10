import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { connectToDatabase, Project as ProjectModel } from "@/lib/mongodb.server";
import type { ProjectDoc } from "@/lib/mongodb.server";
import { serializeProject } from "@/lib/projects.server";
import { updateProjectSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function invalidId() {
  return jsonError("That project id is not valid.", 422, { code: "VALIDATION_ERROR" });
}

/** PATCH /api/projects/[id] - rename, re-branch, re-status, or append facts. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return invalidId();

    const body = await parseJsonBody(request);
    const parsed = updateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("The update is invalid.", 422, {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => issue.message),
      });
    }

    await connectToDatabase();
    const project = await ProjectModel.findById(id).exec();

    if (!project) {
      return jsonError("That project no longer exists.", 404, { code: "NOT_FOUND" });
    }

    const { name, branch, summary, status, facts } = parsed.data;
    const now = new Date();

    if (name !== undefined) project.name = name;
    if (branch !== undefined) project.branch = branch;
    if (summary !== undefined) project.summary = summary;
    if (status !== undefined) project.status = status;

    // Facts append (replacing any same-label entry) rather than overwrite the list.
    for (const fact of facts ?? []) {
      const index = project.facts.findIndex(
        (candidate) => candidate.label.toLowerCase() === fact.label.toLowerCase(),
      );

      if (index >= 0) project.facts[index] = { ...fact, recordedAt: now };
      else project.facts.push({ ...fact, recordedAt: now });
    }

    project.lastActivityAt = now;
    await project.save();

    return NextResponse.json(
      { project: serializeProject(project.toObject() as ProjectDoc) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/projects/[id] - removes the project record only, never the repo. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return invalidId();

    await connectToDatabase();
    const result = await ProjectModel.findByIdAndDelete(id).exec();

    if (!result) {
      return jsonError("That project no longer exists.", 404, { code: "NOT_FOUND" });
    }

    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
