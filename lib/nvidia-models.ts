export interface NvidiaModelDef {
  id: string;
  label: string;
  provider: string;
  icon: string;
}

/**
 * Curated model catalogue. Only these models are offered in the model
 * changer and accepted by the chat completions endpoint.
 */
export const NVIDIA_MODELS = [
  { id: "deepseek-ai/deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "DeepSeek", icon: "deepseek" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra 550B", provider: "NVIDIA", icon: "nvidia" },
  { id: "z-ai/glm-5.2", label: "GLM-5.2", provider: "Z.ai", icon: "z-ai" },
  { id: "deepseek-ai/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash", provider: "DeepSeek", icon: "deepseek" },
  { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B", provider: "NVIDIA", icon: "nvidia" },
] as const satisfies readonly NvidiaModelDef[];

export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]["id"];

/** Provider brand mark, keyed by the model's `icon` slug. */
export const providerLogo = (icon: string) =>
  `https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/${icon.toLowerCase().replaceAll(" ", "-")}/default.svg`;
