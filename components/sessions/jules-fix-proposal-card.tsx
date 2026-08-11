"use client";

import { LoaderCircle, X } from "lucide-react";
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
 * Compact inline card for Jules fix proposals. Minimal design with just a short
 * title, fix description, and two small outline buttons.
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
    <section className="mt-3 rounded-xl border border-border/60 bg-card/50 p-3" aria-label="Jules fix proposal">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Start Jules fix?</p>
        <p className="text-xs text-muted-foreground break-anywhere">
          {proposal.title}{proposal.branch ? ` · ${proposal.branch}` : ""}
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleConfirm()}
          disabled={createSession.isPending}
          className="h-7 rounded-md px-3 text-xs"
        >
          {createSession.isPending ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          {createSession.isPending ? "Starting..." : "Confirm"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDismissed(true)}
          disabled={createSession.isPending}
          className="h-7 rounded-md px-3 text-xs"
        >
          <X className="mr-1 h-3 w-3" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </section>
  );
}
