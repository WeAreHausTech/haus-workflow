/**
 * Shared validation rule constants for catalog items — mirrored from haus-workflow-catalog.
 * Used by validate-catalog.ts and the prepack audit scripts.
 *
 * Catalog validation rules — mirrored from haus-workflow-catalog.
 *
 * SYNC REQUIRED: these constants must stay in sync with
 * haus-workflow-catalog/scripts/validation-rules.mjs.
 * When updating rules there, update this file too (and vice versa).
 * See haus-workflow-catalog EXECUTION-PLAN.md F6.
 */

/** Tags that identify unsupported stacks. Items using these tags fail validation. */
export const FORBIDDEN_TAGS = [
  "python",
  "django",
  "go",
  "rust",
  "java",
  "spring",
  "kotlin",
  "swift",
  "android",
  "flutter",
  "dart",
  "c++",
  "perl",
  "defi",
  "trading",
];

/** Phrases disallowed in agent files. Agents must not describe autonomous or orchestrating behavior. */
export const BANNED_AGENT_PHRASES = ["autonomous", "swarm", "delegate", "orchestrat", "marketplace"];

/** Sections required in every skill's SKILL.md. */
export const REQUIRED_SKILL_SECTIONS = ["## Use when", "## Do not use when"];

/** Sections required in every agent's .md file. */
export const REQUIRED_AGENT_SECTIONS = ["## Use when", "## Do not use when", "## Verification"];

/** Install patterns that must not appear in shipped markdown. */
export const RISKY_INSTALL_PATTERNS = [/\bnpx\s+-y\b/i, /\bnpx\s+--yes\b/i, /\byarn\s+dlx\b/i, /\bpnpm\s+dlx\b/i];

/** The only npx invocation allowed in shipped markdown. */
export const ALLOWED_NPX_PATTERN = /\bnpx\s+tsx\b/i;

/** Regex to detect any npx call (used to catch disallowed ones after allowing tsx). */
export const ANY_NPX_PATTERN = /\bnpx\s+\S+/i;

/** Insecure URL pattern. All references must use https://. */
export const HTTP_URL_PATTERN = /^http:\/\//i;

/** Markers that must not appear in shipped content. */
export const PLACEHOLDER_PATTERN = /\bTODO\b|\bPLACEHOLDER\b/i;
