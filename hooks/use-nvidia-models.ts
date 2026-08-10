"use client";

import useSWR from "swr";

export type NvidiaModel = {
  id: string;
  label: string;
  provider: string;
  icon: string;
  iconUrl?: string;
  iconFallback: string;
};
const fetcher = (url: string) => fetch(url).then((response) => response.json());

export function useNvidiaModels() {
  const query = useSWR<{ models: NvidiaModel[]; live: boolean }>("/api/nvidia/models", fetcher, { revalidateOnFocus: false });
  return { ...query, models: query.data?.models ?? [], live: query.data?.live ?? false };
}
