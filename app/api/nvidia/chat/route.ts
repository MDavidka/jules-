import type { AgentActivity } from "@/lib/agent-activity";
import { createMemoryBlockFilter, MEMORY_BLOCK_INSTRUCTIONS, saveMemoryCards } from "@/lib/agent-memory.server";
import { runDeepResearch } from "@/lib/agent-research.server";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { connectToDatabase, ConversationMessage } from "@/lib/mongodb.server";
import {
  extractPublicRepositoryLinks,
} from "@/lib/nvidia-tools.server";
import {
  listActivities,
  listSessions,
  normalizeActivity,
  normalizeSession,
} from "@/lib/jules-client.server";
import type { NormalizedActivity, NormalizedSession } from "@/types/jules";
import { callRepositoryMcpTool } from "@/lib/repository-mcp.server";
import { loadNvidiaApiKey, NVIDIA_CHAT_COMPLETIONS_URL } from "@/lib/nvidia.server";
import { rateLimitedFetch } from "@/lib/rate-limiter.server";
import { errorMessage } from "@/lib/utils";
import { DEFAULT_NVIDIA_MODEL_ID, NVIDIA_MODELS } from "@/lib/nvidia-models";
import {
  MAX_REPOSITORY_TARGETS,
  MAX_RESEARCH_REPOSITORIES,
  sourceResourceNameSchema,
} from "@/lib/validators";

const MODEL_IDS: ReadonlySet<string> = new Set(NVIDIA_MODELS.map((item) => item.id));
const MAX_IMAGE_DATA_URL_LENGTH = 4_500_000;

const SYSTEM_PROMPT = [
  "You are the Jules DeepDive project assistant.",
  "Answer in concise markdown, using the repository context, research findings, attached files, and image analysis provided with the request.",
  "Cite concrete file paths, commands, versions, and URLs from that context, and say so plainly when something is unknown.",
  "Never start or stop a Jules session without first proposing an explicit confirmation step.",
  "When a repository is selected, always reference specific file paths and code patterns from the exact raw source context before suggesting any implementation.",
  "Use the read-only GitHub MCP context to inspect the actual source code; do not tell the user to start a Jules session merely to understand or investigate code.",
  "Use historical Jules session context when provided to avoid repeating work and to connect current findings to earlier plans, failures, commands, and changed files.",
  "Use saved memory notes as authoritative context about the project. If memory mentions conventions or patterns, follow them in your suggestions.",
  "When suggesting a Jules fix session, incorporate relevant memory context into the fix prompt to give Jules maximum understanding.",
  "Reference previous conversation context provided to maintain continuity. Avoid repeating explanations already given in earlier messages.",
  MEMORY_BLOCK_INSTRUCTIONS,
].join(" ");

export const dynamic = "force-dynamic";

interface IncomingAttachment {
  name: string;
  type: string;
  content?: string;
  dataUrl?: string;
  isPromptAttachment?: boolean;
}

interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export async function POST(request: Request) {
  try {
    const body = (await parseJsonBody(request)) as {
      prompt?: unknown;
      model?: unknown;
      history?: unknown;
      source?: unknown;
      branch?: unknown;
      memoryContext?: unknown;
      attachments?: unknown;
      researchRepositories?: unknown;
      deepResearch?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const requestedModel = typeof body.model === "string" ? body.model : "";
    const model = MODEL_IDS.has(requestedModel) ? requestedModel : DEFAULT_NVIDIA_MODEL_ID;
    if (!prompt) return jsonError("Type a message to send.", 422, { code: "VALIDATION_ERROR" });

    const apiKey = await loadNvidiaApiKey();
    if (!apiKey) return jsonError("Configure an NVIDIA API key in Settings first.", 503, { code: "NVIDIA_KEY_MISSING" });

    const history: ProviderMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((item): item is { role: "user" | "assistant"; content: string } =>
            Boolean(item && typeof item === "object" && "role" in item && "content" in item &&
              ((item as { role?: unknown }).role === "user" || (item as { role?: unknown }).role === "assistant") &&
              typeof (item as { content?: unknown }).content === "string"),
          )
          .slice(-12)
          .map((item) => ({ role: item.role, content: item.content.slice(0, 20_000) }))
      : [];
    const source = typeof body.source === "string" ? body.source : "";
    const branch = typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : undefined;
    const memoryContext = typeof body.memoryContext === "string" ? body.memoryContext.trim().slice(0, 24_000) : "";
    const attachments = normalizeAttachments(body.attachments);
    const researchRepositories = normalizeResearchRepositories(body.researchRepositories);
    const promptAttachment = attachments.find((attachment) => attachment.isPromptAttachment && attachment.content);
    // Long composer messages arrive as a markdown attachment so the model gets
    // the complete request without relying on a large inline prompt field.
    const intentPrompt = promptAttachment?.content?.trim() || prompt;
    const invalidImage = attachments.find((attachment) => attachment.type.startsWith("image/") && !isSafeImageDataUrl(attachment.dataUrl));
    if (invalidImage) {
      return jsonError(`The image "${invalidImage.name}" could not be prepared. Use a PNG, JPG, or WEBP image under 4 MB.`, 422, { code: "IMAGE_PREPARATION_FAILED" });
    }
    const oversizedImage = attachments.find((attachment) => attachment.type.startsWith("image/") && (attachment.dataUrl?.length ?? 0) > MAX_IMAGE_DATA_URL_LENGTH);
    if (oversizedImage) {
      return jsonError(`The image "${oversizedImage.name}" is too large after compression.`, 413, { code: "IMAGE_TOO_LARGE" });
    }

    const deepResearch = body.deepResearch === true || shouldRunDeepResearch(intentPrompt);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        /** Every chunk is one newline-delimited JSON event. */
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        const sendStatus = (activity: AgentActivity) => send({ type: "status", activity });

        try {
          sendStatus("thinking");

          const fileContext = attachments
            .filter((attachment) => attachment.content)
            .map((attachment) => `Attached file: ${attachment.name}\n${attachment.content}`)
            .join("\n\n");

          let imageContext = "";
          if (attachments.some((attachment) => attachment.type.startsWith("image/"))) {
            sendStatus("reading");
            imageContext = await describeImages(attachments, apiKey);
          }

          const repositoryInputs = [...new Set([
            ...(source ? [source] : []),
            ...researchRepositories,
            ...extractPublicRepositoryLinks(intentPrompt),
          ])].slice(0, MAX_REPOSITORY_TARGETS);

          let repositoryEvidence = { text: "", filesRead: 0 };
          if (repositoryInputs.length > 0) {
            sendStatus("inspecting");
            repositoryEvidence = await collectRepositoryEvidence(repositoryInputs, intentPrompt);
          }

          // Deep traversal runs independently for each selected repository so
          // the research model cannot accidentally treat one codebase as another.
          let deepFindings = "";
          if (deepResearch) {
            const deepTargets = repositoryInputs.length > 0 ? repositoryInputs : [undefined];
            const findings = await Promise.all(
              deepTargets.map(async (repository) => {
                const scopedPrompt = repository
                  ? `Research only this repository: ${repository}. Use its repository tools to understand how it works, then investigate this request. Exact source files must be read before you summarize:\n${intentPrompt}`
                  : intentPrompt;
                return {
                  repository,
                  findings: await runDeepResearch({
                    apiKey,
                    model,
                    prompt: scopedPrompt,
                    source: repository,
                    onActivity: sendStatus,
                  }),
                };
              }),
            );
            deepFindings = findings
              .filter((item) => item.findings)
              .map((item) => item.repository ? `Research findings for ${item.repository}:\n${item.findings}` : item.findings)
              .join("\n\n");
          }

          const julesSessionContext = source
            ? await collectRecentJulesSessionContext(repositoryInputs)
            : "";

          sendStatus("working");

          // Fetch older conversation messages for continuity context.
          // Hybrid heuristic: always include the last 3 messages (most recent context),
          // then fill remaining budget with shorter historical messages for efficiency.
          let conversationContext = "";
          try {
            await connectToDatabase();
            const recentMessages = await ConversationMessage.find(
              source ? { source } : { source: null },
            )
              .sort({ createdAt: -1 })
              .limit(10)
              .lean<Array<{ role: string; content: string; tokenEstimate: number; createdAt: Date }>>()
              .exec();

            if (recentMessages.length > 0) {
              // Always keep the last 3 messages regardless of length for recency
              const alwaysInclude = recentMessages.slice(0, 3);
              // From the remaining older messages, prefer shorter ones for budget efficiency
              const older = recentMessages.slice(3);
              const shorterOlder = [...older]
                .sort((a, b) => a.tokenEstimate - b.tokenEstimate)
                .slice(0, 5);

              const prioritized = [...alwaysInclude, ...shorterOlder];
              // Sort final set chronologically (oldest first) for natural reading order
              prioritized.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

              conversationContext =
                "Previous conversation (for continuity):\n" +
                prioritized
                  .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
                  .join("\n");
            }
          } catch {
            // DB failures must not block the response
          }

          const userContent = [
            prompt,
            memoryContext ? `Known project memory:\n${memoryContext}` : "",
            conversationContext,
            repositoryEvidence.text,
            deepFindings,
            julesSessionContext,
            fileContext,
            imageContext,
          ]
            .filter(Boolean)
            .join("\n\n");

          const response = await rateLimitedFetch(NVIDIA_CHAT_COMPLETIONS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              stream: true,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...history,
                { role: "user", content: userContent },
              ],
              temperature: 0.2,
              max_tokens: 1600,
            }),
          });
          if (!response.ok || !response.body) {
            if (response.status === 429) {
              sendStatus("waiting");
            }
            const data = (await response.json().catch(() => null)) as { message?: unknown } | null;
            throw new Error(
              typeof data?.message === "string" ? data.message : `The model request failed (${response.status}).`,
            );
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const memoryFilter = createMemoryBlockFilter();
          let buffer = "";
          let emittedToken = false;
          let fullResponse = "";

          const processLine = (line: string) => {
            if (!line.startsWith("data:")) return;
            const value = line.slice(5).trim();
            if (!value || value === "[DONE]") return;

            const payload = JSON.parse(value) as {
              error?: { message?: string };
              choices?: Array<{ delta?: { content?: unknown } }>;
            };
            if (payload.error) throw new Error(payload.error.message ?? "The model returned an error.");

            const token = payload.choices?.[0]?.delta?.content;
            if (typeof token !== "string" || token.length === 0) return;

            emittedToken = true;
            fullResponse += token;
            const visible = memoryFilter.push(token);
            if (visible) send({ type: "token", value: visible });
          };

          while (true) {
            const result = await reader.read();
            if (result.done) break;
            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) processLine(line);
          }
          buffer += decoder.decode();
          if (buffer.trim()) processLine(buffer.trim());

          const trailing = memoryFilter.flush();
          if (trailing) send({ type: "token", value: trailing });
          if (!emittedToken) throw new Error("The model returned an empty response.");

          // Emit jules_fix_proposal AFTER the response is fully streamed
          if (
            repositoryInputs.length <= 1 &&
            (researchRepositories.length === 0 || researchRepositories.includes(source)) &&
            repositoryEvidence.filesRead > 0 &&
            shouldOfferJulesFix(intentPrompt, source)
          ) {
            send({
              type: "jules_fix_proposal",
              proposal: {
                prompt: buildJulesFixPrompt({
                  userRequest: intentPrompt,
                  source,
                  branch,
                  memoryContext,
                  repositoryEvidence: repositoryEvidence.text,
                  julesSessionContext,
                }),
                source,
                branch,
                title: buildFixTitle(prompt, source),
              },
            });
          }

          // Persist anything the model wrote to the memory board.
          const memoryBlock = memoryFilter.memoryBlock();
          if (memoryBlock) {
            sendStatus("saving");
            const saved = await saveMemoryCards(memoryBlock, source || null);
            if (saved > 0) send({ type: "memory", saved });
          }

          // Save conversation messages for agentic memory
          try {
            await connectToDatabase();
            const sourceValue = source || null;
            await ConversationMessage.insertMany([
              {
                role: "user",
                content: intentPrompt.slice(0, 20000),
                source: sourceValue,
                summary: null,
                tokenEstimate: Math.ceil(intentPrompt.length / 4),
              },
              {
                role: "assistant",
                content: fullResponse.slice(0, 20000),
                source: sourceValue,
                summary: null,
                tokenEstimate: Math.ceil(fullResponse.length / 4),
              },
            ]);
          } catch {
            // Failures saving conversation history must not break the response
          }

          sendStatus("done");
          send({ type: "done" });
          controller.close();
        } catch (error) {
          // The client renders this instead of a partial reply.
          send({ type: "error", message: errorMessage(error, "The assistant request failed.") });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function describeImages(attachments: IncomingAttachment[], apiKey: string) {
  const imageParts = attachments
    .filter((attachment) => attachment.type.startsWith("image/") && isSafeImageDataUrl(attachment.dataUrl))
    .map((attachment) => ({
      type: "image_url",
      image_url: { url: attachment.dataUrl },
    }));
  if (imageParts.length === 0) return "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "nvidia/nemotron-nano-12b-v2-vl",
          stream: false,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Describe the attached image(s) for a software engineering assistant. Include visible text, errors, UI details, and relevant code or diagrams. Be concise and factual." },
              ...imageParts,
            ],
          }],
          temperature: 0.1,
          max_tokens: 1200,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Vision model request failed (${response.status})${details ? `: ${details.slice(0, 240)}` : ""}`);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const description = data.choices?.[0]?.message?.content;
    if (typeof description !== "string" || !description.trim()) {
      throw new Error("Vision model returned no description.");
    }
    return `Image analysis from the visual model:\n${description.trim().slice(0, 20_000)}`;
  } catch (error) {
    return `Image analysis unavailable: ${errorMessage(error, "the visual model could not load the image")}. The main assistant can still answer from the prompt and attached filename.`;
  }
}

function normalizeAttachments(value: unknown): IncomingAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is IncomingAttachment =>
      Boolean(item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && typeof (item as { type?: unknown }).type === "string"),
    )
    .slice(0, 5)
    .map((item) => ({
      name: item.name.slice(0, 200),
      type: item.type.slice(0, 120),
      content: typeof item.content === "string" ? item.content.slice(0, 200_000) : undefined,
      dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : undefined,
      isPromptAttachment: item.isPromptAttachment === true,
    }));
}

function normalizeResearchRepositories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) =>
        item.startsWith("sources/github/") && sourceResourceNameSchema.safeParse(item).success,
      ),
  )].slice(0, MAX_RESEARCH_REPOSITORIES);
}

function isSafeImageDataUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}


function shouldOfferJulesFix(prompt: string, source: string) {
  return Boolean(
    source.startsWith("sources/github/") &&
    /\b(fix|repair|resolve|patch|implement|apply|modify|change)\b/i.test(prompt),
  );
}

function shouldRunDeepResearch(prompt: string) {
  return /\b(deep|research|search|web|documentation|docs|investigate|trace|analy[sz]e|explore|audit|walk through)\b/i.test(prompt);
}

function buildFixTitle(prompt: string, source: string) {
  const compact = prompt.replace(/\s+/g, " ").trim().replace(/^fix:\s*/i, "");
  const repository = source.replace(/^sources\/github\//, "") || "repository";
  return `Investigate and fix ${repository}: ${compact.slice(0, 120)}`;
}

function buildJulesFixPrompt({
  userRequest,
  source,
  branch,
  memoryContext,
  repositoryEvidence,
  julesSessionContext,
}: {
  userRequest: string;
  source: string;
  branch?: string;
  memoryContext: string;
  repositoryEvidence: string;
  julesSessionContext: string;
}) {
  const repository = source.replace(/^sources\/github\//, "") || "the selected repository";
  const selectedBranch = branch || "the repository default branch";
  const memorySection = memoryContext
    ? `Known project memory (use it as context, not as a substitute for inspecting the code):\n${memoryContext}`
    : "No saved project memory was attached. Inspect the repository and establish the relevant conventions before editing.";

  const evidenceSection = repositoryEvidence
    ? `Exact raw source evidence already collected through read-only GitHub MCP:\n${repositoryEvidence.slice(0, 12_000)}`
    : "No exact repository evidence was collected.";
  const historicalSection = julesSessionContext
    ? `Historical Jules session context already collected (do not repeat completed work blindly):\n${julesSessionContext.slice(0, 8_000)}`
    : "No matching historical Jules session context was available.";

  return [
    "Act as the implementation engineer for a repository fix.",
    `Repository: ${repository}`,
    `Working branch: ${selectedBranch}`,
    "",
    "Objective",
    "Diagnose and resolve the problem described below. Do not merely restate or copy the report: inspect the repository, identify the actual root cause, and implement the smallest complete production-quality fix.",
    "",
    `User-reported problem:\n${userRequest}`,
    "",
    memorySection,
    "",
    evidenceSection,
    "",
    historicalSection,
    "",
    "Required approach",
    "1. Inspect the relevant code paths, configuration, and existing patterns before making changes.",
    "2. Reproduce or reason through the failure and identify its root cause.",
    "3. Implement a focused fix that preserves existing behavior outside this issue.",
    "4. Update related UI, API, types, or documentation when the fix requires it.",
    "5. Run the most relevant available checks and report their results, including any environment limitations.",
    "6. Summarize the root cause, changed files, verification, and any follow-up risks.",
    "",
    "Acceptance criteria",
    "- The reported problem is resolved rather than hidden or bypassed.",
    "- The implementation follows the repository's existing architecture and conventions.",
    "- Existing functionality remains intact.",
    "- Verification evidence is included in the final report.",
  ].join("\n");
}


interface RepositoryEvidence {
  text: string;
  filesRead: number;
}

async function collectRepositoryEvidence(repositories: string[], prompt: string): Promise<RepositoryEvidence> {
  const results = await Promise.all(repositories.map(async (repository) => {
    const treeOutput = await callRepositoryMcpTool("list_repository_files", { repository, limit: 400 });
    const paths = selectRelevantRepositoryPaths(treeOutput, prompt);
    const reads = await Promise.all(
      paths.slice(0, 3).map(async (path) => ({
        path,
        output: await callRepositoryMcpTool("read_repository_file", { repository, path }),
      })),
    );

    return {
      repository,
      treeOutput,
      reads,
      filesRead: reads.filter((item) => !item.output.startsWith("Repository MCP request failed") && !item.output.startsWith("Could not read")).length,
    };
  }));

  return {
    filesRead: results.reduce((total, result) => total + result.filesRead, 0),
    text: results
      .map((result) => [
        `Exact GitHub source context for ${result.repository}:`,
        `Repository file tree:\n${result.treeOutput}`,
        ...result.reads.map((item) => `Raw file ${item.path}:\n${item.output}`),
      ].join("\n\n"))
      .join("\n\n")
      .slice(0, 60_000),
  };
}

function selectRelevantRepositoryPaths(treeOutput: string, prompt: string): string[] {
  let files: Array<{ path?: string }> = [];
  try {
    const parsed = JSON.parse(treeOutput) as { files?: Array<{ path?: string }> };
    files = parsed.files ?? [];
  } catch {
    return [];
  }

  const terms = prompt
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((term) => term.length >= 4)
    .slice(0, 20);
  const sourcePattern = /\.(tsx?|jsx?|py|rb|go|rs|java|kt|php|cs|swift|vue|svelte|css|scss)$/i;
  const scored = files
    .filter((file): file is { path: string } => typeof file.path === "string" && sourcePattern.test(file.path))
    .map((file) => {
      const path = file.path.toLowerCase();
      const score = terms.reduce((total, term) => total + (path.includes(term) ? 3 : 0), 0)
        + (/(^|\/)(src|app|lib|server|api|components)\//.test(path) ? 2 : 0)
        + (/(index|main|server|route|app)\./.test(path) ? 1 : 0);
      return { path: file.path, score };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return scored.slice(0, 3).map((file) => file.path);
}

async function collectRecentJulesSessionContext(repositories: string[]): Promise<string> {
  try {
    const listed = await listSessions({ pageSize: 50 });
    const targetSet = new Set(repositories.filter((repository) => repository.startsWith("sources/github/")));
    const sessions = (listed.sessions ?? [])
      .map(normalizeSession)
      .filter((session) => session.source && (targetSet.size === 0 || targetSet.has(session.source)))
      .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a))
      .slice(0, 4);

    if (sessions.length === 0) return "";

    const contexts = await Promise.all(sessions.map(async (session) => {
      const activities = await listActivities(session.name, { pageSize: 40 });
      const normalized = (activities.activities ?? []).map(normalizeActivity);
      return formatJulesSessionContext(session, normalized);
    }));

    return `Recent Jules session context (historical, read-only):\n${contexts.join("\n\n")}`.slice(0, 24_000);
  } catch {
    return "";
  }
}

function sessionTimestamp(session: NormalizedSession): number {
  return new Date(session.updateTime ?? session.createTime ?? 0).getTime() || 0;
}

function formatJulesSessionContext(session: NormalizedSession, activities: NormalizedActivity[]): string {
  const activityText = activities
    .filter((activity) => activity.body || activity.plan || activity.failureReason || activity.artifacts.length > 0)
    .slice(-12)
    .map((activity) => {
      const details = [
        activity.body,
        activity.failureReason ? `Failure: ${activity.failureReason}` : "",
        activity.plan ? `Plan: ${(activity.plan.steps ?? []).map((step) => step.title ?? step.description ?? "").filter(Boolean).join("; ")}` : "",
        ...activity.artifacts.map((artifact) => artifact.bashOutput?.command ? `Command: ${artifact.bashOutput.command}` : artifact.changeSet?.gitPatch?.suggestedCommitMessage ? `Patch: ${artifact.changeSet.gitPatch.suggestedCommitMessage}` : ""),
      ].filter(Boolean);
      return `- ${activity.title}: ${details.join(" | ").slice(0, 1200)}`;
    })
    .join("\n");

  return [
    `Session: ${session.title}`,
    `Repository: ${session.source ?? "unknown"}`,
    `State: ${session.state}; branch: ${session.branch ?? "default"}`,
    `Original task: ${session.prompt.slice(0, 1600)}`,
    activityText ? `Activities:\n${activityText}` : "",
  ].filter(Boolean).join("\n");
}
