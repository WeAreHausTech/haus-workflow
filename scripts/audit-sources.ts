import fs from "node:fs";
import yaml from "yaml";

const file = "library/catalog/sources.yaml";
const content = fs.readFileSync(file, "utf8");
const parsed = yaml.parse(content) as { sources?: Array<{ id: string; pinned?: string; policy?: string }> };
const issues: string[] = [];
for (const source of parsed.sources ?? []) {
  if (!source.pinned) issues.push(`${source.id}: missing pinned`);
  if (!source.policy) issues.push(`${source.id}: missing policy`);
}
if (issues.length) {
  issues.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log("Source audit passed.");
