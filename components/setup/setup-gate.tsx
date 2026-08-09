"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Github,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useSaveApiKey } from "@/hooks/use-jules-config";
import { ApiError } from "@/lib/api-client";
import { julesApiKeySchema, type JulesApiKeyInput } from "@/lib/validators";
import { errorMessage } from "@/lib/utils";

const JULES_SETTINGS_URL = "https://jules.google.com/settings";
const JULES_APP_URL = "https://jules.google.com";

interface SetupGateProps {
  /** Called after the key is validated and stored. */
  onConfigured: () => void;
}

const STEPS = [
  {
    icon: KeyRound,
    title: "Create a Jules API key",
    body: "Open Jules Settings and generate an API key. You can hold up to three keys at a time.",
  },
  {
    icon: Github,
    title: "Connect the Jules GitHub App",
    body: "Install the Jules GitHub App and grant it access to the repositories you want Jules to work in.",
  },
  {
    icon: ShieldCheck,
    title: "Paste the key below",
    body: "It is validated against the live Jules API, then encrypted with AES-256-GCM before it is stored.",
  },
];

export function SetupGate({ onConfigured }: SetupGateProps) {
  const [showKey, setShowKey] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const saveApiKey = useSaveApiKey();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<JulesApiKeyInput>({
    resolver: zodResolver(julesApiKeySchema),
    defaultValues: { apiKey: "" },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    setFocus("apiKey");
  }, [setFocus]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      const result = await saveApiKey.mutateAsync(values.apiKey);

      toast({
        title: "Jules API connected",
        description:
          result.sourceCount > 0
            ? "Loading your repositories…"
            : "No repositories found yet - install the Jules GitHub App to add one.",
        variant: "success",
      });

      onConfigured();
    } catch (error) {
      // Show the safe upstream message; the key is never persisted on failure.
      const message =
        error instanceof ApiError && error.isConfigurationProblem
          ? error.message
          : errorMessage(error, "Could not verify that key with Jules.");

      setServerError(message);
      setFocus("apiKey");
    }
  });

  const isBusy = isSubmitting || saveApiKey.isPending;

  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 pb-8 pt-safe">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14" iconClassName="h-8 w-8" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
            Welcome to Jules+
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Connect your Google Jules account to start delegating real coding tasks.
          </p>
        </div>

        <ol className="mt-8 space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
                <step.icon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  <span className="text-muted-foreground">{index + 1}. </span>
                  {step.title}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" size="sm" asChild>
            <a href={JULES_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Jules Settings
              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={JULES_APP_URL} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" aria-hidden="true" />
              Open Jules
              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </a>
          </Button>
        </div>

        <form onSubmit={onSubmit} className="mt-7 space-y-3" noValidate>
          <div className="space-y-2">
            <Label htmlFor="apiKey">Jules API key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                // Keep the value out of any browser password manager heuristics.
                data-1p-ignore="true"
                placeholder="Paste your key"
                className="pr-12 font-mono text-sm"
                aria-invalid={Boolean(errors.apiKey)}
                aria-describedby={errors.apiKey ? "apiKey-error" : "apiKey-hint"}
                disabled={isBusy}
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
              <p id="apiKey-error" role="alert" className="text-sm text-red-400">
                {errors.apiKey.message}
              </p>
            ) : (
              <p id="apiKey-hint" className="text-xs leading-relaxed text-muted-foreground">
                Stored encrypted on the server. It is never sent to your browser again.
              </p>
            )}
          </div>

          {serverError ? <ErrorState title="Could not connect" message={serverError} /> : null}

          <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
            {isBusy ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Testing key with Jules…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                Test &amp; Save API Key
              </>
            )}
          </Button>

          {/* Status updates announced to assistive technology. */}
          <p aria-live="polite" className="sr-only">
            {isBusy ? "Validating your API key against the Jules API." : ""}
          </p>
        </form>

        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Jules+ talks to Jules only from the server. Your key never reaches the browser,
            localStorage, or logs.
          </span>
        </p>
      </div>
    </main>
  );
}
