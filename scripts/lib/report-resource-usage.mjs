/**
 * Preloaded (`node --import`) into each round of `npm run perf:ab`: as the
 * process exits, it writes `process.resourceUsage()` as JSON to the file named
 * by `PERF_AB_REPORT`. The CPU time covers the whole process, module loading
 * and TypeScript transforms included.
 */
import { writeFileSync } from "node:fs";

const report = process.env.PERF_AB_REPORT;
if (report !== undefined && report !== "") {
  process.on("exit", () => {
    writeFileSync(report, JSON.stringify(process.resourceUsage()));
  });
}
