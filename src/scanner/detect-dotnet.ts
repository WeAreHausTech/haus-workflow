export function detectDotnet(files: string[]): string[] {
  if (files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) return ["dotnet-service"];
  return [];
}
