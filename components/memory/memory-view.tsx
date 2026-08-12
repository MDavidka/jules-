"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BrainCircuit, LoaderCircle, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  useCreateMemory,
  useDeleteMemory,
  useMemory,
  useToggleMemoryPin,
} from "@/hooks/use-memory";
import { createMemorySchema, type CreateMemoryInput } from "@/lib/validators";
import { errorMessage, formatRelativeTime, sourceDisplayName } from "@/lib/utils";

interface MemoryViewProps {
  /** When set, new notes are scoped to this repository. */
  selectedSource: string | null;
}

/**
 * Memory is a Jules DeepDive feature backed by MongoDB. Jules has no memory resource,
 * so these notes are stored locally and pinned notes are appended to the prompt
 * when you start a task.
 */
export function MemoryView({ selectedSource }: MemoryViewProps) {
  const { toast } = useToast();
  const memoryQuery = useMemory();
  const createMemory = useCreateMemory();
  const deleteMemory = useDeleteMemory();
  const togglePin = useToggleMemoryPin();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateMemoryInput>({
    resolver: zodResolver(createMemorySchema),
    defaultValues: { content: "", pinned: true },
  });

  const notes = memoryQuery.data?.items ?? [];

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createMemory.mutateAsync({
        content: values.content,
        pinned: true,
        ...(selectedSource ? { source: selectedSource } : {}),
      });
      reset({ content: "", pinned: true });
      toast({ title: "Saved to memory", variant: "success" });
    } catch (error) {
      toast({ title: "Could not save", description: errorMessage(error), variant: "error" });
    }
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Memory</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reusable context stored in your own database. Pinned notes are attached to the prompt when
          you start a new task.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-2" noValidate>
        <label htmlFor="memory-content" className="text-sm font-medium text-foreground">
          New memory
        </label>
        <Textarea
          id="memory-content"
          rows={3}
          placeholder="e.g. Always use pnpm, and keep API routes in app/api."
          aria-invalid={Boolean(errors.content)}
          aria-describedby={errors.content ? "memory-error" : undefined}
          {...register("content")}
        />
        {errors.content ? (
          <p id="memory-error" role="alert" className="text-sm text-red-400">
            {errors.content.message}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selectedSource ? `Scoped to ${sourceDisplayName(selectedSource)}` : "Applies to all repos"}
          </p>
          <Button type="submit" size="sm" disabled={createMemory.isPending}>
            {createMemory.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Save
          </Button>
        </div>
      </form>

      <section aria-label="Saved memory" className="space-y-2">
        {memoryQuery.isPending ? (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1].map((index) => (
              <li key={index} className="rounded-2xl border border-border/70 bg-card p-4">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </li>
            ))}
          </ul>
        ) : memoryQuery.isError ? (
          <ErrorState
            title="Could not load memory"
            message={errorMessage(memoryQuery.error)}
            onRetry={() => void memoryQuery.refetch()}
            isRetrying={memoryQuery.isFetching}
          />
        ) : notes.length === 0 ? (
          <EmptyState
            icon={BrainCircuit}
            title="No memory saved"
            description="Save project conventions once and reuse them in every task."
          />
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li
                key={note.id}
                className="flex items-start gap-2 rounded-2xl border border-border/70 bg-card p-3.5"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground break-anywhere">
                    {note.content}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {note.pinned ? "Pinned" : "Not pinned"}
                    {note.source ? ` · ${sourceDisplayName(note.source)}` : ""} ·{" "}
                    {formatRelativeTime(note.createdAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    togglePin.mutate(
                      { id: note.id, pinned: !note.pinned },
                      {
                        onError: (error) =>
                          toast({
                            title: "Could not update",
                            description: errorMessage(error),
                            variant: "error",
                          }),
                      },
                    )
                  }
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {note.pinned ? (
                    <Pin className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <PinOff className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">{note.pinned ? "Unpin note" : "Pin note"}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    deleteMemory.mutate(note.id, {
                      onSuccess: () => toast({ title: "Memory deleted", variant: "success" }),
                      onError: (error) =>
                        toast({
                          title: "Could not delete",
                          description: errorMessage(error),
                          variant: "error",
                        }),
                    })
                  }
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Delete note</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
