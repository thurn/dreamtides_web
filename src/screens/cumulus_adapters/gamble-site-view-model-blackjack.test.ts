import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import type { BlackjackSiteRuntime } from "../../types/journey";
import { parseShuffleCommitment } from "../../types/identifiers";
import { buildGambleSiteView, GAMBLE_SITE, GUIDE, GUIDE_LINE_SOURCE } from "./gamble-site-view-model.fixtures";

expect.addEqualityTesters([annotatedTextEquality]);

const GUIDE_LINE = GUIDE_LINE_SOURCE;

describe("gamble-site-view-model — Blackjack", () => {
  const runtime: BlackjackSiteRuntime = {
    kind: "gamble",
    gameId: "blackjack",
    selectionTrace: testGambleSelectionTrace("blackjack"),
    isFarpoint: false,
    wagerCost: 50,
    prizeEssence: 300,
    attemptNumber: 1,
    shuffleCommitment: parseShuffleCommitment("fixture-blackjack-commitment"),
    committedDeck: [
      { rank: "10", suit: "clubs" },
      { rank: "6", suit: "hearts" },
      { rank: "5", suit: "spades" },
      { rank: "K", suit: "diamonds" },
    ],
    deckCursor: 4,
    playerCards: [
      { rank: "10", suit: "clubs" },
      { rank: "6", suit: "hearts" },
    ],
    dealerCards: [
      { rank: "5", suit: "spades" },
      { rank: "K", suit: "diamonds" },
    ],
    dealerRevealed: false,
    wagerPaid: true,
    playerDecision: "deal",
    outcome: null,
    resultSettled: false,
    essenceAwarded: 0,
  };

  it("maps the wager, flat prize, player hand, and concealed dealer hand", () => {
    const view = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 64,
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expect(view?.gameId).toBe("blackjack");
    if (view?.gameId !== "blackjack") {
      throw new Error("expected Blackjack view");
    }
    expect(view).toMatchObject({
      handId: "fixture-blackjack-commitment",
      wagerCost: 50,
      prizeEssence: 300,
      canAffordWager: true,
      playerTotal: 16,
      dealerTotal: 5,
      dealerRevealed: false,
      outcome: null,
      canPlayAgain: false,
    });
  });
});
