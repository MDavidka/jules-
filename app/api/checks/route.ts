import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api-response.server";
import { checkCommandSchema } from "@/lib/validators";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 200_000;

const CHECK_COMMANDS = {
  test: { label: "Test", args: ["test", "--", "--run"] },
  typecheck: { label: "Type check", args: ["run", "typecheck"] },
  lint: { label: "Lint", args: ["run", "lint"] },
  build: { label: "Build", args: ["run", "build"] },
} as const;

export const dynamic = "force-dynamic";

/**
 * Runs one of the small, fixed set of checks in the server's configured
 * workspace. The browser supplies an identifier, never a shell command or a
 * working-directory path. Set CHECKS_SOURCE when the workspace is dedicated
 * to one Jules source; this prevents accidentally checking another repo.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const parsed = checkCommandSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Choose a valid check and repository.", 422, {
        code: "VALIDATION_ERROR",
      });
    }

    const workspaceRoot = process.env.CHECKS_WORKSPACE_ROOT?.trim();
    if (!workspaceRoot) {
      return jsonError(
        "Checks are not configured. Set CHECKS_WORKSPACE_ROOT on the server to an authorized checkout.",
        503,
        { code: "CHECKS_NOT_CONFIGURED" },
      );
    }

    const expectedSource = process.env.CHECKS_SOURCE?.trim();
    if (expectedSource && expectedSource !== parsed.data.source) {
      return jsonError("This workspace is not configured for the selected repository.", 403, {
        code: "CHECKS_SOURCE_NOT_ALLOWED",
      });
    }

    const check = CHECK_COMMANDS[parsed.data.command];
    const startedAt = Date.now();
    const safeEnv = {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      CI: "1",
      NODE_ENV: process.env.NODE_ENV ?? "production",
    };

    try {
      const result = await execFileAsync("npm", check.args, {
        cwd: workspaceRoot,
        env: safeEnv,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_LENGTH,
        shell: false,
        signal: request.signal,
      });

      return NextResponse.json({
        command: parsed.data.command,
        label: check.label,
        invocation: `npm ${check.args.join(" ")}`,
        output: truncateOutput(result.stdout),
        errorOutput: truncateOutput(result.stderr),
        exitCode: 0,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const commandError = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        signal?: string;
        killed?: boolean;
      };
      const exitCode = typeof commandError.code === "number" ? commandError.code : null;
      const timedOut = commandError.killed || commandError.signal === "SIGTERM";

      return NextResponse.json(
        {
          command: parsed.data.command,
          label: check.label,
          invocation: `npm ${check.args.join(" ")}`,
          output: truncateOutput(commandError.stdout),
          errorOutput: truncateOutput(
            timedOut
              ? `${commandError.stderr ?? ""}\nCheck stopped after ${COMMAND_TIMEOUT_MS / 1000} seconds.`
              : commandError.stderr,
          ),
          exitCode,
          durationMs: Date.now() - startedAt,
          timedOut,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    return handleRouteError(error);
  }
}

function truncateOutput(value: string | undefined) {
  if (!value) return "";
  return value.length > MAX_OUTPUT_LENGTH
    ? `${value.slice(0, MAX_OUTPUT_LENGTH)}\n… output truncated …`
    : value;
}
