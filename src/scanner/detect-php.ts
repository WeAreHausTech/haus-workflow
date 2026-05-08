export function detectPhp(composerDeps: string[]): string[] {
  const out: string[] = [];
  if (composerDeps.includes("laravel/framework")) out.push("laravel");
  if (composerDeps.includes("laravel/nova")) out.push("laravel-nova");
  if (composerDeps.includes("roots/bedrock")) out.push("wordpress-bedrock");
  return out;
}
