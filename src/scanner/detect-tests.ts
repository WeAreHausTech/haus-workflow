export function detectTests(deps: string[], files: string[]): string[] {
  const out: string[] = [];
  if (deps.includes("@playwright/test") || files.some((f) => f.startsWith("playwright.config."))) out.push("playwright");
  if (deps.some((d) => d.startsWith("@testing-library/"))) out.push("testing-library");
  if (files.includes("phpunit.xml")) out.push("phpunit");
  return out;
}
