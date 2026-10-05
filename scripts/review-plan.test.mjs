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
