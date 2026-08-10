"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type Heading = { level: number; text: string; id: string };
type Block =
  | { kind: "heading"; level: number; text: string; id: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; language: string; value: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "rule" };

interface MarkdownContentProps {
  children: string;
  className?: string;
}

/**
 * Small, dependency-free Markdown renderer for agent responses. It deliberately
 * builds React nodes instead of injecting HTML, so links and formatted text
 * remain safe while streamed assistant output is rendered progressively.
 */
export function MarkdownContent({ children, className }: MarkdownContentProps) {
  const parsed = React.useMemo(() => parseMarkdown(children), [children]);
  const headings = parsed.blocks.filter(
    (block): block is Extract<Block, { kind: "heading" }> => block.kind === "heading",
  );

  return (
    <div className={cn("space-y-4 text-[15px] leading-7 text-foreground", className)}>
      {headings.length > 0 ? <TableOfContents headings={headings} /> : null}
      {parsed.blocks.map((block, index) => (
        <MarkdownBlock key={`${block.kind}-${index}`} block={block} />
      ))}
    </div>
  );
}

function TableOfContents({ headings }: { headings: Heading[] }) {
  return (
    <details className="group rounded-2xl border border-border/70 bg-card/70 px-4 py-3" open={headings.length <= 4}>
      <summary className="cursor-pointer list-none text-sm font-bold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mr-2 inline-block h-4 w-4 text-primary transition-transform group-open:rotate-90" aria-hidden="true" />
        Table of contents
      </summary>
      <nav aria-label="Table of contents" className="mt-2 border-l border-border/80 pl-3">
        <ol className="space-y-1 text-sm leading-6">
          {headings.map((heading) => (
            <li key={heading.id} className={cn(heading.level > 1 && "pl-3")}>
              <a className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href={`#${heading.id}`}>
                {renderInline(heading.text, `toc-${heading.id}`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as React.ElementType;
      return (
        <Tag id={block.id} className={cn("scroll-mt-6 font-bold tracking-tight text-foreground", block.level === 1 ? "text-2xl" : block.level === 2 ? "text-xl" : "text-lg")}>
          {renderInline(block.text, block.id)}
        </Tag>
      );
    }
    case "paragraph":
      return <p className="whitespace-pre-wrap break-words">{renderInline(block.lines.join("\n"), `p-${block.lines[0]}`)}</p>;
    case "list":
      return block.ordered ? (
        <ol className="list-decimal space-y-1 pl-6 marker:font-bold marker:text-primary">
          {block.items.map((item, index) => <li key={index} className="pl-1">{renderInline(item, `ol-${index}`)}</li>)}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-6 marker:text-primary">
          {block.items.map((item, index) => <li key={index} className="pl-1">{renderInline(item, `ul-${index}`)}</li>)}
        </ul>
      );
    case "quote":
      return <blockquote className="border-l-2 border-primary/70 bg-primary/[0.06] px-4 py-2 italic text-muted-foreground">{renderInline(block.lines.join("\n"), `quote-${block.lines[0]}`)}</blockquote>;
    case "code":
      return (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-black/40">
          {block.language ? <div className="border-b border-border/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{block.language}</div> : null}
          <pre className="scrollbar-thin overflow-x-auto p-3 font-mono text-[12px] leading-6 text-foreground"><code>{block.value}</code></pre>
        </div>
      );
    case "table":
      return (
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border/70">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-secondary/70"><tr>{block.headers.map((header, index) => <th key={index} className="border-b border-border/70 px-3 py-2 font-bold text-foreground">{renderInline(header, `th-${index}`)}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="odd:bg-card/40">{block.headers.map((_, columnIndex) => <td key={columnIndex} className="border-b border-border/50 px-3 py-2 align-top text-muted-foreground">{renderInline(row[columnIndex] ?? "", `td-${rowIndex}-${columnIndex}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr className="border-border/70" />;
  }
}

function parseMarkdown(source: string): { blocks: Block[] } {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? "")) { code.push(lines[index] ?? ""); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence[1] ?? "", value: code.join("\n") });
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const text = heading[2]!.trim();
      const base = slugify(text) || "section";
      const count = usedIds.get(base) ?? 0;
      usedIds.set(base, count + 1);
      blocks.push({ kind: "heading", level: heading[1]!.length, text, id: count ? `${base}-${count + 1}` : base });
      index += 1;
      continue;
    }

    if (/^\s*(\*\s*){3,}$/.test(line) || /^\s*(-\s*){3,}$/.test(line)) { blocks.push({ kind: "rule" }); index += 1; continue; }

    if (isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes("|")) { rows.push(splitTableRow(lines[index]!)); index += 1; }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    const listMatch = line.match(/^\s*([-*+] |\d+[.)] )(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]!);
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*([-*+] |\d+[.)] )(.+)$/);
        if (!item || /^\d/.test(item[1]!) !== ordered) break;
        items.push(item[2]!); index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index] ?? "")) { quote.push((lines[index] ?? "").replace(/^\s*>\s?/, "")); index += 1; }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index]!.trim() && !isBlockStart(lines[index]!, lines[index + 1])) { paragraph.push(lines[index]!); index += 1; }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return { blocks };
}

function isBlockStart(line: string, nextLine?: string) {
  return /^\s*```/.test(line) || /^\s*#{1,6}\s+/.test(line) || /^\s*(?:[-*+] |\d+[.)] |>)/.test(line) || /^\s*(?:\*\s*){3,}$/.test(line) || /^\s*(?:-\s*){3,}$/.test(line) || isTableSeparator(nextLine);
}

function isTableSeparator(line?: string) {
  return Boolean(line && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line));
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function slugify(value: string) {
  return value.replace(/[`*_~]/g, "").toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/[\s-]+/g, "-");
}

function renderInline(value: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\[[^\]]+\]\([^\s)]+\)|https?:\/\/[^\s<]+|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${count++}`;
    if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key} className="font-bold text-foreground">{token.slice(2, -2)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    else if (token.startsWith("*") || token.startsWith("_")) nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.88em] text-primary">{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      nodes.push(link ? <SafeLink key={key} href={link[2]!}>{link[1]!}</SafeLink> : token);
    } else {
      nodes.push(<SafeLink key={key} href={token.replace(/[.,!?;:]+$/, "")}>{token}</SafeLink>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return nodes;
}

function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = /^(?:https?:\/\/|mailto:)/i.test(href);
  if (!safe) return <>{children}</>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">{children}</a>;
}
