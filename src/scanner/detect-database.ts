// TODO(refactor-scanner): Not wired into scan-project.ts; merge or remove when modular scanner lands.
export function detectDatabase(deps: string[]): string[] {
  const out: string[] = [];
  if (deps.includes("pg")) out.push("postgresql");
  if (deps.includes("mariadb") || deps.includes("mysql2")) out.push("mariadb");
  if (deps.includes("mssql")) out.push("mssql");
  if (deps.includes("@elastic/elasticsearch")) out.push("elasticsearch");
  return out;
}
