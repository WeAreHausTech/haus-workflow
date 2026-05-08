import { runScan } from "./scan.js";

export async function runRefresh(): Promise<void> {
  await runScan({ json: false });
}
