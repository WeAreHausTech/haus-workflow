// TODO(refactor-scanner): Not wired into scan-project.ts; merge or remove when modular scanner lands.
export function detectDotnet(files: string[]): string[] {
  if (files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) return ["dotnet-service"];
  return [];
}
