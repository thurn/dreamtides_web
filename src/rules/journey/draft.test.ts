import { afterEach, describe, expect, it } from "vitest";
import type { PoolDraftState } from "../../types/draft";
import { makeRng } from "../../draft/pool/rng";
import { type FoldState } from "../fold-state";
import { currentCardTutorialScreenKey } from "../card-tutorial-guidance";
import { registerDraftContentProvider } from "./draft";
import { parseJourneyId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parsePresentationId } from "../../types/identifiers";
import { testTutorialTriggerId } from "../../types/test-identities";
import { ctx, reduce, poolDraftState, NODE_ID, makeSite, makeNode, stateWithDraftSites, cardIdForNumber, provider } from "./draft-fixtures";



afterEach(() => {
  registerDraftContentProvider(null);
});


// ---------------------------------------------------------------------------
// PICK_DRAFT_CARD
// ---------------------------------------------------------------------------

describe("PICK_DRAFT_CARD", () => {
  it("applies a pick that matches the pack position, advancing the draft", () => {
    registerDraftContentProvider(provider());
    const result = reduce(
      stateWithDraftSites(poolDraftState()),
      "PICK_DRAFT_CARD",
      { packIndex: 0, cardId: cardIdForNumber(1) },
    );

    expect(result.outcome).toBe("applied");
    const draft = result.state.journey.draftState as PoolDraftState;
    // The picked card joined the deck.
    expect(result.state.journey.deck.map((e) => e.cardNumber)).toContain(1);
    // The draft advanced: pick counter incremented and a fresh offer revealed
    // from the remaining {5,6,7,8}, with none of the already-shown 1..4.
    expect(draft.pickNumber).toBe(2);
    expect(draft.sitePicksCompleted).toBe(1);
    for (const cardNumber of draft.currentOffer) {
      expect([1, 2, 3, 4]).not.toContain(cardNumber);
    }
  });

  it("retires guidance with the offer while applying the selected card", () => {
    registerDraftContentProvider(provider());
    const before = stateWithDraftSites(poolDraftState(), {
      runId: parseJourneyId("run-a"),
      hasSeenStartingDeckPopup: true,
      screen: { type: "site", siteId: parseSiteId("site-a") },
      atlas: {
        ...stateWithDraftSites(poolDraftState()).journey.atlas,
        nodes: {
          [NODE_ID]: makeNode([
            makeSite("site-a", "Draft"),
            { ...makeSite("site-b", "Draft"), isVisited: true },
            makeSite("site-battle", "Battle"),
          ]),
        },
      },
    });
    const screenKey = currentCardTutorialScreenKey(before);
    expect(screenKey).not.toBeNull();
    const start: FoldState = {
      ...before,
      cardTutorialPresentation: {
        id: parsePresentationId("card-tutorial:fixture"),
        screenKey: screenKey!,
        cardId: cardIdForNumber(1),
        triggerId: testTutorialTriggerId("support"),
        speaker: "mira",
        text: "Support explained.",
        duration: 4,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
      },
    };

    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: cardIdForNumber(1),
    });

    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState?.pickNumber).toBe(2);
    expect(result.state.cardTutorialPresentation).toBeNull();
  });

  it("bounces a pick for a card entirely absent from the offered pack", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());
    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: cardIdForNumber(8),
    });

    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("is deterministic: same seed + seq fold to identical state", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());
    const context = ctx({ seq: 9, rng: makeRng(9) });

    const a = reduce(
      start,
      "PICK_DRAFT_CARD",
      {
        packIndex: 0,
        cardId: cardIdForNumber(1),
      },
      context,
    );
    const b = reduce(
      start,
      "PICK_DRAFT_CARD",
      {
        packIndex: 0,
        cardId: cardIdForNumber(1),
      },
      ctx({ seq: 9, rng: makeRng(9) }),
    );

    expect(a.outcome).toBe("applied");
    expect(b.outcome).toBe("applied");
    expect(a.state).toEqual(b.state);
  });
});


// ---------------------------------------------------------------------------
// REROLL_DRAFT_OFFER
// ---------------------------------------------------------------------------

describe("REROLL_DRAFT_OFFER", () => {
  it("replaces the active pack without advancing the pick or changing the deck", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());

    const result = reduce(start, "REROLL_DRAFT_OFFER", {
      siteId: parseSiteId("site-a"),
    });

    expect(result.outcome).toBe("applied");
    const draft = result.state.journey.draftState as PoolDraftState;
    expect(draft.pickNumber).toBe(1);
    expect(draft.sitePicksCompleted).toBe(0);
    expect(result.state.journey.deck).toEqual(start.journey.deck);
    expect(draft.currentOffer).toEqual([5, 6, 7, 8]);
    expect(draft.siteShownCardNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
