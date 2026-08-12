"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";

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
import { useDeleteApiKey, useJulesConfig, useSaveApiKey } from "@/hooks/use-jules-config";
import { errorMessage, formatAbsoluteTime } from "@/lib/utils";
import { julesApiKeySchema, type JulesApiKeyInput } from "@/lib/validators";

export function SettingsView() {
  const { toast } = useToast();
  const configQuery = useJulesConfig();
  const saveApiKey = useSaveApiKey();
  const deleteApiKey = useDeleteApiKey();

  const [showKey, setShowKey] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [nvidiaKey, setNvidiaKey] = React.useState("");
  const [nvidiaConfigured, setNvidiaConfigured] = React.useState(false);
  const [savingNvidia, setSavingNvidia] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JulesApiKeyInput>({
    resolver: zodResolver(julesApiKeySchema),
    defaultValues: { apiKey: "" },
  });

  React.useEffect(() => {
    void fetch("/api/settings/nvidia-key").then((response) => response.json()).then((data) => setNvidiaConfigured(Boolean(data.configured))).catch(() => undefined);
  }, []);

  const saveNvidiaKey = async () => {
    setSavingNvidia(true);
    try {
      const response = await fetch("/api/settings/nvidia-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: nvidiaKey }) });
      if (!response.ok) throw new Error("Could not save NVIDIA API key.");
      setNvidiaKey(""); setNvidiaConfigured(true);
      toast({ title: "NVIDIA AI connected", description: "Your key is encrypted and stored server-side.", variant: "success" });
    } catch (error) { toast({ title: "Could not save NVIDIA key", description: errorMessage(error), variant: "error" }); }
    finally { setSavingNvidia(false); }
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      await saveApiKey.mutateAsync(values.apiKey);
      reset({ apiKey: "" });
      setShowKey(false);
      toast({ title: "Jules API connected", description: "Key replaced.", variant: "success" });
    } catch (error) {
      setServerError(errorMessage(error, "Could not verify that key with Jules."));
    }
  });

  const handleDelete = async () => {
    try {
      await deleteApiKey.mutateAsync();
      setConfirmOpen(false);
      toast({
        title: "API key removed",
        description: "Polling stopped. Add a key to continue.",
        variant: "success",
      });
    } catch (error) {
      toast({ title: "Could not remove key", description: errorMessage(error), variant: "error" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your Jules API connection.</p>
      </div>

      {/* Connection status */}
      <div className="space-y-2.5 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {configQuery.data?.configured ? "API key configured" : "No API key configured"}
          </p>
        </div>
        {configQuery.data?.configured ? (
          <dl className="space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt>Connected</dt>
              <dd className="text-foreground/80">
                {formatAbsoluteTime(configQuery.data.configuredAt)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>Last validated</dt>
              <dd className="text-foreground/80">
                {formatAbsoluteTime(configQuery.data.lastValidatedAt)}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          The key is encrypted with AES-256-GCM and stored server-side. It is never returned to the
          browser.
        </p>
      </div>

      {/* Replace key */}
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div className="space-y-2">
          <Label htmlFor="settings-api-key">
            {configQuery.data?.configured ? "Replace API key" : "Add API key"}
          </Label>
          <div className="relative">
            <Input
              id="settings-api-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore="true"
              placeholder="Paste a new key"
              className="pr-12 font-mono text-sm"
              aria-invalid={Boolean(errors.apiKey)}
              aria-describedby={errors.apiKey ? "settings-api-key-error" : undefined}
              disabled={saveApiKey.isPending}
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
            <p id="settings-api-key-error" role="alert" className="text-sm text-red-400">
              {errors.apiKey.message}
            </p>
          ) : null}
        </div>

        {serverError ? <ErrorState title="Key rejected" message={serverError} /> : null}

        <Button type="submit" disabled={saveApiKey.isPending}>
          {saveApiKey.isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {saveApiKey.isPending ? "Testing key…" : "Test & Save API Key"}
        </Button>
      </form>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /><div><p className="text-sm font-medium">NVIDIA AI Builder</p><p className="text-xs text-muted-foreground">Use free NVIDIA-hosted models to understand tasks and gather memory.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); void saveNvidiaKey(); }} className="flex flex-col gap-2 sm:flex-row">
          <Input type="password" value={nvidiaKey} onChange={(event) => setNvidiaKey(event.target.value)} placeholder={nvidiaConfigured ? "NVIDIA key saved — paste to replace" : "Paste NVIDIA API key"} autoComplete="off" className="font-mono text-sm" />
          <Button type="submit" disabled={!nvidiaKey.trim() || savingNvidia}>{savingNvidia ? "Saving…" : nvidiaConfigured ? "Replace key" : "Save key"}</Button>
        </form>
        <p className="text-xs text-muted-foreground">Stored with the same AES-256-GCM protection as your Jules key. The browser never receives the key.</p>
      </section>

      {/* Links */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" size="sm" asChild>
          <a href="https://jules.google.com/settings" target="_blank" rel="noopener noreferrer">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Jules Settings
            <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href="https://jules.google.com" target="_blank" rel="noopener noreferrer">
            Open Jules
            <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </a>
        </Button>
      </div>

      {/* Danger zone */}
      {configQuery.data?.configured ? (
        <div className="space-y-2.5 rounded-2xl border border-red-500/25 bg-red-950/20 p-4">
          <p className="text-sm font-medium text-red-100">Remove API key</p>
          <p className="text-sm leading-relaxed text-red-200/80">
            Deletes the encrypted key from your database, stops all Jules polling, and returns to
            setup. Your Jules sessions themselves are not affected.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={deleteApiKey.isPending}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete key
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the stored API key?</DialogTitle>
            <DialogDescription>
              Jules DeepDive will stop polling immediately and return to the setup screen. You can paste the
              key again at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteApiKey.isPending}
            >
              {deleteApiKey.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Delete key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
