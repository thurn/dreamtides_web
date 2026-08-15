import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { LocalizedString } from "@trox/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type { JourneyState } from "../../types/journey";
import { buildJourneyDebugEditorView as buildJourneyDebugEditorViewImpl } from "./journey-debug-view-model";
import { NIGHTMARE_CARD_ID, NIGHTMARE_CARD_NAME } from "../../data/nightmare";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testDreamsignId } from "../../types/test-identities";

const buildJourneyDebugEditorView = (
  ...args: Parameters<typeof buildJourneyDebugEditorViewImpl> extends readonly [
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) => buildJourneyDebugEditorViewImpl(transfigurationFixture(), ...args);

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: testCardId("card-1"),
    name: parseCardName("Shared Name"),
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
    dreamsigns: [
      {
        id: testDreamsignId("sign-a"),
        name: "Shared Sign",
        effectDescription: "Fixture",
      },
    ],
    deck: [
      {
        entryId: parseDeckEntryId("entry-a"),
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
        statOverride: { energyCost: 0 },
      },
      {
        entryId: parseDeckEntryId("nightmare"),
        cardNumber: 10002,
        transfiguration: "Kindled",
        isBane: true,
      },
      {
        entryId: parseDeckEntryId("missing"),
        cardNumber: 404,
        transfiguration: null,
        isBane: false,
      },
    ],
  } as unknown as JourneyState;
}

describe("buildJourneyDebugEditorView", () => {
  it("uses UUID card identities and entry ids while retaining duplicate deck entries", () => {
    const shared = card();
    const nightmare = card({
      id: NIGHTMARE_CARD_ID,
      name: parseCardName(NIGHTMARE_CARD_NAME),
      cardNumber: 10002,
    });
    const view = buildJourneyDebugEditorView(
      state(),
      new Map([
        [1, shared],
        [10002, nightmare],
      ]),
      [
        {
          id: testDreamsignId("sign-a"),
          name: "Shared Sign",
          effectDescription: "Fixture",
        },
      ],
    );

    expect(view.cards[0]?.cardId).toBe(shared.id);
    expect(view.cards[0]?.model.cardId).toBe(shared.id);
    expect(view.deck.map((entry) => entry.entryId)).toEqual([
      parseDeckEntryId("entry-a"),
      parseDeckEntryId("nightmare"),
      parseDeckEntryId("missing"),
    ]);
    expect(view.deck[0]?.model?.displaySnapshot.energyCost).toBe(0);
    expect(view.deck[1]?.model?.transfiguration?.sparkChanged).toBe(true);
    expect(view.deck[2]?.model).toBeNull();
  });

  it("keeps a positional provider address separate from Dreamsign display identity", () => {
    const journey = state();
    const view = buildJourneyDebugEditorView(
      journey,
      new Map([[1, card()]]),
      [],
    );

    expect(view.dreamsigns[0]).toMatchObject({
      actionId: "dreamsign:0",
      templateId: journey.dreamsigns[0]?.id,
    });
    expect(view.dreamsigns[0]?.name).toBeInstanceOf(LocalizedString);
  });
});
