import { afterEach, describe, expect, it } from "vitest";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { foldInvariantViolations } from "../invariants";
import { genesis } from "./lifecycle-fixtures";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { actualProvider, character, entry } from "./journey-transfiguration-record.fixtures";
describe("record ingress semantic authority", () => {
 afterEach(() => registerJourneyTransfigurationProvider(null));
 it("rejects primary mismatches even with a nonvalidating legacy resolver", () => {
  registerJourneyTransfigurationProvider({ resolve: () => ({ cardId: character.id, cardType: character.cardType, subtype: character.subtype, forms: ["Kindled"] }) });
  const state = genesis(); state.journey.deck = [entry(undefined, { transfiguration: null })];
  expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(state))).toThrow();
  expect(foldInvariantViolations(state).length).toBeGreaterThan(0);
 });
 it("refuses present histories without the explicit validator while retaining absent records", () => {
  registerJourneyTransfigurationProvider(null); const state = genesis(); state.journey.deck = [entry()];
  expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(state))).toThrow();
  const { transfigurationApplications: _, ...legacy } = entry(); state.journey.deck = [legacy];
  expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(state))).not.toThrow();
 });
 it("accepts a source-certified history and refuses an inapplicable operation", () => {
  registerJourneyTransfigurationProvider(actualProvider()); const state = genesis(); state.journey.deck = [entry()];
  expect(GAME_ENGINE_CONFIG.decode(JSON.stringify(state)).journey.deck).toEqual(state.journey.deck);
  state.journey.deck = [entry([{ form: "Inspired" }])];
  expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(state))).toThrow();
 });
});
