import type { ContextMap } from "../types.js";

export function summarizeRepo(context: ContextMap): string {
  return `# Haus repo summary

- repo: ${context.repoName}
- package manager: ${context.packageManager}
- roles: ${context.repoRoles.join(", ") || "unknown"}
`;
}
