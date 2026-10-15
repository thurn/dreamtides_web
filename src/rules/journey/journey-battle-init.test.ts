import { afterEach, describe, expect, it } from "vitest";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { journeyBattleInit, journeyOpeningHandEntries, journeyOpeningHandGuarantees, validJourneyOpeningBindings } from "./journey-battle-init";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { parseCardSubtype } from "../../types/card-identity";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
import { MUG, OTHER_MUG, OTHER, openingContent, openingEntry, openingInitial, openingRegistry, openingSign } from "./journey-battle-init-fixtures";

afterEach(clearGameProviders);
const lookup = (id: Parameters<typeof openingRegistry.lookup>[0]) => openingRegistry.lookup(id);

describe("journeyBattleInit physical binding", () => {
  it("registers complementary acquisition and battle descriptors on a synthetic source", () => {
    const definition = journeyBattleInit(MUG, { kind: "chosenOpeningHandEntry" }, { kind: "chooseOpeningHandEventOnGain" });
    const registry = createJourneyModifierRegistry([definition]);
    expect(registry.lookup(MUG)).toMatchObject({ journeyBattleInit: { kind: "chosenOpeningHandEntry" },
      journeyOnGain: { kind: "chooseOpeningHandEventOnGain" } });
    expect(() => journeyBattleInit(MUG, { kind: "invalid" } as never, { kind: "chooseOpeningHandEventOnGain" })).toThrow(RangeError);
  });

  it("uses effective Event values and distinguishes duplicate physical entries from missing content", () => {
    const content = openingContent(), provider = createJourneyTransfigurationProvider(content);
    const deck = [openingEntry("same-printing-a"), openingEntry("same-printing-b"),
      openingEntry("changed-event", 1, { typeChange: { predicateId: parseCardTypeChangePredicateId("synthetic-opening"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "" } }),
      openingEntry("changed-character", 2, { typeChange: { predicateId: parseCardTypeChangePredicateId("synthetic-opening"), cardType: "Event", subtype: parseCardSubtype(""), label: "" } })];
    expect(journeyOpeningHandEntries(deck, entry => provider.resolve(entry))?.map(({ entry }) => entry.entryId))
      .toEqual([deck[0].entryId, deck[1].entryId, deck[3].entryId]);
    expect(journeyOpeningHandEntries([openingEntry("character-only", 2)], entry => provider.resolve(entry))).toEqual([]);
    expect(journeyOpeningHandEntries([...deck, openingEntry("unknown", 999)], entry => provider.resolve(entry))).toBeNull();
    expect(journeyOpeningHandEntries([], entry => provider.resolve(entry))).toEqual([]);
  });

  it("keeps one original slot per physical binding, held order and repeated source attribution", () => {
    const journey = openingInitial().journey, target = journey.deck[1];
    const held = [openingSign(OTHER), { ...openingSign(MUG), openingHandEntryId: target.entryId },
      { ...openingSign(OTHER_MUG), openingHandEntryId: target.entryId }];
    expect(journeyOpeningHandGuarantees({ ...journey, dreamsigns: held }, lookup)).toEqual([
      { deckIndex: 1, entryId: target.entryId, dreamsignId: MUG, heldIndex: 1 },
      { deckIndex: 1, entryId: target.entryId, dreamsignId: OTHER_MUG, heldIndex: 2 },
    ]);
    expect(journeyOpeningHandGuarantees({ ...journey, deck: journey.deck.filter((entry) => entry.entryId !== target.entryId), dreamsigns: held }, lookup)).toEqual([]);
    expect(journeyOpeningHandGuarantees({ ...journey, dreamsigns: held.slice(0, 1) }, lookup)).toEqual([]);
  });

  it("retains a later changed entry without binding its new physical copy", () => {
    const target = openingEntry("selected", 1, { typeChange: { predicateId: parseCardTypeChangePredicateId("synthetic-opening"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "" } });
    const journey = openingInitial({ deck: [openingEntry("new-copy"), target],
      dreamsigns: [{ ...openingSign(), openingHandEntryId: target.entryId }] }).journey;
    expect(journeyOpeningHandGuarantees(journey, lookup)).toEqual([
      { deckIndex: 1, entryId: target.entryId, dreamsignId: MUG, heldIndex: 0 },
    ]);
    expect(validJourneyOpeningBindings([{ ...openingSign(), openingHandEntryId: "removed-physical-entry" }], lookup)).toBe(true);
    for (const field of [null, undefined, 42, ""]) {
      expect(validJourneyOpeningBindings([{ ...openingSign(), openingHandEntryId: field }], lookup)).toBe(false);
    }
    expect(validJourneyOpeningBindings([{ ...openingSign(OTHER), openingHandEntryId: target.entryId }], lookup)).toBe(false);
  });

});
