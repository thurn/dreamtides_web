import { testEventActor } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import { isCasExempt, isInterveningWindowClear, reduceGameEvent } from "./reducer";
import { foldStateWithEssence, ctx, adjustEssence } from "./reducer-fixtures";



// ---------------------------------------------------------------------------
// Rule 3 — CAS window / self-chain
// ---------------------------------------------------------------------------

describe("rule 3 — compare-and-swap window", () => {
  it("bounces when an applied partner event (non-neutral) intervened", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [{ seq: 5, actor: testEventActor("bob"), type: "ADJUST_ESSENCE" }],
      }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.bounceReason).toBe("partner_conflict");
    expect(result.state.journey.essence).toBe(100);
  });

  it("applies when a partner SET_CARD_SOURCE_DEBUG (decision-neutral) intervened", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [{ seq: 5, actor: testEventActor("bob"), type: "SET_CARD_SOURCE_DEBUG" }],
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(110);
  });

  it("applies when a partner DISMISS_STARTING_DECK_POPUP (decision-neutral) intervened", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [
          { seq: 5, actor: testEventActor("bob"), type: "DISMISS_STARTING_DECK_POPUP" },
        ],
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(110);
  });

  it("applies a self-chain window (only own-actor events intervened)", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [
          { seq: 4, actor: testEventActor("alice"), type: "ADJUST_ESSENCE" },
          { seq: 5, actor: testEventActor("alice"), type: "ENTER_SITE" },
        ],
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(110);
  });

  it("bounces when the intervening window is unknown", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({ intervening: "unknown" }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.bounceReason).toBe("unknown_conflict");
    expect(result.state.journey.essence).toBe(100);
  });
});


// ---------------------------------------------------------------------------
// genesisFoldState
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Direct CAS predicate coverage (rules 1/2/3 independent of domain cases)
// ---------------------------------------------------------------------------

describe("isCasExempt (rule 1)", () => {
  it("exempts presentation and site-bootstrap events", () => {
    expect(isCasExempt("SET_CARD_SOURCE_DEBUG")).toBe(true);
    expect(isCasExempt("OPEN_SITE")).toBe(true);
    expect(isCasExempt("ENTER_DRAFT_SITE")).toBe(true);
  });

  it("does not exempt ordinary intents", () => {
    expect(isCasExempt("ADJUST_ESSENCE")).toBe(false);
    expect(isCasExempt("NOT_A_REAL_TYPE")).toBe(false);
  });
});


describe("isInterveningWindowClear (rule 3)", () => {
  it("is clear for an empty window", () => {
    expect(isInterveningWindowClear([], testEventActor("alice"))).toBe(true);
  });

  it("is not clear for an unknown window", () => {
    expect(isInterveningWindowClear("unknown", testEventActor("alice"))).toBe(false);
  });

  it("is clear when only own-actor events intervened", () => {
    expect(
      isInterveningWindowClear(
        [
          { seq: 1, actor: testEventActor("alice"), type: "ADJUST_ESSENCE" },
          { seq: 2, actor: testEventActor("alice"), type: "ENTER_SITE" },
        ],
        testEventActor("alice"),
      ),
    ).toBe(true);
  });

  it("is not clear when a non-neutral partner event intervened", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: testEventActor("bob"), type: "ADJUST_ESSENCE" }],
        testEventActor("alice"),
      ),
    ).toBe(false);
  });

  it("ignores a decision-neutral partner event", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: testEventActor("bob"), type: "SET_CARD_SOURCE_DEBUG" }],
        testEventActor("alice"),
      ),
    ).toBe(true);
  });

  it("ignores a decision-neutral starting-deck dismissal", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 2, actor: testEventActor("bob"), type: "DISMISS_STARTING_DECK_POPUP" }],
        testEventActor("alice"),
      ),
    ).toBe(true);
  });

  it("ignores a partner OPEN_SITE bootstrap", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: testEventActor("bob"), type: "OPEN_SITE" }],
        testEventActor("alice"),
      ),
    ).toBe(true);
  });

  it("ignores a partner ENTER_DRAFT_SITE bootstrap", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: testEventActor("bob"), type: "ENTER_DRAFT_SITE" }],
        testEventActor("alice"),
      ),
    ).toBe(true);
  });

  it("ignores client presentation provenance", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: testEventActor("bob"), type: "SET_CARD_SOURCE_DEBUG" }],
        testEventActor("alice"),
      ),
    ).toBe(true);
  });
});
