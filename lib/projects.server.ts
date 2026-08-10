import "server-only";

import { connectToDatabase, Project as ProjectModel } from "@/lib/mongodb.server";
import type { ProjectDoc, ProjectStatus } from "@/lib/mongodb.server";
import type { Project } from "@/types/projects";

/**
 * Project persistence shared by the `/api/projects` routes and the agent tools, so
 * both write the same shape and the tab never disagrees with what the agent saved.
 */

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function serializeProject(doc: ProjectDoc): Project {
  const sessions = (doc.sessions ?? []).map((session) => ({
    name: session.name,
    title: session.title ?? null,
    startedAt: iso(session.startedAt),
    stoppedAt: iso(session.stoppedAt),
  }));

  return {
    id: doc._id.toString(),
    name: doc.name,
    source: doc.source,
    sourceFullName: doc.sourceFullName ?? null,
    branch: doc.branch ?? null,
    status: doc.status,
    summary: doc.summary ?? null,
    facts: (doc.facts ?? []).map((fact) => ({
      label: fact.label,
      value: fact.value,
      recordedAt: iso(fact.recordedAt),
    })),
    sessions,
    runningSessionCount: sessions.filter((session) => !session.stoppedAt).length,
    lastActivityAt: iso(doc.lastActivityAt),
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

/** Derives `owner/repo` from a Jules source resource name. */
export function sourceFullNameFrom(source: string): string {
  return source.replace(/^sources\/github\//, "").replace(/^sources\//, "");
}

export async function listProjects(status?: ProjectStatus): Promise<Project[]> {
  await connectToDatabase();

  const docs = await ProjectModel.find(status ? { status } : {})
    .sort({ lastActivityAt: -1 })
    .limit(200)
    .lean<ProjectDoc[]>()
    .exec();

  return docs.map(serializeProject);
}

export async function findProjectBySource(source: string): Promise<Project | null> {
  await connectToDatabase();
  const doc = await ProjectModel.findOne({ source }).lean<ProjectDoc>().exec();
  return doc ? serializeProject(doc) : null;
}

export interface UpsertProjectInput {
  name: string;
  source: string;
  branch?: string | null;
  summary?: string | null;
  status?: ProjectStatus;
  /** Appended to any existing facts rather than replacing them. */
  facts?: { label: string; value: string }[];
}

/**
 * Creates or updates the project for a source. Keyed on `source` (unique index) so
 * the agent can call this repeatedly across a conversation without creating
 * duplicates. Facts accumulate; same-label facts are replaced in place.
 */
export async function upsertProject(input: UpsertProjectInput): Promise<Project> {
  await connectToDatabase();

  const now = new Date();
  const existing = await ProjectModel.findOne({ source: input.source }).exec();

  if (!existing) {
    const created = await ProjectModel.create({
      name: input.name,
      source: input.source,
      sourceFullName: sourceFullNameFrom(input.source),
      branch: input.branch ?? null,
      summary: input.summary ?? null,
      status: input.status ?? "active",
      facts: (input.facts ?? []).map((fact) => ({ ...fact, recordedAt: now })),
      sessions: [],
      lastActivityAt: now,
    });

    return serializeProject(created.toObject() as ProjectDoc);
  }

  if (input.name) existing.name = input.name;
  if (input.branch !== undefined) existing.branch = input.branch;
  if (input.summary !== undefined && input.summary !== null) existing.summary = input.summary;
  if (input.status) existing.status = input.status;

  for (const fact of input.facts ?? []) {
    const index = existing.facts.findIndex(
      (candidate) => candidate.label.toLowerCase() === fact.label.toLowerCase(),
    );

    if (index >= 0) {
      existing.facts[index] = { ...fact, recordedAt: now };
    } else {
      existing.facts.push({ ...fact, recordedAt: now });
    }
  }

  // Keep the fact list bounded so one long conversation cannot grow it forever.
  if (existing.facts.length > 100) {
    existing.facts = existing.facts.slice(-100);
  }

  existing.lastActivityAt = now;
  await existing.save();

  return serializeProject(existing.toObject() as ProjectDoc);
}

/** Records a Jules session against the project for a source. */
export async function attachSessionToProject(params: {
  source: string;
  sessionName: string;
  title?: string | null;
  /** Used to auto-create the project when the agent starts a task without one. */
  projectName?: string;
  branch?: string | null;
}): Promise<Project | null> {
  await connectToDatabase();

  const now = new Date();
  let project = await ProjectModel.findOne({ source: params.source }).exec();

  if (!project) {
    project = await ProjectModel.create({
      name: params.projectName ?? sourceFullNameFrom(params.source),
      source: params.source,
      sourceFullName: sourceFullNameFrom(params.source),
      branch: params.branch ?? null,
      status: "active",
      facts: [],
      sessions: [],
      lastActivityAt: now,
    });
  }

  if (!project.sessions.some((session) => session.name === params.sessionName)) {
    project.sessions.push({
      name: params.sessionName,
      title: params.title ?? null,
      startedAt: now,
      stoppedAt: null,
    });
  }

  // Starting work makes a project active again.
  project.status = "active";
  project.lastActivityAt = now;
  await project.save();

  return serializeProject(project.toObject() as ProjectDoc);
}

/**
 * Marks a tracked session as stopped. Returns the owning project, or null when the
 * session is not tracked by any project.
 */
export async function markSessionStopped(sessionName: string): Promise<Project | null> {
  await connectToDatabase();

  const project = await ProjectModel.findOne({ "sessions.name": sessionName }).exec();
  if (!project) return null;

  const now = new Date();
  const session = project.sessions.find((candidate) => candidate.name === sessionName);
  if (session) session.stoppedAt = now;

  // With nothing left running, the project is paused rather than active.
  if (project.sessions.every((candidate) => candidate.stoppedAt)) {
    project.status = "paused";
  }

  project.lastActivityAt = now;
  await project.save();

  return serializeProject(project.toObject() as ProjectDoc);
}
