// @vitest-environment jsdom

// GambleSiteScreen: Four-Suit Reprise.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FourSuitRepriseSiteView } from "./GambleSiteScreen";
import { transfigurationPresentationFixture } from "../test-helpers/transfiguration-fixture";
import { parseDeckEntryId } from "../../types/identifiers";
import { testGambleResultId } from "../../types/test-identities";
import { syntheticGameCard } from "../test-helpers/component-test-fixtures";
import { SITE, advance, renderGamble, tid } from "./GambleSiteScreen.fixtures";

function fourSuitCardView(index: number) {
  const model = syntheticGameCard(index);
  return {
    entryId: parseDeckEntryId(`four-suit-entry-${String(index)}`),
    cardId: model.cardId,
    model,
  };
}

const FOUR_SUIT: FourSuitRepriseSiteView = {
  ...SITE,
  gameId: "four-suit-reprise",
  drawCost: 25,
  canAffordDraw: true,
  roundNumber: 1,
  maxRounds: 3,
  essenceReward: 100,
  outcomes: [
    { suit: "spades", outcome: "transfiguration" },
    { suit: "diamonds", outcome: "essence" },
    { suit: "hearts", outcome: "duplication" },
    { suit: "clubs", outcome: "purge" },
  ],
  phase: "choose",
  cards: [fourSuitCardView(1), fourSuitCardView(2)],
  result: null,
  canPlayAgain: false,
};

function spadesResult(
  overrides: Partial<NonNullable<FourSuitRepriseSiteView["result"]>> = {},
): FourSuitRepriseSiteView {
  const target = FOUR_SUIT.cards[0];
  return {
    ...FOUR_SUIT,
    phase: "result",
    cards: [FOUR_SUIT.cards[1]],
    result: {
      id: testGambleResultId("four-suit-result-1"),
      roundNumber: 1,
      card: { rank: "A", suit: "spades" },
      outcome: "transfiguration",
      resultRevealed: false,
      resultSettled: false,
      essenceGained: 0,
      target,
      transfigurationCandidate: {
        entryId: target.entryId,
        model: target.model,
        availability: "available",
        reforgedType: null,
        forms: [
          {
            type: "Empowered",
            presentation: transfigurationPresentationFixture("Empowered"),
            effectDetails: { fixture: true },
            pricing: { kind: "unpriced" },
            previewModel: target.model,
          },
        ],
      },
      chosenTransfiguration: null,
      ...overrides,
    },
    canPlayAgain: overrides.resultSettled === true,
  };
}

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => {
  vi.useRealTimers();
});

describe("GambleSiteScreen — Four-Suit Reprise", () => {
  it("selects, reselects, and draws against a card by entry id", () => {
    const onDrawFourSuit = vi.fn();
    const screen = renderGamble(FOUR_SUIT, { onDrawFourSuit });
    const pick = tid("gamble-four-suit-card-four-suit-entry-1");

    expect(screen.query("[data-four-suit-picker]")).not.toBeNull();
    screen.tap(pick);
    expect(screen.query("[data-four-suit-picker]")).toBeNull();
    expect(
      screen.query('[data-four-suit-target="four-suit-entry-1"]'),
    ).not.toBeNull();
    expect(screen.count("[data-four-suit-outcome]")).toBe(4);

    screen.tap(tid("gamble-four-suit-choose-again"));
    expect(screen.query("[data-four-suit-picker]")).not.toBeNull();
    screen.tap(pick);
    screen.tap(tid("gamble-four-suit-draw"));
    expect(onDrawFourSuit).toHaveBeenCalledWith("four-suit-entry-1");
  });

  it("chooses a free Transfiguration after Spades, then replays once settled", () => {
    vi.useFakeTimers();
    const onFourSuitOutcomeShown = vi.fn();
    const onChooseFourSuitTransfiguration = vi.fn();
    const onPlayAgainFourSuit = vi.fn();
    const screen = renderGamble(spadesResult(), {
      onFourSuitOutcomeShown,
      onChooseFourSuitTransfiguration,
      onPlayAgainFourSuit,
    });

    advance(2_000);
    expect(onFourSuitOutcomeShown).toHaveBeenCalledOnce();
    screen.show(spadesResult({ resultRevealed: true }));
    advance();
    expect(screen.query(tid("cumulus-transfiguration-detail"))).not.toBeNull();
    screen.tap(tid("cumulus-transfiguration-form-Empowered"));
    screen.tap(tid("cumulus-transfiguration-confirm"));
    expect(onChooseFourSuitTransfiguration).toHaveBeenCalledWith("Empowered");

    screen.show(
      spadesResult({
        resultRevealed: true,
        resultSettled: true,
        chosenTransfiguration: "Empowered",
      }),
    );
    advance();
    expect(screen.query("[data-four-suit-target]")).toBeNull();
    screen.tap(tid("gamble-four-suit-play-again"));
    expect(onPlayAgainFourSuit).toHaveBeenCalledOnce();
    expect(screen.query(tid("gamble-four-suit-play-again"))).toBeNull();
  });
});
