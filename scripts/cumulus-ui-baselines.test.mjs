// @vitest-environment node

import { describe, expect, it } from "vitest";
import { OUTER_UI_BASELINES } from "../eslint-rules/ui-boundary-baselines.js";
import { reconcileLintBaselines } from "./lint-baselines.mjs";

describe("Cumulus outer UI lint baselines", () => {
  const root = "/repo";
  const result = (messages) => ({
    filePath: "/repo/src/example.tsx",
    messages,
    errorCount: messages.length,
    warningCount: 0,
    fatalErrorCount: 0,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
  });
  const debt = {
    file: "src/example.tsx",
    rule: "cumulus/no-hardcoded-values",
    count: 1,
    reason: "fixture debt",
  };
  const message = {
    ruleId: debt.rule,
    severity: 2,
    message: "fixture violation",
    line: 1,
    column: 1,
  };

  it("suppresses an exact baseline match", () => {
    const reconciled = reconcileLintBaselines([result([message])], [debt], root);
    expect(reconciled.mismatches).toEqual([]);
    expect(reconciled.results[0].messages).toEqual([]);
  });

  it("rejects stale and expanded baseline counts", () => {
    const stale = reconcileLintBaselines([result([])], [debt], root);
    const expanded = reconcileLintBaselines(
      [result([message, message])],
      [debt],
      root,
    );
    expect(stale.mismatches).toEqual([
      { key: `${debt.file}:${debt.rule}`, expected: 1, actual: 0 },
    ]);
    expect(expanded.mismatches).toEqual([
      { key: `${debt.file}:${debt.rule}`, expected: 1, actual: 2 },
    ]);
    expect(expanded.results[0].messages).toHaveLength(2);
  });

  it("keeps every real baseline reason non-empty", () => {
    for (const baseline of OUTER_UI_BASELINES) {
      expect(baseline.reason).not.toHaveLength(0);
    }
  });
});
