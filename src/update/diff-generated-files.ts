export function diffGeneratedFiles(): string {
  return "Generated files may change in .claude/* and .haus-ai/haus.lock.json. Review git diff before apply.";
}
