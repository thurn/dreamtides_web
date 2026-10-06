// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildReviewPlan,
  GATE_RELATED_TEST_FILE_CAP,
  gateExecutionPlan,
  relatedTestRunDecision,
  reviewNeedsPreparedWorkspace,
} from "./review-plan.mjs";

describe("fast review plan", () => {
  it("prepares only when selected checks consume disposable artifacts", () => {
    expect(
      reviewNeedsPreparedWorkspace(buildReviewPlan(["docs/notes.md"])),
    ).toBe(false);
    expect(
      reviewNeedsPreparedWorkspace(buildReviewPlan(["src/state/example.ts"])),
    ).toBe(true);
  });

  it("skips executable checks for documentation-only changes", () => {
    expect(buildReviewPlan(["docs/notes.md"])).toEqual({
      changedFiles: ["docs/notes.md"],
      lintFiles: [],
      shouldTypecheck: false,
      testInputs: [],
    });
  });

  it("selects bounded checks for application changes", () => {
    expect(
      buildReviewPlan([
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ]),
    ).toEqual({
      changedFiles: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
      lintFiles: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
      shouldTypecheck: true,
      testInputs: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
    });
  });

  it("routes repository scripts to related tests without typed source lint", () => {
    expect(buildReviewPlan(["scripts/review.mjs"])).toMatchObject({
      lintFiles: [],
      shouldTypecheck: false,
      testInputs: ["scripts/review.mjs"],
    });
  });

  it("does not pass deleted files to lint or Vitest", () => {
    expect(
      buildReviewPlan(
        ["src/deleted.ts", "src/live.ts"],
        (file) => file === "src/live.ts",
      ),
    ).toMatchObject({
      changedFiles: ["src/deleted.ts", "src/live.ts"],
      lintFiles: ["src/live.ts"],
      shouldTypecheck: true,
      testInputs: [
        "src/live.ts",
      ],
    });
  });

  it("typechecks deleted production files without selecting tests", () => {
    expect(
      buildReviewPlan(["src/screens/RemovedScreen.tsx"], () => false),
    ).toMatchObject({
      lintFiles: [],
      shouldTypecheck: true,
      testInputs: [],
    });
  });
});

describe("gate review plan", () => {
  it("always prepares and typechecks, even for documentation-only commits", () => {
    expect(gateExecutionPlan(buildReviewPlan(["docs/notes.md"]))).toEqual([
      { step: "prepare", args: [] },
      { concurrent: [{ step: "typecheck", args: [] }] },
    ]);
  });

  it("lints the changed sources beside the typecheck and caps related tests", () => {
    expect(
      gateExecutionPlan(
        buildReviewPlan(["src/state/example.ts", "scripts/tool.mjs"]),
      ),
    ).toEqual([
      { step: "prepare", args: [] },
      {
        concurrent: [
          { step: "typecheck", args: [] },
          { step: "lint", args: ["src/state/example.ts"] },
        ],
      },
      {
        step: "test-related-capped",
        args: [
          "--max-files",
          String(GATE_RELATED_TEST_FILE_CAP),
          "scripts/tool.mjs",
          "src/state/example.ts",
        ],
      },
    ]);
  });
});

describe("related test cap", () => {
  it("runs a selection at or under the cap", () => {
    expect(relatedTestRunDecision(["a.test.ts", "b.test.ts"], 2)).toEqual({
      run: true,
      testFileCount: 2,
    });
    expect(relatedTestRunDecision([], 0)).toEqual({
      run: true,
      testFileCount: 0,
    });
  });

  it("skips a selection over the cap and reports its size", () => {
    expect(
      relatedTestRunDecision(["a.test.ts", "b.test.ts", "c.test.ts"], 2),
    ).toEqual({ run: false, testFileCount: 3 });
  });

  it("counts a file selected by several projects once", () => {
    expect(
      relatedTestRunDecision(["a.test.ts", "a.test.ts", "b.test.ts"], 2),
    ).toEqual({ run: true, testFileCount: 2 });
  });
});
