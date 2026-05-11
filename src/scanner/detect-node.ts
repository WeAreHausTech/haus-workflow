// TODO(refactor-scanner): Not wired into scan-project.ts; merge or remove when modular scanner lands.
export function detectNode(deps: string[]): string[] {
  const out: string[] = [];
  if (deps.includes("typescript")) out.push("typescript6");
  if (deps.includes("next")) out.push("nextjs");
  if (deps.includes("react")) out.push("react19");
  if (deps.includes("vite")) out.push("vite8");
  return out;
}
