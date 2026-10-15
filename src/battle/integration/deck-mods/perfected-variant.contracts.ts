import { describe, expect, it } from "vitest";
import { syntheticId } from "../../../engine/testing/synthetic-cards";
import { makeAuguryTestCard } from "../../../journey_v2/testing/fixtures";
import { transfigurationFixture } from "../../../testing/transfiguration-fixture";
import { eligibleTransfigurations } from "../../../transfiguration/transfiguration-logic";
import { parseCardSubtype } from "../../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId } from "../../../types/identifiers";
import type { DeckEntry } from "../../../types/journey";
import { createEngineBattleInit, engineDeckEntry } from "../engine-battle-init";

const card = makeAuguryTestCard({ id: syntheticId(0x71001), cardNumber: 71001, energyCost: 0, spark: 1, renderedText: "base", amplifiedText: "amplified" });
const data = transfigurationFixture();
const entry = (transfiguration: DeckEntry["transfiguration"]): DeckEntry => ({ entryId: parseDeckEntryId(`bridge-${transfiguration ?? "plain"}`), cardNumber: card.cardNumber, transfiguration, isBane: false });
const modified = (transfiguration: DeckEntry["transfiguration"]): DeckEntry => ({ ...entry(transfiguration), sparkBonus: 3, keywordModification: { energyCostReduction: 2, fast: true, setReclaim: 1 }, typeChange: { predicateId: parseCardTypeChangePredicateId("bridge-type"), label: "", cardType: "Character", subtype: parseCardSubtype("Mage") } });
const deckMods = { sparkBonus: 3, costReduction: 2, fast: true, reclaim: 1, typeChange: { cardType: "character", subtype: parseCardSubtype("Mage") } };

// The bridge selects an authored variant only for an explicit Amplified entry.
// Perfected carries a form so the engine can capture its original constituents.
describe("Perfected journey variant protocol", () => {
  it.each([null, "Amplified"] as const)("preserves the explicit %s tuple with and without permanent modifications", form => {
    const variant = form === null ? {} : { amplified: true, transfigurations: [form] };
    expect(engineDeckEntry(entry(form), card, data)).toEqual({ cardId: card.id, ...variant });
    const subject = modified(form), before = structuredClone({ subject, card, data });
    const tuple = engineDeckEntry(subject, card, data);
    expect(tuple).toEqual({ cardId: card.id, ...variant, deckMods });
    expect(tuple.deckMods?.typeChange).not.toBe(subject.typeChange);
    expect({ subject, card, data }).toEqual(before);
  });

  it.each([undefined, "base", "amplified"])("forwards Perfected independently of synthetic authored text %s", amplifiedText => {
    const printing = { ...card, amplifiedText }, subject = modified("Perfected");
    const before = structuredClone({ subject, printing, data });
    expect(eligibleTransfigurations(data, printing).includes("Amplified")).toBe(amplifiedText === "amplified");
    const tuple = engineDeckEntry(subject, printing, data);
    expect(tuple).toEqual({ cardId: printing.id, transfigurations: ["Perfected"], deckMods });
    expect(tuple).not.toHaveProperty("amplified");
    expect(tuple.deckMods?.typeChange).not.toBe(subject.typeChange);
    expect({ subject, printing, data }).toEqual(before);
    const withoutAmplified = { ...data, forms: data.forms.filter(form => form.id !== "Amplified") };
    expect(engineDeckEntry(subject, printing, withoutAmplified)).toEqual(tuple);
  });

  it("hands the player forms and modifications through the actual battle-init caller", () => {
    const journey = { deck: [entry(null), modified("Amplified"), modified("Perfected")], avatar: null, dreamsigns: [], battleModifiers: [] };
    const enemy = { deck: [syntheticId(0x71002)], avatar: null, dreamsigns: [] };
    const before = structuredClone({ journey, enemy, card, data });
    const input = createEngineBattleInit({ seed: 71, scoreToWin: 25, startingSide: "player", journey, enemy, cardDatabase: new Map([[card.cardNumber, card]]), transfigurationData: data, minimumDeckSize: 1, dreamwell: [] });
    expect(input.decks.player).toEqual([
      { cardId: card.id },
      { cardId: card.id, amplified: true, transfigurations: ["Amplified"], deckMods },
      { cardId: card.id, transfigurations: ["Perfected"], deckMods },
    ]);
    expect(input.decks.enemy).toEqual([{ cardId: enemy.deck[0] }]);
    expect({ journey, enemy, card, data }).toEqual(before);
  });
});
