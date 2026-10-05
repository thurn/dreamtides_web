// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildReviewPlan,
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
      shouldCheckTrox: false,
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
      shouldCheckTrox: true,
      shouldTypecheck: true,
      testInputs: [
        "scripts/cumulus-ui-boundary.test.mjs",
        "scripts/domain-string-audit.test.mjs",
        "src/state/journey-state-actions.test.ts",
        "src/state/journey-state-actions.ts",
      ],
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
        "scripts/trox-csv-sync.test.mjs",
        "scripts/trox-generated-check.test.mjs",
        "scripts/trox-source-workspace.test.mjs",
        "scripts/trox.test.mjs",
      ],
    });
  });

  it("selects localization contract checks for a locale profile", () => {
    expect(buildReviewPlan(["localization/qa/es.ron"])).toMatchObject(
      {
        shouldCheckTrox: true,
        testInputs: [
          "scripts/bump-trox.test.mjs",
            "scripts/trox-csv-sync.test.mjs",
          "scripts/trox-generated-check.test.mjs",
          "scripts/trox-source-workspace.test.mjs",
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
        "scripts/trox-csv-sync.test.mjs",
        "scripts/trox-generated-check.test.mjs",
        "scripts/trox-source-workspace.test.mjs",
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
        "scripts/cumulus-ui-boundary.test.mjs",
        "scripts/domain-string-audit.test.mjs",
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
        "scripts/cumulus-ui-boundary.test.mjs",
        "scripts/domain-string-audit.test.mjs",
      ],
    });
  });
});
