import { NextResponse } from "next/server";

import { loadNvidiaApiKey } from "@/lib/nvidia.server";
import { NVIDIA_MODELS, type NvidiaModelDef } from "@/lib/nvidia-models";

export const dynamic = "force-dynamic";

const CURATED_BY_ID = new Map<string, NvidiaModelDef>(NVIDIA_MODELS.map((model) => [model.id, model]));

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
    const models = Array.isArray(data.data)
      ? data.data
          .filter((item: { id?: unknown }) => typeof item.id === "string" && CURATED_BY_ID.has(item.id))
          .map((item: { id: string }) => {
            const curated = CURATED_BY_ID.get(item.id)!;
            return {
              id: item.id,
              label: curated.label,
              provider: curated.provider,
              icon: curated.icon,
              iconUrl: curated.iconUrl,
              iconFallback: curated.iconFallback,
            };
          })
      : [];
    return NextResponse.json({ models: models.length ? models : NVIDIA_MODELS, live: true }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ models: NVIDIA_MODELS, live: false });
  }
}
