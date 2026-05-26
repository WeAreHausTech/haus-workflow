// HAUS-PRERELEASE-CLEANUP: P4b — curation + library audit artifacts removed before v0.1.
import { auditLibrary } from "../src/library/audit-library.js";

const root = process.cwd();
const failures = await auditLibrary(root);
if (failures.length > 0) {
  console.error("Shipped catalog and plugin audit failed:");
  for (const f of failures) {
    console.error(`- ${f}`);
  }
  process.exit(1);
}
console.log("Shipped catalog and plugin audit passed.");
