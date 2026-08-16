import "server-only";

import { Client } from "ssh2";
import { randomUUID } from "node:crypto";

import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import { normalizeInstanceType, type InstanceType } from "@/lib/instance-types";
import {
  connectToDatabase,
  SshApproval,
  SshInstance,
  type SshApprovalDoc,
  type SshInstanceDoc,
} from "@/lib/mongodb.server";

const SSH_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_LENGTH = 200_000;

export type SshActionKind = "command" | "write_file";
export type SshActionStatus = "pending" | "approved" | "rejected" | "completed" | "failed";

export interface SshInstanceSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  /** Canonical operating system family, e.g. "ubuntu" or "almalinux". */
  instanceType: InstanceType;
  lastConnectedAt: string | null;
  createdAt: string;
}

export interface SshActionResult {
  actionId: string;
  status: SshActionStatus;
  output?: string;
  errorOutput?: string;
  exitCode?: number | null;
  durationMs?: number;
}

export function serializeSshInstance(instance: SshInstanceDoc): SshInstanceSummary {
  return {
    id: String(instance._id),
    name: instance.name,
    host: instance.host,
    port: instance.port,
    username: instance.username,
    instanceType: normalizeInstanceType(instance.instanceType),
    lastConnectedAt: instance.lastConnectedAt?.toISOString() ?? null,
    createdAt: instance.createdAt.toISOString(),
  };
}

export async function listSshInstances() {
  await connectToDatabase();
  const items = await SshInstance.find().sort({ createdAt: -1 }).lean<SshInstanceDoc[]>().exec();
  return items.map(serializeSshInstance);
}

export async function createSshInstance(input: {
  name: string;
  host: string;
  port?: number;
  username?: string;
  instanceType?: string;
  password: string;
}) {
  await connectToDatabase();
  const encrypted = encryptSecret(input.password);
  const instance = await SshInstance.create({
    _id: randomUUID(),
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port ?? 22,
    username: input.username?.trim() || "root",
    instanceType: normalizeInstanceType(input.instanceType),
    passwordEncrypted: encrypted.ciphertext,
    passwordIv: encrypted.iv,
    passwordAuthTag: encrypted.authTag,
  });
  return serializeSshInstance(instance);
}

export async function deleteSshInstance(id: string) {
  await connectToDatabase();
  await SshApproval.deleteMany({ instanceId: id }).exec();
  const result = await SshInstance.deleteOne({ _id: id }).exec();
  if (result.deletedCount !== 1) throw new Error("SSH instance not found.");
}

export function isCriticalCommand(command: string) {
  return /(^|\s)(sudo|su|rm|mv|cp|chmod|chown|systemctl|service|reboot|shutdown|halt|poweroff|apt|apt-get|yum|dnf|docker|kill|pkill|mount|umount|iptables|ufw)(\s|$)|(^|\s)(tee|sed)\s|[<>]/i.test(command);
}

export async function createSshAction(input: {
  instanceId: string;
  kind: SshActionKind;
  command?: string;
  path?: string;
  content?: string;
  runAsRoot?: boolean;
}) {
  await connectToDatabase();
  const instance = await SshInstance.findById(input.instanceId).lean<SshInstanceDoc>().exec();
  if (!instance) throw new Error("SSH instance not found.");

  const command = input.kind === "write_file"
    ? `write file ${input.path ?? ""}`
    : input.command?.trim() ?? "";
  const critical = input.kind === "write_file" || input.runAsRoot === true || isCriticalCommand(command);

  if (input.kind === "command" && !command) throw new Error("Command is required.");
  if (input.kind === "write_file" && (!input.path?.startsWith("/") || typeof input.content !== "string")) {
    throw new Error("An absolute file path and file content are required.");
  }

  if (!critical) return executeSshActionNow(input, instance);

  const action = await SshApproval.create({
    _id: randomUUID(),
    instanceId: input.instanceId,
    kind: input.kind,
    command: input.command ?? null,
    path: input.path ?? null,
    content: input.content ?? null,
    runAsRoot: input.runAsRoot === true,
    critical: true,
    status: "pending",
  });
  return {
    actionId: String(action._id),
    status: "pending" as const,
    reason: "This action requires explicit approval before execution.",
  };
}

