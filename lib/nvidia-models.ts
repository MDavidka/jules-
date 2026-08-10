export const NVIDIA_MODELS = [
  { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B", icon: "llama" },
  { id: "mistralai/mistral-7b-instruct-v0.3", label: "Mistral 7B", icon: "mistral" },
  { id: "google/gemma-2-9b-it", label: "Gemma 2 9B", icon: "gemma" },
] as const;
export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]["id"];
