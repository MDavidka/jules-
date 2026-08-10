"use client";

import { Check, LoaderCircle, Wrench, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useCreateSession } from "@/hooks/use-sessions";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/utils";

export interface JulesFixProposal {
  prompt: string;
  source: string;
  branch?: string;
  title: string;
}

interface JulesFixProposalCardProps {
  proposal: JulesFixProposal;
  onSessionCreated: (sessionName: string) => void;
}

/**
 * Explicit authorization boundary for Jules fixes. The assistant may propose
 * this card, but only the user's Confirm click calls the session API.
 */
export function JulesFixProposalCard({ proposal, onSessionCreated }: JulesFixProposalCardProps) {
  const { toast } = useToast();
  const createSession = useCreateSession();
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) {
    return <p className="text-xs text-muted-foreground">Jules fix proposal cancelled.</p>;
  }

  const handleConfirm = async () => {
    try {
      const result = await createSession.mutateAsync({
        prompt: proposal.prompt,
        source: proposal.source,
        ...(proposal.branch ? { branch: proposal.branch } : {}),
        title: proposal.title,
        requirePlanApproval: true,
      });
      toast({
        title: "Jules fix started",
        description: "Jules submitted the task and will ask for plan approval before coding.",
        variant: "success",
      });
      onSessionCreated(result.session.name);
    } catch (error) {
      toast({
        title: "Could not start Jules fix",
        description: errorMessage(error),
        variant: "error",
      });
    }
  };

  return (
    <section className="mt-3 space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-4" aria-label="Jules fix proposal">
      <div className="flex items-start gap-3">
        <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">Start a Jules fix?</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            I can send this problem to Jules for an authorized repository fix. It will create a task, then wait for plan approval before making changes.
          </p>
          <p className="break-anywhere text-xs text-muted-foreground/80">
            {proposal.title}{proposal.branch ? ` · branch ${proposal.branch}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleConfirm()} disabled={createSession.isPending} size="sm">
          {createSession.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {createSession.isPending ? "Starting…" : "Confirm and start Jules"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDismissed(true)} disabled={createSession.isPending}>
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </section>
  );
}
