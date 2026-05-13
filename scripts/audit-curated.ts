/**
 * Curated library audit.
 *
 * Performs structural and policy validation of library/curated/ inventory and
 * decision files. Checks required fields, enum values, cross-references between
 * files, and enforces install gates (reviewStatus, license, pinnedRef/hash).
 * Does not run full JSON Schema validation — schema files serve as documentation
 * and are referenced by tooling.
 *
 * Full hash/pinnedRef content verification is deferred to PR8 once
 * library/curated/decisions/curation-decisions.json is populated.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const INVENTORY_SCHEMA_PATH = "library/curated/inventory/source-inventory.schema.json";
const DECISIONS_SCHEMA_PATH = "library/curated/decisions/curation-decisions.schema.json";
const INVENTORY_PATH = "library/curated/inventory/source-inventory.json";
const DECISIONS_PATH = "library/curated/decisions/curation-decisions.json";
const SOURCES_PATH = "library/catalog/sources.yaml";
const MANIFEST_PATH = "library/catalog/manifest.json";

const PLACEHOLDER_RE = /\b(TODO|FIXME|PLACEHOLDER|TBD)\b/i;
const DECISIONS_REQUIRE_PINNED = new Set(["copy", "adapted"]);
const VALID_DECISIONS = new Set(["copy", "adapted", "wrapped", "rewritten", "reference-only", "rejected"]);

const issues: string[] = [];

function fail(msg: string): void {
  issues.push(msg);
}

// ── 1. Schema files must exist ──────────────────────────────────────────────
for (const rel of [INVENTORY_SCHEMA_PATH, DECISIONS_SCHEMA_PATH]) {
  if (!fs.existsSync(path.resolve(root, rel))) {
    fail(`Missing required schema file: ${rel}`);
  }
}

// ── 2. If inventory file exists, validate its structure ─────────────────────
const inventoryAbs = path.resolve(root, INVENTORY_PATH);
let inventory: {
  version?: string;
  sources?: Array<{
    sourceId: string;
    items: Array<{ id: string; reviewStatus?: string }>;
  }>;
} | null = null;

if (fs.existsSync(inventoryAbs)) {
  try {
    inventory = JSON.parse(fs.readFileSync(inventoryAbs, "utf8"));
  } catch {
    fail(`${INVENTORY_PATH}: failed to parse as JSON`);
  }

  if (inventory) {
    if (!inventory.version) fail(`${INVENTORY_PATH}: missing required field "version"`);
    if (!Array.isArray(inventory.sources)) {
      fail(`${INVENTORY_PATH}: "sources" must be an array`);
    } else {
      // Load known source IDs from sources.yaml for cross-reference
      const knownSourceIds = loadSourceIds();
      const inventoryIds = new Set<string>();
      for (const src of inventory.sources) {
        if (!src.sourceId) {
          fail(`${INVENTORY_PATH}: source entry missing sourceId`);
          continue;
        }
        if (!knownSourceIds.has(src.sourceId)) {
          fail(`${INVENTORY_PATH}: sourceId "${src.sourceId}" not found in ${SOURCES_PATH}`);
        }
        for (const item of src.items ?? []) {
          if (!item.id) {
            fail(`${INVENTORY_PATH}: item in source "${src.sourceId}" missing id`);
            continue;
          }
          if (inventoryIds.has(item.id)) {
            fail(`${INVENTORY_PATH}: duplicate item id "${item.id}"`);
          }
          inventoryIds.add(item.id);
        }
      }
    }
  }
}

// ── 3. If decisions file exists, validate its structure and policy gates ─────
const decisionsAbs = path.resolve(root, DECISIONS_PATH);
let decisions: {
  version?: string;
  items?: Array<{
    id: string;
    sourceId: string;
    decision: string;
    reviewStatus?: string;
    riskLevel?: string;
    license?: string;
    licenseConfidence?: string;
    pinnedRef?: string;
    hash?: string;
    targetPath?: string;
    licenseAcceptedUnknownJustification?: string;
    decisionReason?: string;
  }>;
} | null = null;

if (fs.existsSync(decisionsAbs)) {
  try {
    decisions = JSON.parse(fs.readFileSync(decisionsAbs, "utf8"));
  } catch {
    fail(`${DECISIONS_PATH}: failed to parse as JSON`);
  }

  if (decisions) {
    if (!decisions.version) fail(`${DECISIONS_PATH}: missing required field "version"`);
    if (!Array.isArray(decisions.items)) {
      fail(`${DECISIONS_PATH}: "items" must be an array`);
    } else {
      const decisionIds = new Set<string>();
      const knownSourceIds = loadSourceIds();

      for (const item of decisions.items) {
        const ctx = `${DECISIONS_PATH} item "${item.id}"`;

        if (!item.id) {
          fail(`${DECISIONS_PATH}: item missing id`);
          continue;
        }
        if (decisionIds.has(item.id)) {
          fail(`${ctx}: duplicate id`);
          continue;
        }
        decisionIds.add(item.id);

        if (!item.sourceId) fail(`${ctx}: missing sourceId`);
        else if (!knownSourceIds.has(item.sourceId)) {
          fail(`${ctx}: sourceId "${item.sourceId}" not found in ${SOURCES_PATH}`);
        }

        if (!item.decision) {
          fail(`${ctx}: missing decision`);
        } else if (!VALID_DECISIONS.has(item.decision)) {
          fail(`${ctx}: invalid decision "${item.decision}"`);
        }

        if (item.decisionReason && item.decisionReason.length < 8) {
          fail(`${ctx}: decisionReason too short (min 8 chars)`);
        }

        // copy/adapted require pinnedRef, hash, and targetPath
        if (DECISIONS_REQUIRE_PINNED.has(item.decision)) {
          if (!item.pinnedRef) fail(`${ctx}: decision="${item.decision}" requires pinnedRef`);
          if (!item.hash) fail(`${ctx}: decision="${item.decision}" requires hash`);
          if (!item.targetPath) fail(`${ctx}: decision="${item.decision}" requires targetPath`);
        }

        // copy/adapted require a known license (unless accepted-unknown with justification)
        if (DECISIONS_REQUIRE_PINNED.has(item.decision)) {
          if (item.license === "unknown" || !item.license) {
            if (item.licenseConfidence !== "accepted-unknown") {
              fail(
                `${ctx}: decision="${item.decision}" requires a known license or licenseConfidence:"accepted-unknown"`,
              );
            } else if (!item.licenseAcceptedUnknownJustification) {
              fail(`${ctx}: licenseConfidence:"accepted-unknown" requires licenseAcceptedUnknownJustification`);
            }
          }
        }

        // approved installable items must have all required provenance
        if (item.reviewStatus === "approved" && item.decision !== "rejected" && item.decision !== "reference-only") {
          if (!item.license) fail(`${ctx}: approved installable item missing license`);
          if (!item.riskLevel) fail(`${ctx}: approved installable item missing riskLevel`);
          if (item.riskLevel === "blocked") {
            fail(`${ctx}: approved item cannot have riskLevel:"blocked"`);
          }
        }

        // targetPath files must exist when decision is not rejected/reference-only
        if (item.targetPath && item.decision !== "rejected" && item.decision !== "reference-only") {
          const targetAbs = path.resolve(root, item.targetPath);
          if (!fs.existsSync(targetAbs)) {
            fail(`${ctx}: targetPath does not exist: ${item.targetPath}`);
          } else {
            // Scan target file for placeholder tokens
            const text = fs.readFileSync(targetAbs, "utf8");
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (PLACEHOLDER_RE.test(lines[i] ?? "")) {
                fail(`${item.targetPath}:${i + 1}: TODO or placeholder token in curated artifact`);
              }
            }
          }
        }
      }

      // Manifest curated item check runs unconditionally after this block.
    }
  }
} else {
  // No decisions file yet — that is fine in PR7. Warn but do not fail.
  console.log(`Note: ${DECISIONS_PATH} not yet populated; skipping item-level checks.`);
}

// Always check manifest curated items regardless of whether decisions file exists.
auditManifestCuratedItems(decisions ? new Set((decisions.items ?? []).map((x) => x.id)) : new Set());

// ── 4. Scan library/curated/external/ and wrappers/ for placeholder tokens ──
for (const dir of ["library/curated/external", "library/curated/wrappers"]) {
  const absDir = path.resolve(root, dir);
  if (fs.existsSync(absDir)) {
    const mdFiles = findMdFiles(absDir);
    for (const abs of mdFiles) {
      const rel = path.relative(root, abs);
      const text = fs.readFileSync(abs, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (PLACEHOLDER_RE.test(lines[i] ?? "")) {
          fail(`${rel}:${i + 1}: TODO or placeholder token in curated artifact`);
        }
      }
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
if (issues.length > 0) {
  console.error("Curated library audit failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}
console.log("Curated library audit passed.");

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadSourceIds(): Set<string> {
  const sourcesAbs = path.resolve(root, SOURCES_PATH);
  if (!fs.existsSync(sourcesAbs)) return new Set();
  // Simple YAML id extraction without a full parser dependency
  const text = fs.readFileSync(sourcesAbs, "utf8");
  const ids = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*-\s+id:\s+(\S+)/.exec(line);
    if (m) ids.add(m[1] ?? "");
  }
  return ids;
}

function auditManifestCuratedItems(knownDecisionIds: Set<string>): void {
  const manifestAbs = path.resolve(root, MANIFEST_PATH);
  if (!fs.existsSync(manifestAbs)) return;
  let manifest: { items?: Array<{ id: string; source?: string; reviewStatus?: string }> };
  try {
    manifest = JSON.parse(fs.readFileSync(manifestAbs, "utf8"));
  } catch {
    fail(`${MANIFEST_PATH}: failed to parse as JSON`);
    return;
  }
  const curatedItems = (manifest.items ?? []).filter((item) => item.source === "curated");
  if (curatedItems.length === 0) return;

  const decisionsPresent = fs.existsSync(path.resolve(root, DECISIONS_PATH));
  if (!decisionsPresent) {
    fail(
      `${MANIFEST_PATH}: contains ${curatedItems.length} curated item(s) but ${DECISIONS_PATH} is missing — every curated manifest entry requires a decision record`,
    );
    return;
  }

  for (const item of curatedItems) {
    if (item.reviewStatus !== "approved") {
      fail(
        `${MANIFEST_PATH}: curated item "${item.id}" has reviewStatus "${item.reviewStatus ?? "unset"}" — only "approved" items may appear in manifest`,
      );
    }
    // Verify each curated manifest item has a corresponding entry in curation-decisions.json
    // so that its license/pinnedRef/hash gates were evaluated before it was approved.
    if (knownDecisionIds.size > 0 && !knownDecisionIds.has(item.id)) {
      fail(
        `${MANIFEST_PATH}: curated item "${item.id}" has no corresponding entry in ${DECISIONS_PATH} — add a decision record before marking approved`,
      );
    }
  }
}

function findMdFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMdFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) results.push(full);
  }
  return results;
}
