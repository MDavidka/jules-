"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";

import { ModelIcon } from "@/components/models/model-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  useDeleteNvidiaKey,
  useNvidiaConfig,
  useNvidiaModels,
  useSaveNvidiaKey,
} from "@/hooks/use-nvidia-config";
import { findModel } from "@/lib/nvidia-models";
import { errorMessage, formatAbsoluteTime } from "@/lib/utils";
import { nvidiaApiKeySchema, type NvidiaApiKeyInput } from "@/lib/validators";

/**
 * NVIDIA AI Builder credential management.
 *
 * Same storage guarantees as the Jules key: validated live before it is persisted,
 * encrypted with AES-256-GCM under its own derived key, and never returned to the
 * browser. Unlike the Jules key, removing it only disables the chat agent.
 */
export function NvidiaKeyCard() {
  const { toast } = useToast();
  const configQuery = useNvidiaConfig();
  const modelsQuery = useNvidiaModels();
  const saveKey = useSaveNvidiaKey();
  const deleteKey = useDeleteNvidiaKey();

  const [showKey, setShowKey] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NvidiaApiKeyInput>({
    resolver: zodResolver(nvidiaApiKeySchema),
    defaultValues: { apiKey: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      await saveKey.mutateAsync(values.apiKey);
      reset({ apiKey: "" });
      setShowKey(false);
      toast({
        title: "NVIDIA connected",
        description: "The chat agent is ready.",
        variant: "success",
      });
    } catch (error) {
      setServerError(errorMessage(error, "Could not verify that key with NVIDIA."));
    }
  });

  const handleDelete = async () => {
    try {
      await deleteKey.mutateAsync();
      setConfirmOpen(false);
      toast({
        title: "NVIDIA key removed",
        description: "The chat agent is disabled. Jules is unaffected.",
        variant: "success",
      });
    } catch (error) {
      toast({ title: "Could not remove key", description: errorMessage(error), variant: "error" });
    }
  };

  const configured = Boolean(configQuery.data?.configured);
  const activeModel = findModel(configQuery.data?.defaultModel);
  const modelCount = modelsQuery.data?.items.length ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG */}
        <img src="/model-icons/nvidia.svg" alt="" aria-hidden="true" className="h-5 w-5" />
        <div className="space-y-0.5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            NVIDIA AI Builder
          </h3>
          <p className="text-xs text-muted-foreground">
            Powers the chat agent that plans work and drives Jules.
          </p>
        </div>
      </div>

      {/* Connection status */}
      <div className="space-y-2.5 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className={cnStatus(configured)}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground">
            {configured ? "NVIDIA key configured" : "No NVIDIA key configured"}
          </p>
        </div>

        {configured ? (
          <dl className="space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt>Connected</dt>
              <dd className="text-foreground/80">
                {formatAbsoluteTime(configQuery.data?.configuredAt)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>Last validated</dt>
              <dd className="text-foreground/80">
                {formatAbsoluteTime(configQuery.data?.lastValidatedAt)}
              </dd>
            </div>
            {activeModel ? (
              <div className="flex items-center gap-2">
                <dt>Model</dt>
                <dd className="flex items-center gap-1.5 text-foreground/80">
                  <ModelIcon model={activeModel} className="h-3.5 w-3.5" />
                  {activeModel.label}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Encrypted with AES-256-GCM under a key derived separately from your Jules key, stored
          server-side, and never returned to the browser.
          {modelCount > 0 ? ` ${modelCount} models available.` : ""}
        </p>
      </div>

      {/* Add / replace key */}
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div className="space-y-2">
          <Label htmlFor="settings-nvidia-key">
            {configured ? "Replace NVIDIA key" : "Add NVIDIA key"}
          </Label>
          <div className="relative">
            <Input
              id="settings-nvidia-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore="true"
              placeholder="nvapi-…"
              className="pr-12 font-mono text-sm"
              aria-invalid={Boolean(errors.apiKey)}
              aria-describedby={errors.apiKey ? "settings-nvidia-key-error" : undefined}
              disabled={saveKey.isPending}
              {...register("apiKey")}
            />
            <button
              type="button"
              onClick={() => setShowKey((value) => !value)}
              className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showKey ? (
                <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
              <span className="sr-only">{showKey ? "Hide API key" : "Show API key"}</span>
            </button>
          </div>
          {errors.apiKey ? (
            <p id="settings-nvidia-key-error" role="alert" className="text-sm text-red-400">
              {errors.apiKey.message}
            </p>
          ) : null}
        </div>

        {serverError ? <ErrorState title="Key rejected" message={serverError} /> : null}

        <Button type="submit" disabled={saveKey.isPending}>
          {saveKey.isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {saveKey.isPending ? "Testing key…" : "Test & Save NVIDIA Key"}
        </Button>
      </form>

      <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
        <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer">
          Get a free key at build.nvidia.com
          <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </a>
      </Button>

      {configured ? (
        <div className="space-y-2.5 rounded-2xl border border-red-500/25 bg-red-950/20 p-4">
          <p className="text-sm font-medium text-red-100">Remove NVIDIA key</p>
          <p className="text-sm leading-relaxed text-red-200/80">
            Disables the chat agent. Your Jules connection, sessions, memory, and projects are
            untouched.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={deleteKey.isPending}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete NVIDIA key
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the stored NVIDIA key?</DialogTitle>
            <DialogDescription>
              The chat agent will stop working until you add a key again. Jules and everything it
              has already done are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteKey.isPending}
            >
              {deleteKey.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Delete key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Green shield when connected, muted when not. */
function cnStatus(configured: boolean): string {
  return configured
    ? "h-4 w-4 shrink-0 text-emerald-400"
    : "h-4 w-4 shrink-0 text-muted-foreground";
}
