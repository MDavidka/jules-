import { NextResponse } from "next/server";

import { loadNvidiaApiKey } from "@/lib/nvidia.server";
import { NVIDIA_MODELS } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = await loadNvidiaApiKey();
  if (!apiKey) return NextResponse.json({ models: NVIDIA_MODELS, live: false });

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 300 },
    });
    if (!response.ok) return NextResponse.json({ models: NVIDIA_MODELS, live: false });
    const data = await response.json();
    const allowed = new Set<string>(NVIDIA_MODELS.map((item) => item.id));
    const models = Array.isArray(data.data)
      ? data.data.map((item: { id?: unknown; name?: unknown; owned_by?: unknown }) => {
          const id = typeof item.id === "string" ? item.id : "";
          const provider = id.split("/")[0] || "nvidia";
          return { id, label: typeof item.name === "string" ? item.name : id, provider, icon: provider };
        }).filter((item: { id: string }) => allowed.has(item.id))
      : NVIDIA_MODELS;
    return NextResponse.json({ models: models.length ? models : NVIDIA_MODELS, live: true }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ models: NVIDIA_MODELS, live: false });
  }
}
