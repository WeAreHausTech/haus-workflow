/** Shell execution helpers — run external commands and git without throwing on non-zero exits. */

import { execa, type Options as ExecaOptions } from "execa";

/** Structured result returned by every command execution. */
export type CommandResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Run an arbitrary shell command, never throwing on non-zero exit codes.
 * Throws only if the process itself cannot be spawned.
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: ExecaOptions = {},
): Promise<CommandResult> {
  try {
    const result = await execa(command, args, {
      reject: false, // non-zero exits are returned, not thrown
      ...options,
    });
    return {
      command,
      args,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: result.exitCode ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run command: ${command} ${args.join(" ")} (${message})`);
  }
}

/** Convenience wrapper for git commands. */
export async function runGit(args: string[], options: ExecaOptions = {}): Promise<CommandResult> {
  return runCommand("git", args, options);
}

/** Check whether a CLI tool is available on PATH by running `<command> --version`. */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await runCommand(command, ["--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
