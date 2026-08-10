export interface NvidiaModelDef {
  id: string;
  label: string;
  provider: string;
  icon: string;
  iconUrl?: string;
  iconFallback: string;
}

/** Default curated NVIDIA model available through the app's free model path. */
export const DEFAULT_NVIDIA_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b";

/**
 * Curated model catalogue. Only these models are offered in the model
 * changer and accepted by the chat completions endpoint.
 *
 * The icon URLs are official marks served by SVGL. Models without an SVGL
 * mark use a compact text fallback instead of a misleading generic bot icon.
 */
export const NVIDIA_MODELS = [
  {
    id: DEFAULT_NVIDIA_MODEL_ID,
    label: "Nemotron 3 Ultra 550B",
    provider: "NVIDIA",
    icon: "nvidia",
    iconUrl: "https://svgl.app/library/nvidia-icon-dark.svg",
    iconFallback: "N",
  },
  {
    id: "z-ai/glm-5.2",
    label: "GLM-5.2",
    provider: "Z.ai",
    icon: "z-ai",
    iconFallback: "GLM",
  },
  {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    icon: "deepseek",
    iconUrl: "https://svgl.app/library/deepseek.svg",
    iconFallback: "D",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super 120B",
    provider: "NVIDIA",
    icon: "nvidia",
    iconUrl: "https://svgl.app/library/nvidia-icon-dark.svg",
    iconFallback: "N",
  },
] as const satisfies readonly NvidiaModelDef[];

export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]["id"];
