import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { loadCatalog } from "../catalog/load-catalog.js";
import type { CatalogItem } from "../types.js";

const PLACEHOLDER_RE = /\b(PLACEHOLDER|TBD|FIXME)\b/i;

/** `npx` is allowed only when the next token is `tsx`. */
const DISALLOWED_NPX_RE = /\bnpx\s+(?!tsx\b)\S+/i;

const RISKY_INVOCATION_RES: RegExp[] = [
  /\bnpx\s+-y\b/i,
  /\bnpx\s+--yes\b/i,
  /\byarn\s+dlx\b/i,
  /\bpnpm\s+dlx\b/i,
  /\bcurl\s+[^\n|]+\|\s*(ba)?sh\b/i
];

const BANNED_AGENT_SUBSTRINGS = ["autonomous", "swarm", "delegate", "orchestrat", "marketplace"];

function isLibraryPath(p: string): boolean {
  return p.startsWith("library/");
}

function auditCatalogLibraryItems(root: string, items: CatalogItem[]): string[] {
  const failures: string[] = [];
  for (const item of items) {
    if (!isLibraryPath(item.path)) continue;

    const abs = path.resolve(root, item.path);

    if (item.type === "skill") {
      const skillMd = path.join(abs, "SKILL.md");
      if (!fs.existsSync(skillMd)) {
        failures.push(`${item.id}: missing ${path.relative(root, skillMd)}`);
        continue;
      }
      const text = fs.readFileSync(skillMd, "utf8");
      if (!text.includes("## Use when")) {
        failures.push(`${item.id}: SKILL.md missing ## Use when`);
      }
      if (!text.includes("## Do not use when")) {
        failures.push(`${item.id}: SKILL.md missing ## Do not use when`);
      }
    } else if (item.type === "agent") {
      if (!fs.existsSync(abs)) {
        failures.push(`${item.id}: missing agent file ${item.path}`);
        continue;
      }
      const text = fs.readFileSync(abs, "utf8");
      if (!text.startsWith("---")) {
        failures.push(`${item.id}: agent file missing YAML frontmatter`);
      }
      if (!text.includes("## Use when")) {
        failures.push(`${item.id}: agent file missing ## Use when`);
      }
      if (!text.includes("## Do not use when")) {
        failures.push(`${item.id}: agent file missing ## Do not use when`);
      }
      if (!text.includes("## Verification")) {
        failures.push(`${item.id}: agent file missing ## Verification`);
      }
      const lower = text.toLowerCase();
      for (const ban of BANNED_AGENT_SUBSTRINGS) {
        if (lower.includes(ban)) {
          failures.push(`${item.id}: agent file contains disallowed phrase "${ban}"`);
        }
      }
    }
  }
  return failures;
}

function auditHausMarkdownContent(root: string): string[] {
  const failures: string[] = [];
  const files = fg.sync(["library/haus/**/*.md"], { cwd: root, absolute: true, onlyFiles: true });

  for (const abs of files) {
    const rel = path.relative(root, abs);
    const text = fs.readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (PLACEHOLDER_RE.test(line)) {
        failures.push(`${rel}:${i + 1}: placeholder token in shipped library line`);
      }
      if (DISALLOWED_NPX_RE.test(line)) {
        failures.push(`${rel}:${i + 1}: disallowed npx (only npx tsx is allowed in library docs)`);
      }
      for (const re of RISKY_INVOCATION_RES) {
        if (re.test(line)) {
          failures.push(`${rel}:${i + 1}: risky community install or pipe pattern`);
        }
      }
    }
  }

  return failures;
}

/**
 * Structural and policy checks for Haus-owned files under `library/`
 * (catalog-backed skills and agents, plus markdown under library/haus).
 */
export async function auditLibrary(root: string): Promise<string[]> {
  const items = await loadCatalog(root);
  const a = auditCatalogLibraryItems(root, items);
  const b = auditHausMarkdownContent(root);
  return [...a, ...b];
}
