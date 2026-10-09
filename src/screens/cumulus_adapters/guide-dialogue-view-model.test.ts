// Guide line selection contract: the chosen line is a pure function of the
// game seed, site, guide, dialogue context, and template values, and always
// addresses one of the authored lines.

import { describe, expect, it } from "vitest";
import { parseSiteId } from "../../types/identifiers";
import { testGuideId, testJourneySeed } from "../../types/test-identities";
import {
  selectGuideDialogueIndex,
  type GuideDialogueKey,
} from "./guide-dialogue-view-model";

const KEY: GuideDialogueKey = {
  seed: testJourneySeed("dialogue-seed"),
  siteId: parseSiteId("site-3"),
  guideId: testGuideId("guide-1"),
  context: "site",
  values: { amount: 3 },
};

describe("selectGuideDialogueIndex", () => {
  it("selects the same line for the same key", () => {
    const first = selectGuideDialogueIndex(KEY, 5);
    expect(selectGuideDialogueIndex({ ...KEY, values: { amount: 3 } }, 5)).toBe(
      first,
    );
    expect(selectGuideDialogueIndex(KEY, 5)).toBe(first);
  });

  it("always addresses an authored line", () => {
    for (let lineCount = 1; lineCount <= 8; lineCount += 1) {
      for (const siteId of ["site-1", "site-2", "site-3", "site-4"]) {
        const index = selectGuideDialogueIndex(
          { ...KEY, siteId: parseSiteId(siteId) },
          lineCount,
        );
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(lineCount);
      }
    }
    expect(selectGuideDialogueIndex({ ...KEY, siteId: null }, 1)).toBe(0);
  });
});
