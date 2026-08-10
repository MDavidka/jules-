export const NVIDIA_MODELS = [
  { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B", provider: "Meta", icon: "meta" },
  { id: "mistralai/mistral-7b-instruct-v0.3", label: "Mistral 7B", provider: "Mistral AI", icon: "mistral" },
  { id: "google/gemma-2-9b-it", label: "Gemma 2 9B", provider: "Google", icon: "google" },
] as const;
export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]["id"];
export const providerLogo = (provider: string) => `https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/${provider.toLowerCase().replaceAll(" ", "-")}/default.svg`;
