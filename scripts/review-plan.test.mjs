// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildReviewPlan } from "./review-plan.mjs";

describe("fast review plan", () => {
  it("skips executable checks for documentation-only changes", () => {
    expect(buildReviewPlan(["docs/notes.md"])).toEqual({
      changedFiles: ["docs/notes.md"],
      lintFiles: [],
      shouldTypecheck: false,
      shouldValidate: false,
      testInputs: [],
    });
  });

  it("selects bounded checks for application changes", () => {
    expect(buildReviewPlan([
      "src/state/journey-state-actions.test.ts",
      "src/state/journey-state-actions.ts",
    ])).toEqual({
      changedFiles: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
      lintFiles: [
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
      shouldTypecheck: true,
      shouldValidate: false,
      testInputs: [
        "scripts/cumulus-generated-docs-drift.test.mjs",
        "scripts/cumulus-ui-boundary.test.mjs",
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
    });
  });

  it("adds asset validation for production data without forcing typecheck", () => {
    expect(buildReviewPlan(["data/tabula/cards_v2.toml"])).toMatchObject({
      shouldTypecheck: false,
      shouldValidate: true,
      testInputs: ["data/tabula/cards_v2.toml"],
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
    expect(buildReviewPlan(
      ["src/deleted.ts", "src/live.ts"],
      (file) => file === "src/live.ts",
    )).toMatchObject({
      changedFiles: ["src/deleted.ts", "src/live.ts"],
      lintFiles: ["src/live.ts"],
      shouldTypecheck: true,
      testInputs: [
        "scripts/cumulus-generated-docs-drift.test.mjs",
        "scripts/cumulus-ui-boundary.test.mjs",
        "src/live.ts",
      ],
    });
  });

  it("selects source-tree contracts for deleted production files", () => {
    expect(buildReviewPlan(
      ["src/screens/RemovedScreen.tsx"],
      () => false,
    )).toMatchObject({
      lintFiles: [],
      shouldTypecheck: true,
      testInputs: [
        "scripts/cumulus-generated-docs-drift.test.mjs",
        "scripts/cumulus-ui-boundary.test.mjs",
      ],
    });
  });
});
