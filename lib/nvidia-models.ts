/**
 * Curated catalog of NVIDIA-hosted models offered in the composer's model picker.
 *
 * Shared by the client (picker UI) and the server (request validation), so it must
 * stay free of server-only imports.
 *
 * Every entry below is a real model id from the public NVIDIA build catalog
 * (`GET https://integrate.api.nvidia.com/v1/models`) and is selected because it
 * documents support for OpenAI-style function/tool calling - the agent in this app is
 * useless without it. The live list is intersected with this catalog at runtime by
 * `GET /api/nvidia/models`, so a model that NVIDIA retires simply stops being offered
 * instead of failing at chat time.
 */

/** Icon keys map to files in `public/model-icons/{key}.svg`. */
export type ModelVendorIcon =
  | "glm"
  | "deepseek"
  | "kimi"
  | "openai"
  | "meta"
  | "nvidia"
  | "mistral"
  | "google";

export interface NvidiaModel {
  /** Exact model id sent to the NVIDIA API. */
  id: string;
  /** Short display name for the picker trigger. */
  label: string;
  /** Publisher shown as a secondary line. */
  vendorLabel: string;
  /**
   * Which vendored brand mark to render. Omitted when no authentic mark is
   * available for the publisher - `ModelIcon` then draws a monogram tile rather
   * than borrowing another company's logo.
   */
  icon?: ModelVendorIcon;
  /** Brand colour for the monogram fallback. Only read when `icon` is absent. */
  monogramColor?: string;
  /** One-line positioning note shown in the dropdown. */
  blurb: string;
}

export const NVIDIA_MODELS: NvidiaModel[] = [
  {
    id: "z-ai/glm-5.2",
    label: "GLM 5.2",
    vendorLabel: "Z.ai",
    icon: "glm",
    blurb: "Strong all-round reasoning and tool use.",
  },
  {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    vendorLabel: "Moonshot AI",
    icon: "kimi",
    blurb: "Agentic model tuned for long tool chains.",
  },
  {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    vendorLabel: "DeepSeek",
    icon: "deepseek",
    blurb: "Fast and cheap for everyday triage.",
  },
  {
    id: "openai/gpt-oss-120b",
    label: "gpt-oss 120B",
    vendorLabel: "OpenAI",
    icon: "openai",
    blurb: "Open-weight reasoning model, reliable at tools.",
  },
  {
    id: "openai/gpt-oss-20b",
    label: "gpt-oss 20B",
    vendorLabel: "OpenAI",
    icon: "openai",
    blurb: "Lighter gpt-oss for quick back-and-forth.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super",
    vendorLabel: "NVIDIA",
    icon: "nvidia",
    blurb: "NVIDIA's flagship open reasoning model.",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    label: "Nemotron Super 49B",
    vendorLabel: "NVIDIA",
    icon: "nvidia",
    blurb: "Balanced accuracy and latency.",
  },
  {
    id: "nvidia/nvidia-nemotron-nano-9b-v2",
    label: "Nemotron Nano 9B",
    vendorLabel: "NVIDIA",
    icon: "nvidia",
    blurb: "Smallest option, best for short questions.",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    vendorLabel: "Meta",
    icon: "meta",
    blurb: "Well-understood general purpose baseline.",
  },
  {
    id: "mistralai/mistral-large-2-instruct",
    label: "Mistral Large 2",
    vendorLabel: "Mistral AI",
    icon: "mistral",
    blurb: "Solid instruction following and function calls.",
  },
  {
    id: "minimaxai/minimax-m3",
    label: "MiniMax M3",
    vendorLabel: "MiniMax",
    // svgl has no MiniMax mark and there is no clean official SVG to vendor.
    monogramColor: "#F5462D",
    blurb: "Long-context agentic model.",
  },
];

/** Default selection: capable, widely available, and good at tool calling. */
export const DEFAULT_MODEL_ID = "z-ai/glm-5.2";

const MODELS_BY_ID = new Map(NVIDIA_MODELS.map((model) => [model.id, model]));

export function findModel(id: string | null | undefined): NvidiaModel | null {
  if (!id) return null;
  return MODELS_BY_ID.get(id) ?? null;
}

/** True when the id is part of the curated catalog. */
export function isKnownModel(id: string): boolean {
  return MODELS_BY_ID.has(id);
}

/**
 * Resolves a stored/requested id to something safe to send upstream, falling back
 * to the default when the id is unknown (e.g. a model retired since it was saved).
 */
export function resolveModelId(id: string | null | undefined): string {
  return id && MODELS_BY_ID.has(id) ? id : DEFAULT_MODEL_ID;
}
