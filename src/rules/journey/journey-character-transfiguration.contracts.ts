import { afterEach, describe, expect, it, vi } from "vitest";
import { setup, clear } from "./journey-subtype.fixtures";
import { journeyDeckEntry } from "./journey-deck-entry";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import { parseDeckEntryId, parseCardTypeChangePredicateId } from "../../types/identifiers";
import { parseCardSubtype } from "../../types/card-identity";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { reduceGameEvent } from "../reducer";
import { ctx, event } from "./lifecycle-fixtures";
const CRYSTAL = testDreamsignId("chance-character");
const registry = createJourneyModifierRegistry([journeyDeckEntry(CRYSTAL, { kind: "randomCharacterTransfiguration", numerator: 1, denominator: 2 })]);
afterEach(clear);
describe("fresh Character chance transfiguration", () => {
  it.each([[0, true, 2], [0.499999, true, 2], [0.5, false, 1], [0.999, false, 1]] as const)("uses a rational boundary at %f with hit %s", (coin, hit, draws) => {
    const before = setup([CRYSTAL]); before.journey.deck = [];
    const rng = vi.fn(() => coin), result = reduceGameEvent(before, event("ADD_CARD", { cardId: testCardId("chance-gain") }), { ...ctx(), rng }, registry);
    expect(result.outcome).toBe("applied"); expect(result.state.journey.deck[0].transfiguration !== null).toBe(hit); expect(rng).toHaveBeenCalledTimes(draws);
    expect(result.logRecords?.[0].fields.target).toMatchObject({ transfigurationAttempts: [{ hit, coinDrawIndex: 0, ...(hit ? { formDrawIndex: 1 } : {}) }] });
  });
  it("checks the next physical source after a miss and preserves the first successful form", () => {
    const before = setup([CRYSTAL, CRYSTAL]); before.journey.deck = [];
    const rng = vi.fn().mockReturnValueOnce(0.9).mockReturnValueOnce(0.1).mockReturnValueOnce(0.99), result = reduceGameEvent(before, event("ADD_CARD", { cardId: testCardId("chance-gain") }), { ...ctx(), rng }, registry);
    expect(result.outcome).toBe("applied"); expect(result.state.journey.deck[0].transfiguration).toBe("Enduring"); expect(rng).toHaveBeenCalledTimes(3);
    expect(result.logRecords?.map(row => row.fields.heldIndex)).toEqual([0, 1]);
  });
  it.each(["Event", "formed", "no-forms"])("does not draw for %s", kind => {
    const before = setup([CRYSTAL]); before.journey.deck = [];
    registerJourneyTransfigurationProvider({ resolve: () => ({ cardId: testCardId("ineligible"), cardType: kind === "Event" ? "Event" : "Character", subtype: parseCardSubtype("Mage"), forms: kind === "no-forms" ? [] : ["Kindled"] }) });
    const rng = vi.fn(() => 0), result = reduceGameEvent(before, event("ADD_CARD", { cardId: testCardId("ineligible"), ...(kind === "formed" ? { transfiguration: "Kindled" } : {}) }), { ...ctx(), rng }, registry);
    expect(result.outcome).toBe("applied"); expect(rng).not.toHaveBeenCalled(); expect(result.logRecords).toBeUndefined();
  });
  it("honors effective card type on a genuinely gained physical copy", () => {
    const before = setup([CRYSTAL]); before.journey.deck = [{ entryId: parseDeckEntryId("chance-effective"), cardNumber: 3, transfiguration: null, isBane: false, typeChange: { predicateId: parseCardTypeChangePredicateId("effective-type"), cardType: "Character", subtype: parseCardSubtype("Mage"), label: "" } }];
    const rng = vi.fn(() => 0), result = reduceGameEvent(before, event("DUPLICATE_DECK_ENTRY", { entryId: before.journey.deck[0].entryId }), { ...ctx(), rng }, registry);
    expect(result.outcome).toBe("applied"); expect(result.state.journey.deck[1].transfiguration).toBe("Kindled"); expect(result.state.journey.deck[0].transfiguration).toBeNull(); expect(rng).toHaveBeenCalledTimes(2);
  });
  it.each([{ numerator: -1, denominator: 2 }, { numerator: 1, denominator: 0 }, { numerator: 3, denominator: 2 }, { numerator: 0.5, denominator: 2 }, { numerator: 1, denominator: Number.MAX_SAFE_INTEGER + 1 }])("rejects unsafe rational descriptor %j", ratio => {
    expect(() => journeyDeckEntry(CRYSTAL, { kind: "randomCharacterTransfiguration", ...ratio })).toThrow();
  });
});
