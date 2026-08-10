import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { inspectPublicRepository, readWebPage } from "@/lib/nvidia-tools.server";
import { loadNvidiaApiKey } from "@/lib/nvidia.server";
import { NVIDIA_MODELS } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request) as { prompt?: unknown; model?: unknown; history?: unknown; source?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = typeof body.model === "string" && body.model.includes("/") ? body.model : NVIDIA_MODELS[0].id;
    if (!prompt) return jsonError("Type a message to send.", 422, { code: "VALIDATION_ERROR" });
    const apiKey = await loadNvidiaApiKey();
    if (!apiKey) return jsonError("Configure an NVIDIA API key in Settings first.", 503, { code: "NVIDIA_KEY_MISSING" });
    const history = Array.isArray(body.history) ? body.history.filter((item): item is { role: "user" | "assistant"; content: string } => Boolean(item && typeof item === "object" && "role" in item && "content" in item)) : [];
    const source = typeof body.source === "string" ? body.source : "";
    let research = "";
    if (source) research += `\nRepository research:\n${await inspectPublicRepository(source)}`;
    const url = prompt.match(/https?:\/\/[^\s]+/)?.[0];
    if (url) research += `\nWeb research (${url}):\n${await readWebPage(url)}`;
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: "You are the Jules+ project memory assistant. Think in concise steps. Use the provided repository/web research to understand the codebase. Gather durable user/project memory. Never start or stop Jules without proposing an explicit confirmation action card." }, ...history, { role: "user", content: `${prompt}${research}` }], temperature: 0.2, max_tokens: 1200 }),
    });
    if (!response.ok || !response.body) { const data = await response.json().catch(() => null); return jsonError(typeof data?.message === "string" ? data.message : "NVIDIA request failed.", response.status >= 500 ? 502 : response.status, { code: "NVIDIA_REQUEST_FAILED" }); }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async start(controller) { const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = ""; try { while (true) { const result = await reader.read(); if (result.done) break; buffer += decoder.decode(result.value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; const value = line.slice(6).trim(); if (value === "[DONE]") continue; try { const token = JSON.parse(value).choices?.[0]?.delta?.content; if (typeof token === "string") controller.enqueue(encoder.encode(token)); } catch { /* ignore incomplete provider frames */ } } } controller.close(); } catch (error) { controller.error(error); } } });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
