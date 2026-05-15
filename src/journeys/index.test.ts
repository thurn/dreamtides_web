import { describe, expect, it } from "vitest";

import { JourneyScreen, journeySeedForSite } from "./index";

/**
 * Structural test for the journeys module's public surface.
 *
 * The journeys module exposes exactly two symbols to the rest of the quest
 * prototype: `JourneyScreen` and `journeySeedForSite`. This test pins that
 * contract so a future refactor cannot silently delete or rename either export
 * without breaking the build.
 */
describe("src/journeys public surface", () => {
  it("exports JourneyScreen", () => {
    expect(typeof JourneyScreen).not.toBe("undefined");
    expect(JourneyScreen).toBeDefined();
  });

  it("exports journeySeedForSite", () => {
    expect(typeof journeySeedForSite).not.toBe("undefined");
    expect(journeySeedForSite).toBeDefined();
  });
});
