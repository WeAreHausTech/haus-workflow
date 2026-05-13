import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { loadCatalog } from "../catalog/load-catalog.js";
import type { CatalogItem } from "../types.js";

const PLACEHOLDER_OR_TODO_RE = /\b(TODO|FIXME|PLACEHOLDER|TBD)\b/i;

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

/** Markdown shipped as skills, agents, or catalog (not src/tests/scripts). */
const SHIPPED_MD_GLOBS = ["library/haus/**/*.md", "plugin/skills/**/*.md", "plugin/agents/**/*.md"] as const;

const MANIFEST_REL = "library/catalog/manifest.json";

function isLibraryPath(p: string): boolean {
  return p.startsWith("library/");
}

function isCatalogInstallable(item: CatalogItem): boolean {
  if (item.type !== "skill" && item.type !== "agent") return false;
  return item.installMode !== "plugin-only";
}

function referenceBaseDir(root: string, item: CatalogItem): string {
  const abs = path.resolve(root, item.path);
  return item.type === "agent" ? path.dirname(abs) : abs;
}

function auditCatalogManifest(root: string, items: CatalogItem[]): string[] {
  const failures: string[] = [];
  const installablePathToIds = new Map<string, string[]>();

  for (const item of items) {
    const normPath = item.path.replace(/\\/g, "/");

    if (isCatalogInstallable(item)) {
      const isHaus = item.source === "haus";
      const isCuratedApproved = item.source === "curated" && item.reviewStatus === "approved";
      if (!isHaus && !isCuratedApproved) {
        const hint =
          item.source === "curated"
            ? ` (curated items require reviewStatus:"approved", got "${item.reviewStatus ?? "unset"}")`
            : ` (must be "haus" or "curated" with reviewStatus:"approved")`;
        failures.push(`${item.id}: installable catalog item has invalid source/reviewStatus${hint}`);
      }
      if (item.source === "curated") {
        if (!item.originSourceId) {
          failures.push(`${item.id}: curated item missing required field originSourceId`);
        }
        if (!item.license) {
          failures.push(`${item.id}: curated item missing required field license`);
        }
        if (!item.riskLevel) {
          failures.push(`${item.id}: curated item missing required field riskLevel`);
        }
        if (item.riskLevel === "blocked") {
          failures.push(`${item.id}: curated item riskLevel is "blocked" and cannot be installed`);
        }
      }
      const list = installablePathToIds.get(normPath) ?? [];
      list.push(item.id);
      installablePathToIds.set(normPath, list);
    }

    const refs = item.references;
    if (!refs || refs.length === 0) continue;

    const base = referenceBaseDir(root, item);
    for (const ref of refs) {
      // External https:// references are doc URLs — no local file to check
      if (/^https:\/\//i.test(ref)) continue;
      // Plain http:// references are disallowed — all external refs must use HTTPS
      if (/^http:\/\//i.test(ref)) {
        failures.push(`${item.id}: catalog references[] entry uses insecure http URL: ${ref}`);
        continue;
      }
      const refAbs = path.resolve(base, ref);
      if (!fs.existsSync(refAbs)) {
        failures.push(
          `${item.id}: catalog references[] entry does not resolve: ${ref} (expected ${path.relative(root, refAbs)})`
        );
      }
    }
  }

  for (const [p, ids] of installablePathToIds) {
    if (ids.length > 1) {
      failures.push(`duplicate installable catalog path "${p}" for ids: ${ids.join(", ")}`);
    }
  }

  return failures;
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

function auditPluginSkills(root: string): string[] {
  const failures: string[] = [];
  const skillMds = fg.sync(["plugin/skills/**/SKILL.md"], { cwd: root, absolute: true, onlyFiles: true });
  for (const skillMd of skillMds) {
    const rel = path.relative(root, skillMd);
    const text = fs.readFileSync(skillMd, "utf8");
    if (!text.includes("## Use when")) {
      failures.push(`${rel}: missing ## Use when`);
    }
    if (!text.includes("## Do not use when")) {
      failures.push(`${rel}: missing ## Do not use when`);
    }
  }
  return failures;
}

function auditPluginAgents(root: string): string[] {
  const failures: string[] = [];
  const agents = fg.sync(["plugin/agents/*.md"], { cwd: root, absolute: true, onlyFiles: true });
  for (const abs of agents) {
    const rel = path.relative(root, abs);
    const text = fs.readFileSync(abs, "utf8");
    if (!text.startsWith("---")) {
      failures.push(`${rel}: missing YAML frontmatter`);
    }
    if (!text.includes("## Use when")) {
      failures.push(`${rel}: missing ## Use when`);
    }
    if (!text.includes("## Do not use when")) {
      failures.push(`${rel}: missing ## Do not use when`);
    }
    if (!text.includes("## Verification")) {
      failures.push(`${rel}: missing ## Verification`);
    }
    const lower = text.toLowerCase();
    for (const ban of BANNED_AGENT_SUBSTRINGS) {
      if (lower.includes(ban)) {
        failures.push(`${rel}: contains disallowed phrase "${ban}"`);
      }
    }
  }
  return failures;
}

function auditShippedMarkdownAndManifest(root: string): string[] {
  const failures: string[] = [];
  const mdFiles = fg.sync([...SHIPPED_MD_GLOBS], { cwd: root, absolute: true, onlyFiles: true });

  for (const abs of mdFiles) {
    const rel = path.relative(root, abs);
    const text = fs.readFileSync(abs, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (PLACEHOLDER_OR_TODO_RE.test(line)) {
        failures.push(`${rel}:${i + 1}: TODO or placeholder token in shipped content`);
      }
      if (DISALLOWED_NPX_RE.test(line)) {
        failures.push(`${rel}:${i + 1}: disallowed npx (only npx tsx is allowed)`);
      }
      for (const re of RISKY_INVOCATION_RES) {
        if (re.test(line)) {
          failures.push(`${rel}:${i + 1}: risky community install or pipe pattern`);
        }
      }
    }
  }

  const manifestAbs = path.resolve(root, MANIFEST_REL);
  if (fs.existsSync(manifestAbs)) {
    const text = fs.readFileSync(manifestAbs, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (PLACEHOLDER_OR_TODO_RE.test(line)) {
        failures.push(`${MANIFEST_REL}:${i + 1}: TODO or placeholder token in catalog JSON`);
      }
    }
  }

  return failures;
}

/**
 * Structural and policy checks for catalog-backed `library/` items, `plugin/skills`,
 * `plugin/agents`, and shipped markdown under library/haus plus manifest.json.
 */
export async function auditLibrary(root: string): Promise<string[]> {
  const items = await loadCatalog(root);
  return [
    ...auditCatalogManifest(root, items),
    ...auditCatalogLibraryItems(root, items),
    ...auditPluginSkills(root),
    ...auditPluginAgents(root),
    ...auditShippedMarkdownAndManifest(root)
  ];
}
