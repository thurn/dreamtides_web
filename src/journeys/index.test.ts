import { describe, expect, it } from "vitest";

import {
  JourneyScreen,
  createJourneyMutations,
  journeySeedForSite,
} from "./index";

/**
 * Structural test for the journeys module's public surface.
 *
 * The journeys module exposes a small set of named symbols to the rest of
 * the quest prototype: `JourneyScreen` (UI entry point),
 * `createJourneyMutations` (adapter factory the screen router uses to bridge
 * `QuestMutations` into `JourneyMutations`), and `journeySeedForSite`. This
 * test pins that contract so a refactor cannot silently delete or rename any
 * export without breaking the build.
 */
describe("src/journeys public surface", () => {
  it("exports JourneyScreen", () => {
    expect(typeof JourneyScreen).not.toBe("undefined");
    expect(JourneyScreen).toBeDefined();
  });

  it("exports createJourneyMutations", () => {
    expect(typeof createJourneyMutations).toBe("function");
  });

  it("exports journeySeedForSite", () => {
    expect(typeof journeySeedForSite).not.toBe("undefined");
    expect(journeySeedForSite).toBeDefined();
  });
});
