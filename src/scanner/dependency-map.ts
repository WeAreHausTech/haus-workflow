export function dependencyMap(deps: string[]): Record<string, string[]> {
  return {
    frontend: deps.filter((d) => ["next", "react", "vite", "vue"].includes(d)),
    backend: deps.filter((d) => ["@vendure/core", "@nestjs/core", "graphql", "express", "laravel/framework"].includes(d)),
    testing: deps.filter((d) => d.startsWith("@testing-library/") || d === "@playwright/test")
  };
}
