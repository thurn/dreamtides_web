// @vitest-environment node

import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { OUTER_UI_BASELINES } from "../eslint-rules/ui-boundary-baselines.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function normalizedMessages(results) {
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId?.startsWith("cumulus/"))
      .map((message) => ({
        file: relative(ROOT, result.filePath).split("\\").join("/"),
        rule: message.ruleId,
      })),
  );
}

describe("Cumulus outer UI lint baselines", () => {
  it("names every current debt exactly and rejects stale or expanded baselines", async () => {
    const previous = process.env.CUMULUS_REPORT_BASELINES;
    process.env.CUMULUS_REPORT_BASELINES = "1";
    try {
      const eslint = new ESLint({ cwd: ROOT });
      const actual = normalizedMessages(await eslint.lintFiles(["src"]));
      const counts = new Map();
      for (const message of actual) {
        const key = `${message.file}:${message.rule}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const expected = new Map(
        OUTER_UI_BASELINES.map(({ file, rule, count }) => [`${file}:${rule}`, count]),
      );
      expect([...counts.entries()].sort()).toEqual([...expected.entries()].sort());
      for (const baseline of OUTER_UI_BASELINES) {
        expect(baseline.reason).not.toHaveLength(0);
      }
    } finally {
      if (previous === undefined) delete process.env.CUMULUS_REPORT_BASELINES;
      else process.env.CUMULUS_REPORT_BASELINES = previous;
    }
  }, 20_000);
});
