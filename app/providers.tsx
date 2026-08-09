"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api-client";

export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session, created lazily so it is never shared
  // across requests during SSR.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data comes from a live upstream API; never trust a stale window.
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              if (error instanceof ApiError) {
                // Never retry "not configured", validation, or auth failures.
                if (error.isNotConfigured) return false;
                if (error.status === 401 || error.status === 403) return false;
                if (error.status >= 400 && error.status < 500) return false;
              }
              return failureCount < 2;
            },
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
