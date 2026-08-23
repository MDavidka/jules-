import { jsonError, parseJsonBody } from "@/lib/api-response.server";
import { loadNvidiaApiKey, NVIDIA_CHAT_COMPLETIONS_URL } from "@/lib/nvidia.server";
import { rateLimitedFetch } from "@/lib/rate-limiter.server";
import { DEFAULT_NVIDIA_MODEL_ID, NVIDIA_MODELS } from "@/lib/nvidia-models";
import { PROMPT_MAX_LENGTH } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await parseJsonBody(request)) as { prompt?: unknown; model?: unknown };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return jsonError("Enter a prompt before refining it.", 422);
  if (prompt.length > PROMPT_MAX_LENGTH) return jsonError("Prompt is too long.", 422);
  const apiKey = await loadNvidiaApiKey();
  if (!apiKey) return jsonError("Configure an NVIDIA API key in Settings first.", 503);
  const model = NVIDIA_MODELS.some((item) => item.id === body.model) ? body.model : DEFAULT_NVIDIA_MODEL_ID;
  const response = await rateLimitedFetch(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.35, max_tokens: 900, messages: [
      { role: "system", content: "Rewrite the user's software task into a clear, specific Jules implementation prompt. Preserve intent. Return only the improved prompt, with no preamble or quotes." },
      { role: "user", content: prompt },
    ] }),
  });
  if (!response.ok) return jsonError("Prompt refinement failed.", 502);
  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const refined = data.choices?.[0]?.message?.content;
  if (typeof refined !== "string" || !refined.trim()) return jsonError("Prompt refinement returned no text.", 502);
  return Response.json({ prompt: refined.trim().slice(0, PROMPT_MAX_LENGTH) });
}
