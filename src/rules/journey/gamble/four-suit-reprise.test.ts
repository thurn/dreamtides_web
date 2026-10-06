import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StandardPlayingCard } from "../../../types/gamble";
import type {
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
} from "../../../types/journey";
import type { CardData } from "../../../types/cards";
import { parseCardName } from "../../../types/card-identity";
import type { DeckEntryId } from "../../../types/identifiers";
import {
  parseDeckEntryId,
  parseShuffleCommitment,
} from "../../../types/identifiers";
import { testCardId } from "../../../types/test-identities";
import { testGambleSelectionTrace } from "../../../testing/gamble-fixture";
import type { FoldState } from "../../fold-state";
import { registerSiteContentProvider } from "../sites";
import { testSiteContentProvider } from "../test-content-providers";
import { apply, gambleStateWith, SITE_ID } from "./test-fixture";

afterEach(() => {
  registerSiteContentProvider(null);
});
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider());
});

function fourSuitCard(index: number): CardData {
  return {
    name: parseCardName(`Fixture Card ${String(index)}`),
    id: testCardId(`fixture-card-${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    renderedText: "Gain 2 spark.",
    imageNumber: index,
    artOwned: false,
  };
}

function fourSuitTarget(
  index: number,
  entryId = `deck-${String(index)}`,
): FourSuitRepriseTarget {
  const card = fourSuitCard(index);
  return {
    entryId: parseDeckEntryId(entryId),
    cardId: card.id,
    cardNumber: card.cardNumber,
    cardSnapshot: card,
    transfigurationOffers: [
      {
        entryId: parseDeckEntryId(entryId),
        type: "Empowered",
        effectDetails: {},
        previewCard: { ...card, energyCost: 2 },
        essenceCost: 0,
      },
    ],
  };
}

function fourSuitRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<FourSuitRepriseSiteRuntime> = {},
): FourSuitRepriseSiteRuntime {
  return {
    kind: "gamble",
    gameId: "four-suit-reprise",
    selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
    isFarpoint: false,
    drawCost: 25,
    shuffleCommitments: [
      parseShuffleCommitment("round-1"),
      parseShuffleCommitment("round-2"),
      parseShuffleCommitment("round-3"),
    ],
    committedCards: [...cards],
    targets: [fourSuitTarget(1), fourSuitTarget(2), fourSuitTarget(3)],
    rounds: [],
    phase: "choose",
    ...overrides,
  };
}

function fourSuitStateWith(
  cards: readonly StandardPlayingCard[],
  runtimeOverrides: Partial<FourSuitRepriseSiteRuntime> = {},
): FoldState {
  const targets = runtimeOverrides.targets ?? [
    fourSuitTarget(1),
    fourSuitTarget(2),
    fourSuitTarget(3),
  ];
  return gambleStateWith(
    fourSuitRuntime(cards, { ...runtimeOverrides, targets }),
    {
      deck: targets.map((target) => ({
        entryId: target.entryId,
        cardNumber: target.cardNumber,
        transfiguration: null,
        isBane: false,
      })),
    },
  );
}

function drawFourSuit(state: FoldState, entryId: DeckEntryId) {
  return apply(state, "DRAW_FOUR_SUIT_REPRISE", {
    siteId: SITE_ID,
    entryId,
  });
}

function settleFourSuit(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (
    siteRuntime?.kind !== "gamble" ||
    siteRuntime.gameId !== "four-suit-reprise"
  ) {
    throw new Error("expected Four-Suit Reprise runtime");
  }
  const round = siteRuntime.rounds[siteRuntime.rounds.length - 1];
  if (round === undefined) throw new Error("expected Four-Suit Reprise round");
  return apply(state, "SETTLE_FOUR_SUIT_REPRISE", {
    siteId: SITE_ID,
    shuffleCommitment: round.shuffleCommitment,
  });
}

describe("Four-Suit Reprise", () => {
  const followupCards: readonly StandardPlayingCard[] = [
    { rank: "4", suit: "diamonds" },
    { rank: "7", suit: "hearts" },
    { rank: "Q", suit: "clubs" },
  ];

  it("charges one draw and grants Diamonds while leaving the target unchanged", () => {
    const drawn = drawFourSuit(
      fourSuitStateWith(followupCards),
      parseDeckEntryId("deck-1"),
    );
    expect(drawn.outcome).toBe("applied");
    expect(drawn.state.journey.essence).toBe(175);
    expect(drawn.state.journey.deck).toHaveLength(3);
    expect(
      apply(drawn.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");

    const settled = settleFourSuit(drawn.state);
    expect(settled.outcome).toBe("applied");
    expect(settled.state.journey.essence).toBe(275);
    expect(settled.state.journey.deck).toHaveLength(3);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      phase: "result",
      rounds: [
        {
          targetEntryId: parseDeckEntryId("deck-1"),
          targetCardId: testCardId("fixture-card-1"),
          outcome: "essence",
          resultRevealed: true,
          resultSettled: true,
          essenceGained: 100,
        },
      ],
    });
  });

  it("duplicates on Hearts and purges on Clubs", () => {
    const heartsState = fourSuitStateWith([
      { rank: "7", suit: "hearts" },
      followupCards[1],
      followupCards[2],
    ]);
    const duplicated = settleFourSuit(
      drawFourSuit(heartsState, parseDeckEntryId("deck-1")).state,
    );
    expect(duplicated.state.journey.deck).toHaveLength(4);
    expect(duplicated.state.journey.deck[3]).toMatchObject({
      cardNumber: 1,
      transfiguration: null,
      isBane: false,
    });
    expect(duplicated.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [{ outcome: "duplication", resultSettled: true }],
    });

    const clubsState = fourSuitStateWith([
      { rank: "Q", suit: "clubs" },
      followupCards[1],
      followupCards[2],
    ]);
    const purged = settleFourSuit(
      drawFourSuit(clubsState, parseDeckEntryId("deck-1")).state,
    );
    expect(purged.state.journey.deck.map((entry) => entry.entryId)).toEqual([
      "deck-2",
      "deck-3",
    ]);
    expect(purged.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [{ outcome: "purge", resultSettled: true }],
    });
  });

  it("requires a free chosen Transfiguration after Spades", () => {
    const drawn = drawFourSuit(
      fourSuitStateWith([
        { rank: "A", suit: "spades" },
        followupCards[1],
        followupCards[2],
      ]),
      parseDeckEntryId("deck-1"),
    );
    const revealed = settleFourSuit(drawn.state);
    expect(revealed.outcome).toBe("applied");
    expect(revealed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [
        {
          outcome: "transfiguration",
          resultRevealed: true,
          resultSettled: false,
        },
      ],
    });
    expect(
      apply(revealed.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");

    const chosen = apply(
      revealed.state,
      "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION",
      {
        siteId: SITE_ID,
        shuffleCommitment: parseShuffleCommitment("round-1"),
        type: "Empowered",
      },
    );
    expect(chosen.outcome).toBe("applied");
    expect(chosen.state.journey.deck[0]?.transfiguration).toBe("Empowered");
    expect(chosen.state.journey.essence).toBe(175);
    expect(chosen.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [
        {
          resultSettled: true,
          chosenTransfiguration: "Empowered",
        },
      ],
    });
  });
});
