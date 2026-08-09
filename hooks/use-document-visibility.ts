"use client";

import * as React from "react";

/**
 * Tracks `document.visibilityState`.
 *
 * Polling is paused while the tab is hidden and resumed (with an immediate
 * refetch) when it becomes visible again.
 */
export function useDocumentVisibility(): boolean {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    // Sync on mount in case the tab was already hidden.
    setIsVisible(document.visibilityState === "visible");

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return isVisible;
}
