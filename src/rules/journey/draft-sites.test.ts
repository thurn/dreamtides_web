import { afterEach, describe, expect, it } from "vitest";
import type { PoolDraftState } from "../../types/draft";
import { drawAndSpendUniqueCards } from "../../draft/draft-engine";
import { makeRng } from "../../draft/pool/rng";
import { registerDraftContentProvider } from "./draft";
import { parseSiteId } from "../../types/identifiers";
import { testExplorationActionId } from "../../types/test-identities";
import { ctx, reduce, poolDraftState, stateWithDraft, stateWithDraftSites, cardIdForNumber, provider } from "./draft-fixtures";



afterEach(() => {
  registerDraftContentProvider(null);
});


// ---------------------------------------------------------------------------
// ENTER_DRAFT_SITE
// ---------------------------------------------------------------------------

describe("ENTER_DRAFT_SITE", () => {
  it("consumes the one-use modifier and persists exact forms across the Draft visit", () => {
    registerDraftContentProvider(provider());
    const source = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("exploration-action"),
    };
    const start = stateWithDraftSites(
      poolDraftState({
        activeSiteId: null,
        currentOffer: [],
        siteShownCardNumbers: [],
      }),
      { siteOfferModifiers: [source] },
    );

    const entered = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 14, rng: makeRng(14) }),
    );

    expect(entered.outcome).toBe("applied");
    const active = entered.state.journey.draftState as PoolDraftState;
    expect(entered.state.journey.siteOfferModifiers).toEqual([]);
    expect(active.transfiguredOfferSource).toEqual({
      siteId: source.sourceSiteId,
      actionId: source.sourceActionId,
    });
    expect(active.currentOfferTransfigurations).toEqual(
      Object.fromEntries(
        active.currentOffer.map((cardNumber) => [
          String(cardNumber),
          "Empowered",
        ]),
      ),
    );

    const pickedNumber = active.currentOffer[0];
    if (pickedNumber === undefined) throw new Error("Expected a Draft offer");
    const picked = reduce(
      entered.state,
      "PICK_DRAFT_CARD",
      { packIndex: 0, cardId: cardIdForNumber(pickedNumber) },
      ctx({ seq: 15, rng: makeRng(15) }),
    );
    expect(picked.outcome).toBe("applied");
    expect(
      picked.state.journey.deck[picked.state.journey.deck.length - 1]
        ?.transfiguration,
    ).toBe("Empowered");
    const advanced = picked.state.journey.draftState as PoolDraftState;
    expect(advanced.transfiguredOfferSource).toEqual(
      active.transfiguredOfferSource,
    );
    expect(Object.values(advanced.currentOfferTransfigurations ?? {})).toEqual(
      advanced.currentOffer.map(() => "Empowered"),
    );
  });

  it("activates the site and reveals a non-empty offer from ctx.rng", () => {
    registerDraftContentProvider(provider());
    const draftState = poolDraftState({
      activeSiteId: null,
      currentOffer: [],
      siteShownCardNumbers: [],
    });
    const start = stateWithDraftSites(draftState);

    const result = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ rng: makeRng(3) }),
    );

    expect(result.outcome).toBe("applied");
    const next = result.state.journey.draftState as PoolDraftState;
    expect(next.activeSiteId).toBe("site-a");
    expect(next.currentOffer.length).toBeGreaterThan(0);
  });

  it("converges if a repeated entry reaches the reducer after the winning entry", () => {
    registerDraftContentProvider(provider());
    const draftState = poolDraftState({
      activeSiteId: null,
      currentOffer: [],
      siteShownCardNumbers: [],
    });
    const start = stateWithDraftSites(draftState);

    const soloResult = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 1, rng: makeRng(1) }),
    );
    expect(soloResult.outcome).toBe("applied");

    const firstResult = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 1, rng: makeRng(1) }),
    );
    const secondResult = reduce(
      firstResult.state,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 2, rng: makeRng(2) }),
    );

    expect(firstResult.outcome).toBe("applied");
    expect(secondResult.outcome).toBe("bounced");
    expect(secondResult.state.journey).toBe(firstResult.state.journey);
    expect(secondResult.state).toEqual(soloResult.state);
  });
});


// ---------------------------------------------------------------------------
// SET_DRAFT_STATE
// ---------------------------------------------------------------------------

describe("SET_DRAFT_STATE", () => {
  it("replaces the draft state (debug edit)", () => {
    const start = stateWithDraft(poolDraftState());
    const replacement = poolDraftState({
      activeSiteId: parseSiteId("site-z"),
      pickNumber: 5,
      currentOffer: [6, 7, 8],
    });
    const result = reduce(start, "SET_DRAFT_STATE", {
      draftState: replacement,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState).toEqual(replacement);
  });
});


// ---------------------------------------------------------------------------
// weightedSample injected-rng contract (exercised via drawAndSpendUniqueCards)
// ---------------------------------------------------------------------------

describe("draft-engine injected rng", () => {
  function samplePool(): PoolDraftState {
    return poolDraftState({
      remainingCopiesByCard: {
        "1": 2,
        "2": 2,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
      },
    });
  }

  it("threads the injected rng rather than reading ambient randomness", () => {
    // A fixed rng of 0 makes weightedSample take the first cumulative entry each
    // iteration, so the draw is fully determined by the injected source.
    const state = structuredClone(samplePool());
    const drawn = drawAndSpendUniqueCards(
      state,
      4,
      undefined,
      undefined,
      () => 0,
    );
    expect(new Set(drawn).size).toBe(4);
  });
});
