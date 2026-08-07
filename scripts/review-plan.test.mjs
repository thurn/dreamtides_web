// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildReviewPlan } from "./review-plan.mjs";

describe("fast review plan", () => {
  it("skips executable checks for documentation-only changes", () => {
    expect(buildReviewPlan(["docs/notes.md"])).toEqual({
      changedFiles: ["docs/notes.md"],
      lintFiles: [],
      shouldCheckRonFormatting: false,
      shouldTypecheck: false,
      shouldTestGameData: false,
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
      shouldCheckRonFormatting: false,
      shouldTypecheck: true,
      shouldTestGameData: false,
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
    expect(buildReviewPlan(["data/tabula/cards.toml"])).toMatchObject({
      shouldTypecheck: false,
      shouldValidate: true,
      testInputs: ["data/tabula/cards.toml"],
    });
  });

  it("selects Rust compiler tests for canonical RON and orchestration changes", () => {
    expect(buildReviewPlan(["data/tabula/cards.ron"])).toMatchObject({
      shouldTestGameData: true,
      shouldValidate: true,
    });
    expect(buildReviewPlan(["scripts/game-data-pipeline.mjs"])).toMatchObject({
      shouldTestGameData: true,
    });
  });

  it("selects localization contract checks for Fluent source changes", () => {
    expect(buildReviewPlan(["data/tabula/strings.ftl"])).toMatchObject({
      shouldTypecheck: false,
      shouldValidate: true,
      testInputs: [
        "data/tabula/strings.ftl",
        "scripts/generate-localization-types.test.mjs",
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

  it("selects the RON formatting gate for RON sources and formatter config", () => {
    expect(
      buildReviewPlan([".ronfmt.json", "data/tabula/cards.ron"]),
    ).toMatchObject({
      shouldCheckRonFormatting: true,
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
