"use client";

import { Clock3, GitPullRequest, ListChecks, LoaderCircle } from "lucide-react";
import * as React from "react";

import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { usePreferences, useUpdatePreferences } from "@/hooks/use-preferences";
import { errorMessage } from "@/lib/utils";

/**
 * Automations map onto the two input-only Jules session fields:
 * `automationMode` (AUTO_CREATE_PR) and `requirePlanApproval`.
 * Defaults are stored in MongoDB and applied when a session is created.
 */
export function AutomationsView() {
  const { toast } = useToast();
  const preferencesQuery = usePreferences();
  const updatePreferences = useUpdatePreferences();

  const preferences = preferencesQuery.data;
  const autoCreatePr = preferences?.defaultAutomationMode === "AUTO_CREATE_PR";
  const requireApproval = preferences?.defaultRequirePlanApproval ?? false;

  const update = async (input: Parameters<typeof updatePreferences.mutateAsync>[0]) => {
    try {
      await updatePreferences.mutateAsync(input);
      toast({ title: "Automation updated", variant: "success" });
    } catch (error) {
      toast({ title: "Could not update", description: errorMessage(error), variant: "error" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Automations</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Defaults applied to every new task you start from Jules+.
        </p>
      </div>

      {preferencesQuery.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((index) => (
            <div key={index} className="rounded-2xl border border-border/70 bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : preferencesQuery.isError ? (
        <ErrorState
          title="Could not load automations"
          message={errorMessage(preferencesQuery.error)}
          onRetry={() => void preferencesQuery.refetch()}
          isRetrying={preferencesQuery.isFetching}
        />
      ) : (
        <div className="space-y-2">
          <AutomationRow
            icon={GitPullRequest}
            id="auto-create-pr"
            title="Auto-create pull requests"
            description="When Jules produces a final patch, it opens a branch and pull request automatically. Maps to the Jules AUTO_CREATE_PR automation mode."
            checked={autoCreatePr}
            disabled={updatePreferences.isPending}
            onCheckedChange={(checked) =>
              void update({
                defaultAutomationMode: checked ? "AUTO_CREATE_PR" : "AUTOMATION_MODE_UNSPECIFIED",
              })
            }
          />

          <AutomationRow
            icon={ListChecks}
            id="require-plan-approval"
            title="Require plan approval"
            description="Jules pauses after planning and waits for you to approve before it writes any code."
            checked={requireApproval}
            disabled={updatePreferences.isPending}
            onCheckedChange={(checked) =>
              void update({ defaultRequirePlanApproval: checked })
            }
          />
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-card/60 p-3.5">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Jules has no scheduling API, so recurring/triggered runs are not available. These toggles
          set the automation fields that the Jules session API does support.
        </p>
      </div>

      {updatePreferences.isPending ? (
        <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}

function AutomationRow({
  icon: Icon,
  id,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: React.ElementType;
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/60">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={id} className="cursor-pointer">
          {title}
        </Label>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="mt-1 shrink-0"
      />
    </div>
  );
}
