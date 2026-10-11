import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import type {
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
} from "../../types/journey";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { parseShuffleCommitment } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { buildGambleSiteView, GAMBLE_SITE, GUIDE, GUIDE_LINE_SOURCE } from "./gamble-site-view-model.fixtures";

expect.addEqualityTesters([annotatedTextEquality]);

const GUIDE_LINE = GUIDE_LINE_SOURCE;

function fourSuitCard(index: number): CardData {
  return {
    name: parseCardName(`Four Suit Fixture ${String(index)}`),
    id: testCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "Materialized: Gain 1 Essence.",
    imageNumber: index,
    artOwned: true,
  };
}

function fourSuitTarget(
  index: number,
  entryId = `four-suit-entry-${String(index)}`,
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
        effectDetails: { fixture: true },
        previewCard: { ...card, energyCost: 1 },
        essenceCost: 0,
      },
    ],
  };
}

describe("gamble-site-view-model — Four-Suit Reprise", () => {
  it("maps unpriced forms and removes every used card UUID from later rounds", () => {
    const target = fourSuitTarget(1);
    const sameCardCopy = {
      ...fourSuitTarget(1, "four-suit-entry-1-copy"),
      cardId: target.cardId,
      cardSnapshot: target.cardSnapshot,
    };
    const nextTarget = fourSuitTarget(2);
    const runtime: FourSuitRepriseSiteRuntime = {
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
      committedCards: [
        { rank: "4", suit: "diamonds" },
        { rank: "7", suit: "hearts" },
        { rank: "Q", suit: "clubs" },
      ],
      targets: [target, sameCardCopy, nextTarget],
      rounds: [
        {
          roundNumber: 1,
          shuffleCommitment: parseShuffleCommitment("round-1"),
          card: { rank: "4", suit: "diamonds" },
          targetEntryId: target.entryId,
          targetCardId: target.cardId,
          costPaid: 25,
          outcome: "essence",
          resultRevealed: true,
          resultSettled: true,
          essenceGained: 100,
        },
      ],
      phase: "result",
    };
    const view = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 25,
        deck: runtime.targets.map((candidate) => ({
          entryId: candidate.entryId,
          cardNumber: candidate.cardNumber,
          transfiguration: null,
          isBane: false,
        })),
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("four-suit-reprise");
    if (view?.gameId !== "four-suit-reprise") {
      throw new Error("expected Four-Suit Reprise view");
    }
    expect(view.cards.map((card) => card.cardId)).toEqual([nextTarget.cardId]);
    expect(view.result?.target.entryId).toBe(target.entryId);
    expect(
      view.result?.transfigurationCandidate.forms.map((form) => ({
        type: form.type,
        pricing: form.pricing,
      })),
    ).toEqual([
      {
        type: "Empowered",
        pricing: { kind: "unpriced" },
      },
    ]);
    expect(view.canPlayAgain).toBe(true);

    const replayView = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 25,
        deck: runtime.targets.map((candidate) => ({
          entryId: candidate.entryId,
          cardNumber: candidate.cardNumber,
          transfiguration: null,
          isBane: false,
        })),
        siteRuntime: {
          [GAMBLE_SITE.id]: { ...runtime, phase: "choose" },
        },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expect(replayView?.gameId).toBe("four-suit-reprise");
    if (replayView?.gameId !== "four-suit-reprise") {
      throw new Error("expected Four-Suit Reprise replay view");
    }
    expect(replayView.roundNumber).toBe(2);
    expect(replayView.result).toBeNull();
  });
});
