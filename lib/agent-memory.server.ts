import { MEMORY_FENCE } from "@/lib/agent-memory-stream";
import { connectToDatabase, MemoryNote } from "@/lib/mongodb.server";
import { MEMORY_KINDS, memoryDataSchema, type MemoryKind } from "@/lib/validators";

export { createMemoryBlockFilter, MEMORY_FENCE } from "@/lib/agent-memory-stream";

const MAX_CARDS_PER_REPLY = 6;

/** Appended to the system prompt so the model knows how to write memory. */
export const MEMORY_BLOCK_INSTRUCTIONS = [
  "When you learn a durable fact about the user's project (frameworks, start scripts, commands,",
  "conventions, connected platforms, git remotes, or important code locations), record it.",
  `To record, end your reply with a fenced block: ${MEMORY_FENCE} followed by a JSON array and a closing fence.`,
  'Each item is {"title": short label, "content": one sentence, "kind": one of',
  `${MEMORY_KINDS.join(" | ")}, "data": flat object of primitives or string arrays,`,
  '"connections": array of other titles in this same array}.',
  "Example item: {\"title\": \"Next.js app\", \"content\": \"The repo is a Next.js app started with pnpm dev.\",",
  '"kind": "stack", "data": {"framework": "next", "startScript": "pnpm dev"}, "connections": []}.',
  "Use `data` for machine-readable values and keep titles under 60 characters.",
  "Omit the block entirely when there is nothing new worth storing. Never mention the block to the user.",
].join(" ");

interface ParsedCard {
  title: string;
  content: string;
  kind: MemoryKind;
  data: Record<string, unknown> | null;
  connections: string[];
}

/**
 * Persists the cards from a memory block. Titles referenced in `connections`
 * are resolved to note ids after insertion so the board can draw links.
 *
 * Returns the number of notes created; parsing problems are swallowed because a
 * malformed block must never break the user's reply.
 */
export async function saveMemoryCards(block: string | null, source: string | null): Promise<number> {
  const cards = parseMemoryBlock(block);
  if (cards.length === 0) return 0;

  try {
    await connectToDatabase();

    const created = await MemoryNote.insertMany(
      cards.map((card) => ({
        content: card.content,
        source: normalizeSource(source),
        pinned: false,
        title: card.title,
        kind: card.kind,
        data: card.data,
        connections: [],
      })),
    );

    const idByTitle = new Map(
      created.map((note, index) => [cards[index]!.title.toLowerCase(), String(note._id)]),
    );

    await Promise.all(
      created.map(async (note, index) => {
        const links = cards[index]!.connections
          .map((title) => idByTitle.get(title.toLowerCase()))
          .filter((id): id is string => Boolean(id) && id !== String(note._id));

        if (links.length === 0) return;
        await MemoryNote.findByIdAndUpdate(note._id, { $set: { connections: [...new Set(links)] } }).exec();
      }),
    );

    return created.length;
  } catch {
    return 0;
  }
}

/** Only `sources/...` names are valid scopes; anything else is stored globally. */
function normalizeSource(source: string | null) {
  return source && /^sources\//.test(source) ? source : null;
}

function parseMemoryBlock(block: string | null): ParsedCard[] {
  if (!block) return [];

  const body = block
    .replace(/^```memory\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  if (!body) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];

  return items
    .slice(0, MAX_CARDS_PER_REPLY)
    .map(toCard)
    .filter((card): card is ParsedCard => card !== null);
}

function toCard(value: unknown): ParsedCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (content.length < 3) return null;

  const kind = MEMORY_KINDS.includes(raw.kind as MemoryKind) ? (raw.kind as MemoryKind) : "note";
  const data = memoryDataSchema.safeParse(raw.data);

  return {
    title: (title || content).slice(0, 120),
    content: content.slice(0, 4000),
    kind,
    data: data.success ? data.data : null,
    connections: Array.isArray(raw.connections)
      ? raw.connections.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
  };
}
