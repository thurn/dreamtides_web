import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../src/types/card-identity";
import type { CardData } from "../../src/types/cards";
import { searchAvailableCards, updateSignatureCards, type EditorSnapshot } from "./editor";

const cards = [
  { id: asCardId("00000000-0000-4000-8000-000000000101"), name: asCardName("First"), renderedText: "Draw a card", subtype: "Guide", cardType: "Character" },
  { id: asCardId("00000000-0000-4000-8000-000000000102"), name: asCardName("Second"), renderedText: "Banish a character", subtype: "Warrior", cardType: "Character" },
  { id: asCardId("00000000-0000-4000-8000-000000000103"), name: asCardName("Arrival"), renderedText: "Gain energy", subtype: "", cardType: "Event" },
] as CardData[];

describe("signature card search", () => {
  it("searches name, rules, subtype, and UUID while omitting selected cards", () => {
    expect(searchAvailableCards(cards, [], "warrior", "all").map((card) => card.id)).toEqual([cards[1].id]);
    expect(searchAvailableCards(cards, [], "gain energy", "all").map((card) => card.id)).toEqual([cards[2].id]);
    expect(searchAvailableCards(cards, [], "0000101", "all").map((card) => card.id)).toEqual([cards[0].id]);
    expect(searchAvailableCards(cards, [cards[0].id], "first", "all")).toEqual([]);
  });

  it("filters by card type and sorts by display name", () => {
    expect(searchAvailableCards(cards, [], "", "Character").map((card) => card.name)).toEqual(["First", "Second"]);
    expect(searchAvailableCards(cards, [], "", "Event").map((card) => card.name)).toEqual(["Arrival"]);
  });
});

describe("signature card edit intent", () => {
  it("resolves each queued update against the latest snapshot", () => {
    const initial = {
      dataset: "affiliations",
      repositoryRoot: "fixture",
      sourceRevision: "one",
      default_random_draw_max_multiplier: 1,
      default_opponent_deck_max_multiplier: 1,
      affiliations: [{ id: "affiliation", name: "Fixture", atlas_card_theme: "Fixture", signature_card_ids: ["A", "B", "C"] }],
      cards: [],
    } satisfies EditorSnapshot;
    const removeA = updateSignatureCards("affiliation", (ids) => ids.filter((id) => id !== "A"));
    const first = removeA(initial);
    expect(first).toMatchObject({ card_ids: ["B", "C"] });
    const afterFirst = { ...initial, sourceRevision: "two", affiliations: [{ ...initial.affiliations[0], signature_card_ids: ["B", "C"] }] };
    const removeB = updateSignatureCards("affiliation", (ids) => ids.filter((id) => id !== "B"));
    expect(removeB(afterFirst)).toMatchObject({ card_ids: ["C"] });
  });
});
