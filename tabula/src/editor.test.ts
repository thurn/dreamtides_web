import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../src/types/card-identity";
import type { CardData } from "../../src/types/cards";
import { buildOperations, draftFromSnapshot, searchCards, validateDraft, type EditorSnapshot } from "./editor";

const cards = [
  { id: asCardId("00000000-0000-4000-8000-000000000101"), name: asCardName("First"), renderedText: "Draw a card", subtype: "Guide", cardType: "Character" },
  { id: asCardId("00000000-0000-4000-8000-000000000102"), name: asCardName("Second"), renderedText: "Banish a character", subtype: "Warrior", cardType: "Character" },
  { id: asCardId("00000000-0000-4000-8000-000000000103"), name: asCardName("Arrival"), renderedText: "Gain energy", subtype: "", cardType: "Event" },
] as CardData[];

const snapshot = {
  dataset: "affiliations",
  repositoryRoot: "fixture",
  sourceRevision: "one",
  default_random_draw_max_multiplier: 1.25,
  default_opponent_deck_max_multiplier: 3.5,
  affiliations: [{ id: "affiliation", name: "Fixture", atlas_card_theme: "Theme", signature_card_ids: [cards[0].id, cards[1].id] }],
  cards,
} satisfies EditorSnapshot;

describe("card search", () => {
  it("searches name, rules, subtype, and UUID", () => {
    expect(searchCards(cards, "warrior", "all").map((card) => card.id)).toEqual([cards[1].id]);
    expect(searchCards(cards, "gain energy", "all").map((card) => card.id)).toEqual([cards[2].id]);
    expect(searchCards(cards, "0000101", "all").map((card) => card.id)).toEqual([cards[0].id]);
  });

  it("filters by card type and sorts by display name", () => {
    expect(searchCards(cards, "", "Character").map((card) => card.name)).toEqual(["First", "Second"]);
    expect(searchCards(cards, "", "Event").map((card) => card.name)).toEqual(["Arrival"]);
  });
});

describe("draft operations", () => {
  it("creates a minimal semantic batch", () => {
    const draft = draftFromSnapshot(snapshot);
    draft.default_random_draw_max_multiplier = "2";
    draft.affiliations[0].name = "Changed";
    draft.affiliations[0].signature_card_ids.reverse();
    expect(buildOperations(snapshot, draft)).toEqual([
      { operation: "set_affiliation_catalog_field", field: "default_random_draw_max_multiplier", value: 2 },
      { operation: "set_affiliation_field", affiliation_id: "affiliation", field: "name", value: "Changed" },
      { operation: "replace_affiliation_signature_cards", affiliation_id: "affiliation", card_ids: [cards[1].id, cards[0].id] },
    ]);
  });

  it("emits no operations for an unchanged draft", () => {
    expect(buildOperations(snapshot, draftFromSnapshot(snapshot))).toEqual([]);
  });

  it("reports field, duplicate, empty-list, and unresolved-reference errors", () => {
    const draft = draftFromSnapshot(snapshot);
    draft.default_opponent_deck_max_multiplier = "0";
    draft.affiliations[0].name = "";
    draft.affiliations[0].signature_card_ids = [cards[0].id, cards[0].id, "missing"];
    const result = validateDraft(draft, cards);
    expect(result.fields.default_opponent_deck_max_multiplier).toBeDefined();
    expect(result.fields["affiliation.name"]).toBeDefined();
    expect(result.fields["affiliation.signature_card_ids"]).toBeDefined();
    expect(result.unresolvedCardIds.affiliation).toEqual(["missing"]);
  });
});
