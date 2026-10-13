import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import type {
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
  DeckEntry,
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

function copiedScenario() {
  const base = fourSuitCard(1), target = fourSuitTarget(1);
  target.cardSnapshot = { ...base, spark: 40, energyCost: 9 };
  const copy: DeckEntry = { entryId: parseDeckEntryId("minted-copy"), cardNumber: 1, transfiguration: "Kindled", isBane: false,
    sparkBonus: 1, keywordModification: { fast: true, energyCostReduction: 1 }, statOverride: { energyCost: 0 } };
  const runtime: FourSuitRepriseSiteRuntime = {
    kind: "gamble", gameId: "four-suit-reprise", selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
    isFarpoint: false, drawCost: 25, shuffleCommitments: [parseShuffleCommitment("copy-round")],
    committedCards: [{ rank: "4", suit: "hearts" }], targets: [target], phase: "result",
    rounds: [{ roundNumber: 1, shuffleCommitment: parseShuffleCommitment("copy-round"), card: { rank: "4", suit: "hearts" },
      targetEntryId: target.entryId, targetCardId: target.cardId, costPaid: 25, outcome: "duplication",
      resultRevealed: true, resultSettled: true, essenceGained: 0, duplicatedEntryId: copy.entryId }],
  };
  const state = { ...testJourneyState(), deck: [
    { entryId: target.entryId, cardNumber: 1, transfiguration: null, isBane: false, sparkBonus: 38 },
    { entryId: parseDeckEntryId("old-same-printing"), cardNumber: 1, transfiguration: null, isBane: false, sparkBonus: 17 }, copy,
  ], siteRuntime: { [GAMBLE_SITE.id]: runtime } };
  const params = Object.assign({ state, scene: null, site: GAMBLE_SITE, guide: GUIDE, guideLine: GUIDE_LINE }, { cardDatabase: new Map([[1, base], [2, fourSuitCard(2)]]) });
  return { params, state, target, copy, runtime };
}

describe("gamble-site-view-model — Four-Suit Reprise", () => {
  it("projects only the exact minted copy from canonical data and survives a saved round-trip", () => {
    const { params, target, copy } = copiedScenario();
    const view = buildGambleSiteView(params);
    expect(view?.gameId).toBe("four-suit-reprise");
    if (view?.gameId !== "four-suit-reprise") throw new Error("Missing Four-Suit view");
    expect(view.result).toMatchObject({ copy: { entryId: copy.entryId, cardId: target.cardId,
      model: { cardId: target.cardId, displaySnapshot: { spark: 5, energyCost: 0, isFast: true }, transfiguration: { type: "Kindled" } } } });
    expect(view.result?.target.model.displaySnapshot).toEqual(target.cardSnapshot);
    expect(buildGambleSiteView({ ...params, state: JSON.parse(JSON.stringify(params.state)) as typeof params.state })).toEqual(view);
    const purged = { ...params, state: { ...params.state, deck: params.state.deck.filter((e) => e.entryId !== copy.entryId) } };
    const purgedView = buildGambleSiteView(purged);
    if (purgedView?.gameId !== "four-suit-reprise") throw new Error("Missing purged Four-Suit view");
    expect(purgedView.result).toMatchObject({ copy: null });
  });
  it.each(["omitted", "missing", "wrong-card", "same-entry", "wrong-uuid", "missing-lookup"])("keeps the original result without a phantom copy for %s receipt", (kind) => {
    const { params, state, runtime, target, copy } = copiedScenario();
    const latest = runtime.rounds[0];
    const next = { ...state, deck: state.deck.map((e) => e.entryId === copy.entryId && kind === "wrong-card" ? { ...e, cardNumber: 2 } : e),
      siteRuntime: { [GAMBLE_SITE.id]: { ...runtime, rounds: [{ ...latest,
        duplicatedEntryId: kind === "omitted" ? undefined : kind === "missing" ? parseDeckEntryId("gone") : kind === "same-entry" ? target.entryId : copy.entryId }] } } };
    const cardDatabase = kind === "missing-lookup" ? undefined : kind === "wrong-uuid"
      ? new Map([[1, { ...fourSuitCard(1), id: fourSuitCard(2).id }]]) : params.cardDatabase;
    const view = buildGambleSiteView({ ...params, state: next, cardDatabase });
    if (view?.gameId !== "four-suit-reprise") throw new Error("Missing guarded Four-Suit view");
    expect(view.result).toMatchObject({ copy: null, outcome: "duplication", resultSettled: true });
  });

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
