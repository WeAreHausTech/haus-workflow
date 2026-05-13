import fs from "node:fs";

import yaml from "yaml";

const file = "library/catalog/sources.yaml";
const content = fs.readFileSync(file, "utf8");
const parsed = yaml.parse(content) as {
  sources?: Array<{
    id: string;
    url?: string;
    status?: string;
    policy?: string;
    pinnedVersion?: string;
    pinnedHash?: string;
    license?: string;
    unsafeHookCommands?: string[];
  }>;
};
const issues: string[] = [];
for (const source of parsed.sources ?? []) {
  if (!source.url) issues.push(`${source.id}: missing url`);
  if (!source.status) issues.push(`${source.id}: missing status`);
  if (!source.policy) issues.push(`${source.id}: missing policy`);
  if (!source.pinnedVersion) issues.push(`${source.id}: missing pinnedVersion`);
  if (!source.pinnedHash) issues.push(`${source.id}: missing pinnedHash`);
  if (!source.license) issues.push(`${source.id}: missing license`);
  if ((source.unsafeHookCommands ?? []).length > 0) issues.push(`${source.id}: unsafeHookCommands not empty`);
}
if (issues.length) {
  issues.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log("Source audit passed.");