export async function listPendingSshActions() {
  await connectToDatabase();
  return SshApproval.find({ status: "pending" }).sort({ createdAt: -1 }).lean<SshApprovalDoc[]>().exec();
}

export async function approveSshAction(id: string, approved: boolean): Promise<SshActionResult> {
  await connectToDatabase();
  const action = await SshApproval.findOne({ _id: id, status: "pending" }).exec();
  if (!action) throw new Error("Approval request not found or already handled.");
  if (!approved) {
    action.status = "rejected";
    await action.save();
    return { actionId: id, status: "rejected" };
  }

  const instance = await SshInstance.findById(action.instanceId).lean<SshInstanceDoc>().exec();
  if (!instance) throw new Error("SSH instance not found.");
  action.status = "approved";
  await action.save();

  try {
    const result = await executeSshActionNow({
      instanceId: String(action.instanceId),
      kind: action.kind,
      command: action.command ?? undefined,
      path: action.path ?? undefined,
      content: action.content ?? undefined,
      runAsRoot: action.runAsRoot,
    }, instance);
    action.status = result.status === "completed" ? "completed" : "failed";
    action.output = result.output ?? "";
    action.errorOutput = result.errorOutput ?? "";
    action.exitCode = result.exitCode ?? null;
    action.durationMs = result.durationMs ?? null;
    await action.save();
    return result;
  } catch (error) {
    action.status = "failed";
    action.errorOutput = error instanceof Error ? error.message : "SSH action failed.";
    await action.save();
    throw error;
  }
}

async function executeSshActionNow(
  input: { instanceId: string; kind: SshActionKind; command?: string; path?: string; content?: string; runAsRoot?: boolean },
  instance: SshInstanceDoc,
): Promise<SshActionResult> {
  const started = Date.now();
  const client = await connectSsh(instance);
  try {
    const command = input.kind === "write_file"
      ? `printf '%s' ${shellQuote(Buffer.from(input.content ?? "", "utf8").toString("base64"))} | base64 -d > ${shellQuote(input.path ?? "")}`
      : input.command!.trim();
    const remoteCommand = input.runAsRoot && instance.username !== "root"
      ? `sudo -S -p '' sh -c ${shellQuote(command)}`
      : command;
    const result = await execCommand(client, remoteCommand, input.runAsRoot && instance.username !== "root" ? `${decryptPassword(instance)}\n` : undefined);
    await SshInstance.updateOne({ _id: instance._id }, { $set: { lastConnectedAt: new Date() } }).exec();
    return {
      actionId: "direct",
      status: result.exitCode === 0 ? "completed" : "failed",
      output: result.output,
      errorOutput: result.errorOutput,
      exitCode: result.exitCode,
      durationMs: Date.now() - started,
    };
  } finally {
    client.end();
  }
}

function decryptPassword(instance: SshInstanceDoc) {
  return decryptSecret({
    ciphertext: instance.passwordEncrypted,
    iv: instance.passwordIv,
    authTag: instance.passwordAuthTag,
  });
}

function connectSsh(instance: SshInstanceDoc) {
  return new Promise<Client>((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      client.end();
      reject(new Error("SSH connection timed out."));
    }, SSH_TIMEOUT_MS);
    client.once("ready", () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`SSH connection failed: ${error.message}`));
    });
    client.connect({
      host: instance.host,
      port: instance.port,
      username: instance.username,
      password: decryptPassword(instance),
      readyTimeout: SSH_TIMEOUT_MS,
      hostHash: "sha256",
    });
  });
}

function execCommand(client: Client, command: string, stdin?: string) {
  return new Promise<{ output: string; errorOutput: string; exitCode: number | null }>((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) return reject(new Error(`SSH command failed: ${error.message}`));
      let output = "";
      let errorOutput = "";
      if (stdin) stream.write(stdin);
      stream.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString("utf8")}`.slice(0, MAX_OUTPUT_LENGTH); });
      stream.stderr.on("data", (chunk: Buffer) => { errorOutput = `${errorOutput}${chunk.toString("utf8")}`.slice(0, MAX_OUTPUT_LENGTH); });
      stream.once("close", (code: number | null) => resolve({ output, errorOutput, exitCode: code }));
    });
  });
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
