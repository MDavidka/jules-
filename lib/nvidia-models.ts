export const NVIDIA_MODELS = [
  { id: "deepseek-ai/deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "DeepSeek", icon: "deepseek" },
  { id: "nvidia/nemotron-3-ultra-550b-v1", label: "Nemotron 3 Ultra 550B", provider: "NVIDIA", icon: "nvidia" },
  { id: "z-ai/glm-5.2", label: "GLM-5.2", provider: "Z.ai", icon: "zhipu-ai" },
  { id: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "DeepSeek", icon: "deepseek" },
  { id: "nvidia/nemotron-3-super-120b-v1", label: "Nemotron 3 Super 120B", provider: "NVIDIA", icon: "nvidia" },
] as const;
export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]["id"];
const PROVIDER_ICON_SLUGS: Record<string, string> = { DeepSeek: "deepseek", NVIDIA: "nvidia", "Z.ai": "zhipu-ai" };
export const providerLogo = (provider: string) => `https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/${PROVIDER_ICON_SLUGS[provider] ?? provider.toLowerCase().replaceAll(" ", "-")}/default.svg`;
