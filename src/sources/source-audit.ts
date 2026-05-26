// HAUS-PRERELEASE-CLEANUP: P4a — sources subsystem removed before v0.1.
import { loadSources } from "./load-sources.js";

const ALLOWLIST = [
  "github.com",
  "skills.sh",
  "skillkit.dev",
  "prpm.dev",
  "claude.com",
  "ecc.tools",
  "medium.com",
  "voltagent.dev",
  "everything.cc",
  "docs.anthropic.com",
  // stack-specific official docs (PR10)
  "docs.vendure.io",
  "nextjs.org",
  "laravel.com",
  "tailwindcss.com",
  "ui.shadcn.com",
  "radix-ui.com",
  "playwright.dev",
  "tanstack.com",
  "docs.nestjs.com",
  "nx.dev",
  "turbo.build",
  "vite.dev",
  "vuejs.org",
  "developer.wordpress.org",
  "vitest.dev",
  "typescriptlang.org",
  "storybook.js.org",
  "react.dev",
];
const UNSUPPORTED = [
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
  "healthcare",
  "fundraising",
];

export async function auditSources(root: string): Promise<string[]> {
  const sources = await loadSources(root);
  const issues: string[] = [];
  for (const source of sources) {
    let allowedHost = false;
    if (!source.url) {
      issues.push(`${source.id}: missing url`);
    } else {
      try {
        const parsed = new URL(source.url);
        const hostname = parsed.hostname.toLowerCase();
        const protocol = parsed.protocol.toLowerCase();
        const hostMatched = ALLOWLIST.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        allowedHost = protocol === "https:" && hostMatched;
      } catch {
        issues.push(`${source.id}: invalid url`);
      }
    }
    if (!allowedHost) issues.push(`${source.id}: host not allowlisted`);
    if (!source.license) issues.push(`${source.id}: missing license`);
    if (!source.pinnedVersion) issues.push(`${source.id}: missing pinnedVersion`);
    if (!source.pinnedHash) issues.push(`${source.id}: missing pinnedHash`);
    for (const stack of source.containsStacks ?? []) {
      if (UNSUPPORTED.some((x) => stack.toLowerCase().includes(x)))
        issues.push(`${source.id}: unsupported stack "${stack}"`);
    }
    if ((source.unsafeHookCommands ?? []).length > 0) {
      issues.push(`${source.id}: unsafe hook commands present`);
    }
  }
  return issues;
}
