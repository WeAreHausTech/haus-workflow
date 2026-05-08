import { SENSITIVE_PATHS } from "./sensitive-paths.js";

export function guardFileAccess(candidate: string): string | undefined {
  const matched = SENSITIVE_PATHS.find((token) => candidate.includes(token.replace("*", "")));
  if (matched) return `Blocked sensitive path: ${candidate}`;
  return undefined;
}
