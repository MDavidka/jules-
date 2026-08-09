"use client";

import { BrainCircuit, LoaderCircle, Pin, PinOff } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMemory, useToggleMemoryPin } from "@/hooks/use-memory";
import { cn, errorMessage, sourceDisplayName } from "@/lib/utils";

interface MemoryAttachSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManageAll: () => void;
}

/**
 * Quick pin/unpin of memory notes from the composer.
 * Pinned notes are appended to the prompt when the task is submitted.
 */
export function MemoryAttachSheet({ open, onOpenChange, onManageAll }: MemoryAttachSheetProps) {
  const memoryQuery = useMemory();
  const togglePin = useToggleMemoryPin();
  const notes = memoryQuery.data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-0 pb-safe">
        <SheetHeader className="pr-14">
          <SheetTitle>Attach memory</SheetTitle>
          <SheetDescription>
            Pinned notes are appended to the prompt when you submit the task.
          </SheetDescription>
        </SheetHeader>

        <div className="scrollbar-thin max-h-[52dvh] overflow-y-auto px-3">
          {memoryQuery.isPending ? (
            <p className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading memory…
            </p>
          ) : memoryQuery.isError ? (
            <div className="px-1 py-2">
              <ErrorState
                title="Could not load memory"
                message={errorMessage(memoryQuery.error)}
                onRetry={() => void memoryQuery.refetch()}
              />
            </div>
          ) : notes.length === 0 ? (
            <EmptyState
              icon={BrainCircuit}
              title="No memory saved"
              description="Save project conventions once and reuse them in every task."
              className="mt-2 border-0 bg-transparent"
            />
          ) : (
            <ul className="space-y-1 py-1">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => togglePin.mutate({ id: note.id, pinned: !note.pinned })}
                    aria-pressed={note.pinned}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      note.pinned ? "bg-primary/10" : "hover:bg-white/[0.04]",
                    )}
                  >
                    {note.pinned ? (
                      <Pin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <PinOff
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3 block text-sm leading-relaxed text-foreground break-anywhere">
                        {note.content}
                      </span>
                      {note.source ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {sourceDisplayName(note.source)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 pb-4 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onManageAll();
            }}
          >
            <BrainCircuit className="h-4 w-4" aria-hidden="true" />
            Manage memory
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
