export function parseTaskIntent(task: string): string[] {
  const t = task.toLowerCase();
  const intents: string[] = [];
  if (t.includes("build")) intents.push("building features");
  if (t.includes("bug") || t.includes("fix")) intents.push("fixing bugs");
  if (t.includes("review")) intents.push("reviewing code");
  if (t.includes("test")) intents.push("writing tests");
  if (t.includes("doc")) intents.push("documentation");
  if (t.includes("setup")) intents.push("project setup");
  return intents;
}
