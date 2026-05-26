// HAUS-PRERELEASE-CLEANUP: P4b — curation + library audit artifacts removed before v0.1.
import { validateCatalog } from "../src/catalog/validate-catalog.js";

const failures = await validateCatalog(process.cwd());
if (failures.length) {
  console.error("Catalog validation failed:");
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log("Catalog validation passed.");
