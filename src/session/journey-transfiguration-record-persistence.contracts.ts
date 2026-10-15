import { afterEach, describe, expect, it } from "vitest";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { genesis } from "../rules/journey/lifecycle-fixtures";
import { registerJourneyTransfigurationProvider } from "../rules/journey/journey-transfiguration";
import { registerReplayFixtureProviders } from "../rules/replay/fixture-providers";
import { actualProvider, entry } from "../rules/journey/journey-transfiguration-record.fixtures";
describe("persisted chronological records", () => {
 afterEach(() => { registerJourneyTransfigurationProvider(null); registerReplayFixtureProviders(); });
 it("round trips a certified record and refuses semantically corrupted checkpoint bytes", () => {
  registerJourneyTransfigurationProvider(actualProvider()); const state = genesis(); state.journey.deck = [entry()];
  expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(state))).toEqual(state);
  state.journey.deck = [entry([{ form: "Inspired" }])];
  expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(state))).toThrow();
 });
});
