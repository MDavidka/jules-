import type { AgentActivity } from "@/lib/agent-activity";
import { createMemoryBlockFilter, MEMORY_BLOCK_INSTRUCTIONS, saveMemoryCards } from "@/lib/agent-memory.server";
import { runDeepResearch } from "@/lib/agent-research.server";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { extractPublicRepositoryLinks, inspectPublicRepository } from "@/lib/nvidia-tools.server";
import { loadNvidiaApiKey, NVIDIA_CHAT_COMPLETIONS_URL } from "@/lib/nvidia.server";
import { errorMessage } from "@/lib/utils";
import { DEFAULT_NVIDIA_MODEL_ID, NVIDIA_MODELS } from "@/lib/nvidia-models";

const MODEL_IDS: ReadonlySet<string> = new Set(NVIDIA_MODELS.map((item) => item.id));
const MAX_IMAGE_DATA_URL_LENGTH = 4_500_000;

const SYSTEM_PROMPT = [
  "You are the Jules+ project assistant.",
  "Answer in concise markdown, using the repository context, research findings, attached files, and image analysis provided with the request.",
  "Cite concrete file paths, commands, versions, and URLs from that context, and say so plainly when something is unknown.",
  "Never start or stop a Jules session without first proposing an explicit confirmation step.",
  MEMORY_BLOCK_INSTRUCTIONS,
].join(" ");

export const dynamic = "force-dynamic";

interface IncomingAttachment {
  name: string;
  type: string;
  content?: string;
  dataUrl?: string;
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
      attachments?: unknown;
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
    const attachments = normalizeAttachments(body.attachments);
    const invalidImage = attachments.find((attachment) => attachment.type.startsWith("image/") && !isSafeImageDataUrl(attachment.dataUrl));
    if (invalidImage) {
      return jsonError(`The image "${invalidImage.name}" could not be prepared. Use a PNG, JPG, or WEBP image under 4 MB.`, 422, { code: "IMAGE_PREPARATION_FAILED" });
    }
    const oversizedImage = attachments.find((attachment) => attachment.type.startsWith("image/") && (attachment.dataUrl?.length ?? 0) > MAX_IMAGE_DATA_URL_LENGTH);
    if (oversizedImage) {
      return jsonError(`The image "${oversizedImage.name}" is too large after compression.`, 413, { code: "IMAGE_TOO_LARGE" });
    }

    const deepResearch = body.deepResearch !== false;
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

          // Quick pass: always pull context for repositories named in the prompt.
          const repositoryInputs = [...new Set([...(source ? [source] : []), ...extractPublicRepositoryLinks(prompt)])];
          let research = "";
          if (repositoryInputs.length > 0) {
            sendStatus("inspecting");
            const repositoryResearch = await Promise.all(
              repositoryInputs.slice(0, 4).map(async (repository) => inspectPublicRepository(repository)),
            );
            research = `Repository context:\n${repositoryResearch.join("\n\n")}`;
          }

          // Deep pass: let the agent search the web and walk the repo itself.
          let deepFindings = "";
          if (deepResearch) {
            deepFindings = await runDeepResearch({
              apiKey,
              model,
              prompt,
              source: source || undefined,
              onActivity: sendStatus,
            });
          }

          sendStatus("working");

          const userContent = [prompt, research, deepFindings, fileContext, imageContext]
            .filter(Boolean)
            .join("\n\n");

          const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
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

          // Persist anything the model wrote to the memory board.
          const memoryBlock = memoryFilter.memoryBlock();
          if (memoryBlock) {
            sendStatus("saving");
            const saved = await saveMemoryCards(memoryBlock, source || null);
            if (saved > 0) send({ type: "memory", saved });
          }

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
    .slice(0, 4)
    .map((item) => ({
      name: item.name.slice(0, 200),
      type: item.type.slice(0, 120),
      content: typeof item.content === "string" ? item.content.slice(0, 200_000) : undefined,
      dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : undefined,
    }));
}

function isSafeImageDataUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}
