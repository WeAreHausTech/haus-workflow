// TODO(refactor-scanner): Not wired into scan-project.ts; merge or remove when modular scanner lands.
export function detectPhp(composerDeps: string[]): string[] {
  const out: string[] = [];
  if (composerDeps.includes("laravel/framework")) out.push("laravel");
  if (composerDeps.includes("laravel/nova")) out.push("laravel-nova");
  if (composerDeps.includes("roots/bedrock")) out.push("wordpress-bedrock");
  return out;
}
