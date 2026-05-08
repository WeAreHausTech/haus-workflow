export function detectRepoRole(stacks: Record<string, string[]>): string[] {
  const all = Object.values(stacks).flat();
  const roles = new Set<string>();
  if (all.includes("nextjs")) roles.add("next-app");
  if (all.includes("react19")) roles.add("react-app");
  if (all.includes("vite8")) roles.add("vite-app");
  if (all.includes("laravel")) roles.add("laravel-app");
  if (all.includes("wordpress-bedrock")) roles.add("wordpress-bedrock-site");
  if (all.includes("dotnet-service")) roles.add("dotnet-service");
  return [...roles];
}
