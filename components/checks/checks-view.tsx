import { KeyRound, LoaderCircle, Plus, Server, ShieldAlert, TerminalSquare, Trash2 } from "lucide-react";
import * as React from "react";

import { InstanceTypeIcon } from "@/components/icons/instance-type-icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { INSTANCE_TYPE_OPTIONS, instanceTypeLabel } from "@/lib/instance-types";
import { cn, errorMessage } from "@/lib/utils";
import type { NormalizedSource } from "@/types/jules";

type Instance = { id: string; name: string; host: string; port: number; username: string; instanceType: string; lastConnectedAt: string | null; createdAt: string };
type Approval = { _id: string; instanceId: string; kind: "command" | "write_file"; command?: string | null; path?: string | null; content?: string | null; runAsRoot: boolean; status: string; createdAt: string };
type ActionResult = { status: string; actionId: string; output?: string; errorOutput?: string; exitCode?: number | null; reason?: string };

interface ChecksViewProps { selectedSource: NormalizedSource | null }

export function ChecksView(_props: ChecksViewProps) {
  const [instances, setInstances] = React.useState<Instance[]>([]);
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [name, setName] = React.useState("");
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("22");
  const [username, setUsername] = React.useState("root");
  const [instanceType, setInstanceType] = React.useState("ubuntu");
  const [password, setPassword] = React.useState("");
  const [command, setCommand] = React.useState("uname -a");
  const [path, setPath] = React.useState("/etc/example.conf");
  const [content, setContent] = React.useState("");
  const [runAsRoot, setRunAsRoot] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ActionResult | null>(null);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/ssh", { cache: "no-store" });
    const data = await response.json() as { instances?: Instance[]; approvals?: Approval[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load SSH instances.");
    setInstances(data.instances ?? []);
    setApprovals(data.approvals ?? []);
    setSelectedId((current) => current || data.instances?.[0]?.id || "");
  }, []);

  React.useEffect(() => { void load().catch((requestError) => setError(errorMessage(requestError))); }, [load]);

  const addInstance = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/ssh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, host, port: Number(port), username, instanceType, password }) });
      const data = await response.json() as { instance?: Instance; error?: string };
      if (!response.ok || !data.instance) throw new Error(data.error ?? "Could not add SSH instance.");
      setInstances((current) => [data.instance!, ...current]); setSelectedId(data.instance.id); setName(""); setHost(""); setPassword(""); setInstanceType("ubuntu"); setShowAdd(false);
    } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  const removeInstance = async (id: string) => {
    if (!window.confirm("Remove this instance and its pending approvals?")) return;
    setBusy(true); setError(null);
    try { const response = await fetch(`/api/ssh/${encodeURIComponent(id)}`, { method: "DELETE" }); if (!response.ok) throw new Error("Could not remove SSH instance."); setInstances((current) => current.filter((item) => item.id !== id)); if (selectedId === id) setSelectedId(""); }
    catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  const runAction = async (kind: "command" | "write_file") => {
    if (!selectedId) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/ssh/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instanceId: selectedId, kind, command: kind === "command" ? command : undefined, path: kind === "write_file" ? path : undefined, content: kind === "write_file" ? content : undefined, runAsRoot }) });
      const data = await response.json() as ActionResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The SSH action failed.");
      setResult(data); await load();
    } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  const decide = async (id: string, approved: boolean) => {
    setBusy(true); setError(null);
    try { const response = await fetch(`/api/ssh/actions/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved }) }); const data = await response.json() as ActionResult & { error?: string }; if (!response.ok) throw new Error(data.error ?? "Could not apply approval decision."); setResult(data); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  const selected = instances.find((instance) => instance.id === selectedId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1"><div className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" aria-hidden="true" /><h2 className="text-xl font-semibold tracking-tight text-foreground">Instances</h2></div><p className="text-sm leading-relaxed text-muted-foreground">Your connected VPS instances. The agent can inspect, run commands, and edit files with approval for critical changes.</p></div>
        <Button onClick={() => setShowAdd((value) => !value)}><Plus className="h-4 w-4" aria-hidden="true" />Add instance</Button>
      </div>

      {showAdd ? <section className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:grid-cols-2" aria-label="Add SSH instance">
        <input className="field" placeholder="Name, e.g. production" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="field" placeholder="IP address or hostname" value={host} onChange={(event) => setHost(event.target.value)} />
        <input className="field" type="number" min="1" max="65535" placeholder="Port" value={port} onChange={(event) => setPort(event.target.value)} />
        <input className="field" placeholder="SSH username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <label className="flex items-center gap-3 sm:col-span-2">
          <InstanceTypeIcon type={instanceType} className="h-6 w-6" labelled />
          <span className="sr-only">Instance type</span>
          <select className="field" value={instanceType} onChange={(event) => setInstanceType(event.target.value)}>
            {INSTANCE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <input className="field sm:col-span-2" type="password" autoComplete="new-password" placeholder="SSH password — encrypted before storage" value={password} onChange={(event) => setPassword(event.target.value)} />
        <div className="flex gap-2 sm:col-span-2"><Button onClick={() => void addInstance()} disabled={busy || !name || !host || !password}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Save instance</Button><Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button></div>
      </section> : null}

      {instances.length === 0 ? <EmptyState icon={Server} title="No instances yet" description="Add a VPS to give the agent a controlled, approval-gated execution target." /> : <section className="grid gap-3">{instances.map((instance) => <button key={instance.id} type="button" onClick={() => setSelectedId(instance.id)} className={cn("flex min-h-28 items-center justify-between gap-4 rounded-3xl border px-6 py-5 text-left transition-all", selectedId === instance.id ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.15)]" : "border-border/70 bg-card/90 hover:border-border hover:bg-accent")}><div className="flex min-w-0 items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted"><InstanceTypeIcon type={instance.instanceType} className="h-6 w-6" labelled /></span><div className="min-w-0"><p className="truncate text-base font-semibold text-foreground">{instance.name}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{instance.username}@{instance.host}:{instance.port}</p><p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-400" />Ready for agent tasks</p></div></div><div className="hidden shrink-0 text-right sm:block"><p className="text-sm font-medium text-foreground">{instanceTypeLabel(instance.instanceType)}</p><p className="mt-1 text-xs text-muted-foreground">Approval protected</p></div></button>)}</section>}

      {selected ? <>
        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><InstanceTypeIcon type={selected.instanceType} className="h-8 w-8" labelled /><div className="min-w-0"><p className="font-medium text-foreground">{selected.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{instanceTypeLabel(selected.instanceType)}</span></p><p className="truncate font-mono text-xs text-muted-foreground">{selected.username}@{selected.host}:{selected.port}</p></div></div><Button variant="outline" onClick={() => void removeInstance(selected.id)} disabled={busy}><Trash2 className="h-4 w-4" />Remove</Button></div><div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Root execution is available through the configured SSH account or sudo. File edits and privileged commands are always held for approval.</span></div></section>
        <section className="grid gap-4 lg:grid-cols-2"><div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-center gap-2"><TerminalSquare className="h-4 w-4" /><h3 className="font-medium">Run command</h3></div><textarea className="field min-h-28 font-mono text-xs" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="e.g. systemctl status nginx" /><label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={runAsRoot} onChange={(event) => setRunAsRoot(event.target.checked)} />Run with root privileges</label><Button onClick={() => void runAction("command")} disabled={busy || !command.trim()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Run command</Button></div><div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-center gap-2"><KeyRound className="h-4 w-4" /><h3 className="font-medium">Edit file</h3></div><input className="field font-mono text-xs" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/absolute/path/to/file" /><textarea className="field min-h-28 font-mono text-xs" value={content} onChange={(event) => setContent(event.target.value)} placeholder="New file contents" /><Button onClick={() => void runAction("write_file")} disabled={busy || !path.startsWith("/")}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Request file edit</Button></div></section>
      </> : null}

      {approvals.length > 0 ? <section className="space-y-3"><h3 className="font-medium text-foreground">Pending approvals</h3>{approvals.map((approval) => <div key={approval._id} className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><div><p className="text-sm font-medium text-foreground">{approval.kind === "write_file" ? `Edit ${approval.path}` : "Run privileged command"}</p><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-mono text-xs text-muted-foreground">{approval.kind === "write_file" ? approval.content : approval.command}</pre></div><div className="flex gap-2"><Button onClick={() => void decide(approval._id, true)} disabled={busy}>Approve and run</Button><Button variant="outline" onClick={() => void decide(approval._id, false)} disabled={busy}>Reject</Button></div></div>)}</section> : null}
      {result ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-black/40 p-3 font-mono text-xs text-foreground">{result.reason ?? ([result.output, result.errorOutput].filter(Boolean).join("\n") || `Status: ${result.status}`)}</pre> : null}
      {error ? <ErrorState title="SSH action unavailable" message={error} /> : null}
    </div>
  );
}
