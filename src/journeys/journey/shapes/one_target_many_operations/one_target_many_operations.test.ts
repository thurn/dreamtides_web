import { describe, expect, it } from "vitest";

import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { oneTargetManyOperationsPlugin } from "./index";

describe("one_target_many_operations shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = oneTargetManyOperationsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = oneTargetManyOperationsPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });
});
