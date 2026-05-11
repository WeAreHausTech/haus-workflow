export type TaskIntent =
  | "backend"
  | "frontend"
  | "admin-ui"
  | "storefront"
  | "graphql"
  | "database"
  | "auth"
  | "testing"
  | "docs"
  | "monorepo";

export const ALL_INTENTS: readonly TaskIntent[] = [
  "backend",
  "frontend",
  "admin-ui",
  "storefront",
  "graphql",
  "database",
  "auth",
  "testing",
  "docs",
  "monorepo"
];

/**
 * Deterministic keyword -> intent table. Substring matching (lowercased).
 * A task may classify to multiple intents.
 */
const TASK_INTENT_KEYWORDS: Record<TaskIntent, string[]> = {
  backend: [
    "api",
    "endpoint",
    "controller",
    "service",
    "queue",
    "job",
    "worker",
    "cron",
    "middleware",
    "resolver",
    "mutation",
    "subscription",
    "migration",
    "seeder",
    "model",
    "repository",
    "handler",
    "plugin",
    "webhook",
    "schedule",
    "background",
    "consumer",
    "producer",
    "command",
    "nova resource"
  ],
  frontend: [
    "component",
    "page",
    "route",
    "view",
    "layout",
    "form",
    "dashboard",
    "modal",
    "navbar",
    "navigation",
    "sidebar",
    "menu",
    "tailwind",
    "scss",
    "style",
    "theme",
    "tanstack",
    "shadcn",
    "radix",
    "block",
    "client component",
    "server component"
  ],
  "admin-ui": [
    "admin",
    "admin-ui",
    "admin ui",
    "backoffice",
    "back-office",
    "back office",
    "nova",
    "control panel",
    "wp-admin",
    "vendure admin"
  ],
  storefront: [
    "storefront",
    "checkout",
    "cart",
    "product page",
    "product listing",
    "category page",
    "shop",
    "ecommerce",
    "e-commerce",
    "order page"
  ],
  graphql: ["graphql", "resolver", "mutation", "subscription", "schema", "codegen"],
  database: [
    "database",
    "migration",
    "model",
    "seed",
    "table",
    "index",
    "elasticsearch",
    "postgres",
    "mariadb",
    "mssql",
    "query"
  ],
  auth: [
    "auth",
    "login",
    "logout",
    "oauth",
    "oidc",
    "bankid",
    "azure ad",
    "session",
    "jwt",
    "permission",
    "rbac",
    "acl",
    "guard",
    "saml"
  ],
  testing: [
    "test",
    "tests",
    "testing",
    "spec",
    "e2e",
    "unit",
    "story",
    "stories",
    "snapshot",
    "fixture",
    "playwright",
    "cypress",
    "phpunit",
    "vitest"
  ],
  docs: ["doc", "docs", "documentation", "readme", "guide", "tutorial", "changelog"],
  monorepo: [
    "lib",
    "library",
    "package",
    "workspace",
    "shared",
    "monorepo",
    "nx ",
    "turbo",
    "pnpm-workspace",
    "yarn workspace"
  ]
};

export function classifyTaskIntents(task: string): Set<TaskIntent> {
  const t = ` ${task.toLowerCase()} `;
  const intents = new Set<TaskIntent>();
  for (const intent of ALL_INTENTS) {
    const keywords = TASK_INTENT_KEYWORDS[intent];
    for (const kw of keywords) {
      const needle = kw.includes(" ") ? kw : ` ${kw} `;
      if (t.includes(needle)) {
        intents.add(intent);
        break;
      }
    }
  }
  return intents;
}

/**
 * Map a rule's catalog metadata (tags + ecosystem) to the set of task intents
 * it can legitimately satisfy. Returns empty set when no metadata is available
 * (legacy schema), allowing the caller to fall back to keyword matching.
 */
export function computeRuleIntents(rule: {
  id: string;
  tags?: string[];
  ecosystem?: string;
}): Set<TaskIntent> {
  const intents = new Set<TaskIntent>();
  const tags = new Set((rule.tags ?? []).map((t) => t.toLowerCase()));
  const eco = rule.ecosystem;

  if (!eco && tags.size === 0) return intents;

  // Testing rules are isolated: only the testing intent applies. This prevents
  // testing tooling from bleeding into implementation tasks (e.g. PHPUnit in
  // "add queue job", Playwright in "build dashboard route").
  const isTestingRule =
    tags.has("playwright") ||
    tags.has("phpunit") ||
    tags.has("testing-library") ||
    tags.has("storybook") ||
    tags.has("testing");
  if (isTestingRule) {
    intents.add("testing");
    return intents;
  }

  // Ecosystem -> primary intents.
  if (eco === "laravel" || eco === "nestjs" || eco === "dotnet") {
    intents.add("backend");
  }
  if (eco === "vendure") {
    intents.add("backend");
    intents.add("admin-ui");
  }
  if (eco === "wordpress") {
    intents.add("backend");
    intents.add("frontend");
    intents.add("admin-ui");
  }
  if (eco === "nextjs" || eco === "react" || eco === "vue") {
    intents.add("frontend");
    intents.add("admin-ui");
    intents.add("storefront");
  }
  if (eco === "nx" || eco === "turbo") {
    intents.add("monorepo");
  }

  // Direct semantic tags expressed in the manifest.
  if (tags.has("backend")) intents.add("backend");
  if (tags.has("frontend")) intents.add("frontend");
  if (tags.has("graphql")) intents.add("graphql");
  if (tags.has("laravel-nova")) intents.add("admin-ui");
  if (tags.has("oidc") || tags.has("azure-ad") || tags.has("bankid")) intents.add("auth");
  if (
    tags.has("postgresql") ||
    tags.has("mariadb") ||
    tags.has("mssql") ||
    tags.has("elasticsearch")
  ) {
    intents.add("database");
  }
  if (tags.has("nx21") || tags.has("turbo") || tags.has("yarn4") || tags.has("pnpm89")) {
    intents.add("monorepo");
  }

  return intents;
}
