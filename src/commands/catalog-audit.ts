import { loadCatalog } from "../catalog/load-catalog.js";

const FORBIDDEN = ["python", "django", "go", "rust", "java", "spring", "kotlin", "swift", "android", "flutter", "dart", "c++", "perl", "defi", "trading"];

export async function runCatalogAudit(): Promise<void> {
  const items = await loadCatalog(process.cwd());
  const failures: string[] = [];
  for (const item of items) {
    const text = `${item.id} ${item.tags.join(" ")}`.toLowerCase();
    for (const word of FORBIDDEN) if (text.includes(word)) failures.push(`${item.id} has unsupported tag ${word}`);
  }
  if (failures.length) {
    failures.forEach((f) => console.error(f));
    process.exitCode = 1;
    return;
  }
  console.log("Catalog audit passed.");
}
