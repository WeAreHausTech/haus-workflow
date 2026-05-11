import type { ContextMap } from "../types.js";

// TODO(refactor-scanner): Not used by scan-project.ts; align with repo-summary output or remove.
export function summarizeRepo(context: ContextMap): string {
  return `# Haus repo summary

- repo: ${context.repoName}
- package manager: ${context.packageManager}
- roles: ${context.repoRoles.join(", ") || "unknown"}
`;
}
