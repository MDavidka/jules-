"use client";

import { Check, CircleAlert, Info, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal toast system with an aria-live region so status changes are announced
 * to screen readers.
 */

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5_000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "info" }) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      setToasts((current) => [...current.slice(-2), { id, title, description, variant }]);

      const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
      timers.current.set(id, timer);

      return id;
    },
    [dismiss],
  );

  // Clear any pending timers on unmount.
  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

const VARIANT_STYLES: Record<ToastVariant, { wrapper: string; icon: React.ElementType }> = {
  success: { wrapper: "border-emerald-500/30 bg-emerald-950/80 text-emerald-50", icon: Check },
  error: { wrapper: "border-red-500/30 bg-red-950/80 text-red-50", icon: CircleAlert },
  info: { wrapper: "border-border bg-zinc-900/95 text-foreground", icon: Info },
};

function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      // Announce toasts politely without stealing focus.
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 pt-3 pt-safe sm:items-end sm:px-4"
    >
      {toasts.map((item) => {
        const { wrapper, icon: Icon } = VARIANT_STYLES[item.variant];

        return (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-3.5 py-3 shadow-xl shadow-black/50 backdrop-blur animate-in slide-in-from-top-2 fade-in",
              wrapper,
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug break-anywhere">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs leading-relaxed opacity-80 break-anywhere">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Dismiss notification</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
