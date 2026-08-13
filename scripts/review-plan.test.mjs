// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildReviewPlan } from "./review-plan.mjs";

describe("fast review plan", () => {
  it("skips executable checks for documentation-only changes", () => {
    expect(buildReviewPlan(["docs/notes.md"])).toEqual({
      changedFiles: ["docs/notes.md"],
      lintFiles: [],
      shouldCheckTrox: false,
      shouldCheckRonFormatting: false,
      shouldTypecheck: false,
      shouldTestGameData: false,
      shouldValidate: false,
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
      shouldCheckTrox: true,
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
    expect(buildReviewPlan(["data/cards.toml"])).toMatchObject({
      shouldTypecheck: false,
      shouldValidate: true,
      testInputs: ["data/cards.toml"],
    });
  });

  it("selects Rust compiler tests for canonical RON and orchestration changes", () => {
    expect(buildReviewPlan(["data/cards.ron"])).toMatchObject({
      shouldTestGameData: true,
      shouldValidate: true,
    });
    expect(buildReviewPlan(["scripts/game-data-pipeline.mjs"])).toMatchObject({
      shouldTestGameData: true,
    });
  });

  it("selects localization contract checks for the Trox project config", () => {
    expect(
      buildReviewPlan(["trox.ron"]),
    ).toMatchObject({
      shouldCheckTrox: true,
      shouldTypecheck: false,
      testInputs: [
        "scripts/bump-trox.test.mjs",
        "scripts/canonical-localization-audit.test.mjs",
        "scripts/trox-csv-sync.test.mjs",
        "scripts/trox-generated-check.test.mjs",
        "scripts/trox.test.mjs",
      ],
    });
  });

  it("selects localization contract checks for a locale report", () => {
    expect(buildReviewPlan(["localization/qa/es.csv"])).toMatchObject(
      {
        shouldCheckTrox: true,
        testInputs: [
          "scripts/bump-trox.test.mjs",
          "scripts/canonical-localization-audit.test.mjs",
          "scripts/trox-csv-sync.test.mjs",
          "scripts/trox-generated-check.test.mjs",
          "scripts/trox.test.mjs",
        ],
      },
    );
  });

  it("selects Trox checks and wrapper tests for wrapper changes", () => {
    expect(buildReviewPlan(["scripts/trox.mjs"])).toMatchObject({
      shouldCheckTrox: true,
      testInputs: [
        "scripts/bump-trox.test.mjs",
        "scripts/canonical-localization-audit.test.mjs",
        "scripts/trox-csv-sync.test.mjs",
        "scripts/trox-generated-check.test.mjs",
        "scripts/trox.mjs",
        "scripts/trox.test.mjs",
      ],
    });
    expect(buildReviewPlan(["scripts/bump-trox.mjs"])).toMatchObject({
      shouldCheckTrox: true,
      testInputs: expect.arrayContaining(["scripts/bump-trox.test.mjs"]),
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
    expect(buildReviewPlan([".ronfmt.json", "data/cards.ron"])).toMatchObject({
      shouldCheckRonFormatting: true,
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
        "scripts/cumulus-generated-docs-drift.test.mjs",
        "scripts/cumulus-ui-boundary.test.mjs",
        "src/live.ts",
      ],
    });
  });

  it("selects source-tree contracts for deleted production files", () => {
    expect(
      buildReviewPlan(["src/screens/RemovedScreen.tsx"], () => false),
    ).toMatchObject({
      lintFiles: [],
      shouldTypecheck: true,
      testInputs: [
        "scripts/cumulus-generated-docs-drift.test.mjs",
        "scripts/cumulus-ui-boundary.test.mjs",
      ],
    });
  });
});
