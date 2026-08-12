"use client";

import { Check, Github, LoaderCircle } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * GitHub connect button that links to the OAuth connect flow.
 * Checks /api/github/status to show the current connection state.
 */
export function GitHubConnectButton() {
  const [connected, setConnected] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void fetch("/api/github/status")
      .then((res) => res.json())
      .then((data) => setConnected(Boolean(data.connected)))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking GitHub...
      </Button>
    );
  }

  if (connected) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        GitHub Connected
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <a href="/api/github/connect">
        <Github className="h-4 w-4" aria-hidden="true" />
        Connect to GitHub
      </a>
    </Button>
  );
}
