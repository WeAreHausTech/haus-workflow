// TODO(refactor-scanner): Not wired into scan-project.ts; merge or remove when modular scanner lands.
export function detectMonorepo(files: string[]): string[] {
  const out: string[] = [];
  if (files.includes("nx.json")) out.push("nx-monorepo");
  if (files.includes("turbo.json")) out.push("turbo-monorepo");
  return out;
}
