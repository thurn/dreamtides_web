import { describe, expect, it } from "vitest";

import { AI_DIFFICULTY_V1 } from "./difficulty";

describe("AI_DIFFICULTY_V1", () => {
  it("is a structurally valid difficulty config", () => {
    expect(AI_DIFFICULTY_V1.beamWidth).toBeGreaterThan(0);
    expect(AI_DIFFICULTY_V1.sampleCap).toBeGreaterThan(0);
    expect(["expectiminimax", "worstCase"]).toContain(
      AI_DIFFICULTY_V1.opponentMode,
    );
  });
});
