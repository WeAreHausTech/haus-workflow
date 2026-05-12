import { execa, type Options as ExecaOptions } from "execa";

export type CommandResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function runCommand(
  command: string,
  args: string[] = [],
  options: ExecaOptions = {}
): Promise<CommandResult> {
  try {
    const result = await execa(command, args, {
      reject: false,
      ...options
    });
    return {
      command,
      args,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run command: ${command} ${args.join(" ")} (${message})`);
  }
}

export async function runGit(args: string[], options: ExecaOptions = {}): Promise<CommandResult> {
  return runCommand("git", args, options);
}

export async function commandExists(command: string): Promise<boolean> {
  const result = await runCommand(command, ["--version"]);
  return result.exitCode === 0;
}
