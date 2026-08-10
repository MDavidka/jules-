import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { loadNvidiaApiKey } from "@/lib/nvidia.server";
import { NVIDIA_MODELS } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request) as { prompt?: unknown; model?: unknown; history?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = NVIDIA_MODELS.some((item) => item.id === body.model) ? body.model : NVIDIA_MODELS[0].id;
    if (!prompt) return jsonError("Type a message to send.", 422, { code: "VALIDATION_ERROR" });
    const apiKey = await loadNvidiaApiKey();
    if (!apiKey) return jsonError("Configure an NVIDIA API key in Settings first.", 503, { code: "NVIDIA_KEY_MISSING" });
    const history = Array.isArray(body.history) ? body.history.filter((item): item is { role: "user" | "assistant"; content: string } => Boolean(item && typeof item === "object" && "role" in item && "content" in item)) : [];
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: "You are the Jules+ project memory assistant. Understand the user's problem, inspect available repository context when possible, propose concise next steps, and ask before starting or stopping Jules. You may suggest saving useful user preferences as memory." }, ...history, { role: "user", content: prompt }], temperature: 0.2, max_tokens: 900 }),
    });
    const data = await response.json();
    if (!response.ok) return jsonError(typeof data?.message === "string" ? data.message : "NVIDIA request failed.", response.status >= 500 ? 502 : response.status, { code: "NVIDIA_REQUEST_FAILED" });
    return NextResponse.json({ message: data.choices?.[0]?.message?.content ?? "I could not generate a response." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
