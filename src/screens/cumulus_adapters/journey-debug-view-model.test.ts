import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { JourneyState } from "../../types/journey";
import { buildJourneyDebugEditorView } from "./journey-debug-view-model";

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: asCardId("card-1"),
    name: asCardName("Shared Name"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    renderedText: "A focused fixture.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function state(): JourneyState {
  return {
    essence: 4,
    maxDreamsigns: 3,
    completionLevel: 2,
    dreamsigns: [{ id: "sign-a", name: "Shared Sign", effectDescription: "Fixture", isBane: false }],
    deck: [
      { entryId: "entry-a", cardNumber: 1, transfiguration: null, isBane: false, statOverride: { energyCost: 0 } },
      { entryId: "entry-b", cardNumber: 1, transfiguration: "Kindled", isBane: true },
      { entryId: "missing", cardNumber: 404, transfiguration: null, isBane: false },
    ],
  } as unknown as JourneyState;
}

describe("buildJourneyDebugEditorView", () => {
  it("uses UUID card identities and entry ids while retaining duplicate deck entries", () => {
    const shared = card();
    const view = buildJourneyDebugEditorView(state(), new Map([[1, shared]]), [{ id: "sign-a", name: "Shared Sign", effectDescription: "Fixture" }]);

    expect(view.cards[0]?.cardId).toBe("card-1");
    expect(view.cards[0]?.model.cardId).toBe("card-1");
    expect(view.deck.map((entry) => entry.entryId)).toEqual(["entry-a", "entry-b", "missing"]);
    expect(view.deck[0]?.model?.displaySnapshot.energyCost).toBe(0);
    expect(view.deck[1]?.model?.transfiguration?.sparkChanged).toBe(true);
    expect(view.deck[2]?.model).toBeNull();
  });

  it("keeps a positional provider address separate from Dreamsign display identity", () => {
    const view = buildJourneyDebugEditorView(state(), new Map([[1, card()]]), []);

    expect(view.dreamsigns[0]).toMatchObject({ actionId: "dreamsign:0", templateId: "sign-a", name: "Shared Sign" });
  });
});
