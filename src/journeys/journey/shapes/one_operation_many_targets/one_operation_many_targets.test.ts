import { describe, expect, it } from "vitest";

import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { oneOperationManyTargetsPlugin } from "./index";

describe("one_operation_many_targets shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = oneOperationManyTargetsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = oneOperationManyTargetsPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });
});
