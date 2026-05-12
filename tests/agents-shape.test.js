import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const EXPECTED_AGENT_IDS = new Set([
  "haus.code-reviewer-agent",
  "haus.test-reviewer-agent",
  "haus.security-reviewer-agent",
  "haus.docs-researcher-agent",
  "haus.planner-agent"
]);

const BANNED_SUBSTRINGS = ["autonomous", "swarm", "delegate", "orchestrat", "marketplace"];

function splitFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return { front: text.slice(4, end), body: text.slice(end + 5) };
}

test("Haus catalog agents have stable ids, frontmatter, boundaries, and no banned phrasing", () => {
  const manifest = JSON.parse(fs.readFileSync("library/catalog/manifest.json", "utf8"));
  const agents = manifest.items.filter((item) => item.type === "agent" && item.source === "haus");
  assert.equal(agents.length, EXPECTED_AGENT_IDS.size, "unexpected haus agent count");

  const seen = new Set();
  for (const item of agents) {
    assert.equal(EXPECTED_AGENT_IDS.has(item.id), true, `unexpected agent id ${item.id}`);
    assert.equal(seen.has(item.id), false, `duplicate agent id ${item.id}`);
    seen.add(item.id);

    if (item.id === "haus.code-reviewer-agent") {
      assert.equal(item.default, true, "haus.code-reviewer-agent must remain default baseline");
    } else {
      assert.equal(item.default, undefined, `${item.id} must not set default (only code-reviewer is default)`);
    }

    const abs = path.resolve(item.path);
    assert.equal(fs.existsSync(abs), true, `${item.id} missing file ${item.path}`);
    const text = fs.readFileSync(abs, "utf8");
    assert.ok(text.length > 80 && text.length < 20000, `${item.id} body length out of bounds`);

    const parsed = splitFrontmatter(text);
    assert.ok(parsed, `${item.id} missing YAML frontmatter`);
    assert.match(parsed.front, /^name:\s/m, `${item.id} frontmatter missing name`);
    assert.match(parsed.front, /^description:\s/m, `${item.id} frontmatter missing description`);
    assert.match(parsed.front, /^tools:\s/m, `${item.id} frontmatter missing tools`);

    assert.equal(parsed.body.includes("## Use when"), true, `${item.id} missing ## Use when`);
    assert.equal(parsed.body.includes("## Do not use when"), true, `${item.id} missing ## Do not use when`);
    assert.equal(parsed.body.includes("## Verification"), true, `${item.id} missing ## Verification`);

    const lower = text.toLowerCase();
    for (const ban of BANNED_SUBSTRINGS) {
      assert.equal(
        lower.includes(ban),
        false,
        `${item.id} contains banned substring "${ban}"`
      );
    }
  }
});
