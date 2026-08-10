import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import {
  extractPublicRepositoryLinks,
  inspectPublicRepository,
  readWebPage,
} from "@/lib/nvidia-tools.server";
import { loadNvidiaApiKey } from "@/lib/nvidia.server";
import { DEFAULT_NVIDIA_MODEL_ID } from "@/lib/nvidia-models";

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
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = typeof body.model === "string" && body.model.includes("/") ? body.model : DEFAULT_NVIDIA_MODEL_ID;
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

    const repositoryInputs = [...(source ? [source] : []), ...extractPublicRepositoryLinks(prompt)];
    const uniqueRepositoryInputs = [...new Set(repositoryInputs)];
    const repositoryResearch = await Promise.all(
      uniqueRepositoryInputs.slice(0, 4).map(async (repository) => inspectPublicRepository(repository)),
    );

    const urls = [...new Set((prompt.match(/https?:\/\/[^\s<>'"]+/gi) ?? []).map((url) => url.replace(/[),.;!?]+$/, "")))].slice(0, 4);
    const webResearch = await Promise.all(
      urls
        .filter((url) => !/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/i.test(url))
        .map(async (url) => `Web research (${url}):\n${await readWebPage(url)}`),
    );

    const research = [
      repositoryResearch.length > 0 ? `MCP repository context:\n${repositoryResearch.join("\n\n")}` : "",
      ...webResearch,
    ].filter(Boolean).join("\n\n");
    const fileContext = attachments
      .filter((attachment) => attachment.content)
      .map((attachment) => `Attached file: ${attachment.name}\n${attachment.content}`)
      .join("\n\n");
    const imageContext = await describeImages(attachments, apiKey);
    const userText = [prompt, research, fileContext, imageContext].filter(Boolean).join("\n\n");
    const userContent: string = userText;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          {
            role: "system",
            content: "You are the Jules+ project memory assistant. Think in concise steps. Use the MCP repository context, public links, attached files, and images to understand the request. Gather durable user/project memory. Never start or stop Jules without proposing an explicit confirmation action card.",
          },
          ...history,
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      return jsonError(typeof data?.message === "string" ? data.message : "DeepSeek request failed.", response.status >= 500 ? 502 : response.status, { code: "NVIDIA_REQUEST_FAILED" });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
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
          if (typeof token === "string" && token.length > 0) {
            emittedToken = true;
            controller.enqueue(encoder.encode(token));
          }
        };

        try {
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
          if (!emittedToken) throw new Error("The model returned an empty response.");
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" } });
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
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    if (!response.ok) {
      return `Image analysis was unavailable for ${imageParts.length} attached image${imageParts.length === 1 ? "" : "s"}; continue with the user's text and attachment names.`;
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const description = data.choices?.[0]?.message?.content;
    if (typeof description !== "string" || !description.trim()) {
      return "The image analyzer returned no description; continue with the user's text and attachment names.";
    }
    return `Image analysis from the visual model:\n${description.trim().slice(0, 20_000)}`;
  } catch {
    return `Image analysis could not be completed for ${imageParts.length} attached image${imageParts.length === 1 ? "" : "s"}; continue with the user's text and attachment names.`;
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
      dataUrl: typeof item.dataUrl === "string" ? item.dataUrl.slice(0, 6_000_000) : undefined,
    }));
}

function isSafeImageDataUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}
