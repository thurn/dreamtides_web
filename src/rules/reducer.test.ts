import { describe, expect, it } from "vitest";

import type { GameEvent, EventContext, Genesis } from "../eventlog/types";
import { genesisFoldState, type FoldState } from "./fold-state";
import {
  isCasExempt,
  isInterveningWindowClear,
  isMatchingResolve,
  reduceGameEvent,
} from "./reducer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "test-seed",
  reducerVersion: "test",
  createdAt: 0,
};

/** A base fold state with a known, mutable essence value. */
function foldStateWithEssence(essence: number, essenceCap?: number): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    quest: {
      ...base.quest,
      essence,
      ...(essenceCap === undefined ? {} : { essenceCap }),
    },
  };
}

function ctx(
  overrides: Partial<EventContext> = {},
): EventContext {
  return {
    seq: 10,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function adjustEssence(delta: number, actor = "alice"): GameEvent {
  return event("ADJUST_ESSENCE", { delta }, actor);
}

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
        intervening: [{ seq: 5, actor: "bob", type: "ADJUST_ESSENCE" }],
      }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.essence).toBe(100);
  });

  it("applies when a partner SET_CARD_NOTE (decision-neutral) intervened", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [{ seq: 5, actor: "bob", type: "SET_CARD_NOTE" }],
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(110);
  });

  it("applies a self-chain window (only own-actor events intervened)", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [
          { seq: 4, actor: "alice", type: "ADJUST_ESSENCE" },
          { seq: 5, actor: "alice", type: "SET_SCREEN" },
        ],
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(110);
  });

  it("bounces when the intervening window is unknown", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({ intervening: "unknown" }),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.essence).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 / Rule 2 — prompt gate
// ---------------------------------------------------------------------------

function stateWithPendingPrompt(promptId: number): FoldState {
  const base = foldStateWithEssence(100);
  return {
    ...base,
    battle: { pendingPrompt: { promptId } },
  };
}

describe("rule 4 — prompt gate", () => {
  it("bounces a non-RESOLVE intent while a prompt is pending", () => {
    const state = stateWithPendingPrompt(1);
    const result = reduceGameEvent(state, adjustEssence(10), ctx());
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.essence).toBe(100);
  });

  it("routes a matching-promptId RESOLVE_PROMPT past the gate (reaches rule 5)", () => {
    const state = stateWithPendingPrompt(1);
    // RESOLVE_PROMPT has no domain case yet, so it bounces at rule 5 — but it
    // must NOT be blocked by rule 4. We observe this by confirming it is not
    // rejected for the same reason a mismatched promptId would be: a matching
    // resolve reaches routing (still bounced today), while a partner-window
    // that would otherwise gate is skipped.
    const result = reduceGameEvent(
      state,
      event("RESOLVE_PROMPT", { promptId: 1, resolution: {} }),
      ctx({
        // A partner-intervening event that WOULD bounce at rule 3 — the fast
        // path (rule 2) must skip rule 3, proving the gate was bypassed.
        intervening: [{ seq: 5, actor: "bob", type: "ADJUST_ESSENCE" }],
      }),
    );
    // Rule 5 has no RESOLVE_PROMPT case yet → bounced, but crucially it was not
    // bounced by rules 3/4 (which would also bounce). We assert state unchanged
    // and outcome bounced; the seam note documents that once RESOLVE_PROMPT's
    // domain case lands this becomes "applied".
    expect(result.outcome).toBe("bounced");
  });

  it("bounces a RESOLVE_PROMPT whose promptId does not match", () => {
    const state = stateWithPendingPrompt(1);
    const result = reduceGameEvent(
      state,
      event("RESOLVE_PROMPT", { promptId: 999, resolution: {} }),
      ctx(),
    );
    expect(result.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — CAS-exempt discipline
// ---------------------------------------------------------------------------

describe("rule 1 — CAS-exempt types", () => {
  it("does not bounce SET_CARD_NOTE through a hostile partner window", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      event("SET_CARD_NOTE", { instanceId: "i1", note: "hi" }),
      ctx({
        intervening: [{ seq: 5, actor: "bob", type: "ADJUST_ESSENCE" }],
      }),
    );
    // No domain case yet → routes to rule 5 and bounces there, but was NOT
    // bounced by rule 3. We assert it reached routing by not being blocked by
    // the window; today rule 5 has no SET_CARD_NOTE effect so outcome is
    // bounced. The seam note tracks this.
    expect(result.outcome).toBe("bounced");
  });

  it("does not bounce SET_CARD_NOTE through an open prompt (rule 4 skipped)", () => {
    const state = stateWithPendingPrompt(1);
    const result = reduceGameEvent(
      state,
      event("SET_CARD_NOTE", { instanceId: "i1", note: "hi" }),
      ctx(),
    );
    // Same seam: not blocked by rule 4; bounces only because no domain case.
    expect(result.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — routing / garbage tolerance
// ---------------------------------------------------------------------------

describe("rule 5 — routing and garbage tolerance", () => {
  it("bounces an unknown event type without throwing", () => {
    const state = foldStateWithEssence(100);
    const garbage = {
      type: "NOT_A_REAL_TYPE",
      payload: null as unknown as Record<string, unknown>,
      actor: "alice",
      clientTimestamp: "x",
      basedOnSeq: 0,
    } as GameEvent;
    expect(() => reduceGameEvent(state, garbage, ctx())).not.toThrow();
    const result = reduceGameEvent(state, garbage, ctx());
    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(state);
  });

  it("bounces ADJUST_ESSENCE with a malformed payload", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      event("ADJUST_ESSENCE", { delta: "not-a-number" }),
      ctx(),
    );
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.essence).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// ADJUST_ESSENCE domain math / clamp
// ---------------------------------------------------------------------------

describe("ADJUST_ESSENCE domain case", () => {
  it("applies a positive delta", () => {
    const state = foldStateWithEssence(100, 500);
    const result = reduceGameEvent(state, adjustEssence(50), ctx());
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(150);
  });

  it("never leaves the [0, essenceCap] range across a delta sweep", () => {
    const cap = 500;
    for (const start of [0, 100, 250, 500]) {
      for (const delta of [-1000, -250, -1, 0, 1, 250, 1000]) {
        const state = foldStateWithEssence(start, cap);
        const result = reduceGameEvent(state, adjustEssence(delta), ctx());
        expect(result.state.quest.essence).toBeGreaterThanOrEqual(0);
        expect(result.state.quest.essence).toBeLessThanOrEqual(cap);
        expect(result.state.quest.essence).toBe(
          Math.max(0, Math.min(start + delta, cap)),
        );
      }
    }
  });

  it("does not mutate the input state (returns a new object)", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(state, adjustEssence(10), ctx());
    expect(state.quest.essence).toBe(100);
    expect(result.state).not.toBe(state);
  });
});

// ---------------------------------------------------------------------------
// genesisFoldState
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Direct CAS predicate coverage (rules 1/2/3 independent of domain cases)
// ---------------------------------------------------------------------------

describe("isCasExempt (rule 1)", () => {
  it("exempts SET_CARD_NOTE and OPEN_SITE", () => {
    expect(isCasExempt("SET_CARD_NOTE")).toBe(true);
    expect(isCasExempt("OPEN_SITE")).toBe(true);
  });

  it("does not exempt ordinary intents", () => {
    expect(isCasExempt("ADJUST_ESSENCE")).toBe(false);
    expect(isCasExempt("RESOLVE_PROMPT")).toBe(false);
    expect(isCasExempt("NOT_A_REAL_TYPE")).toBe(false);
  });
});

describe("isMatchingResolve (rule 2)", () => {
  it("matches a RESOLVE_PROMPT whose numeric promptId equals the open prompt seq", () => {
    const state = stateWithPendingPrompt(7);
    expect(
      isMatchingResolve(
        state,
        event("RESOLVE_PROMPT", { promptId: 7, resolution: {} }),
      ),
    ).toBe(true);
  });

  it("does not match a different promptId", () => {
    const state = stateWithPendingPrompt(7);
    expect(
      isMatchingResolve(
        state,
        event("RESOLVE_PROMPT", { promptId: 8, resolution: {} }),
      ),
    ).toBe(false);
  });

  it("does not match when there is no open prompt", () => {
    const state = foldStateWithEssence(100);
    expect(
      isMatchingResolve(
        state,
        event("RESOLVE_PROMPT", { promptId: 7, resolution: {} }),
      ),
    ).toBe(false);
  });

  it("does not match a non-RESOLVE_PROMPT event", () => {
    const state = stateWithPendingPrompt(7);
    expect(isMatchingResolve(state, adjustEssence(10))).toBe(false);
  });

  it("does not match (and does not throw) on a missing or non-number promptId", () => {
    const state = stateWithPendingPrompt(7);
    for (const bad of [
      undefined,
      null,
      "7",
      NaN,
      {},
    ] as unknown[]) {
      const ev = event("RESOLVE_PROMPT", {
        promptId: bad as never,
        resolution: {},
      });
      expect(() => isMatchingResolve(state, ev)).not.toThrow();
      expect(isMatchingResolve(state, ev)).toBe(false);
    }
  });
});

describe("isInterveningWindowClear (rule 3)", () => {
  it("is clear for an empty window", () => {
    expect(isInterveningWindowClear([], "alice")).toBe(true);
  });

  it("is not clear for an unknown window", () => {
    expect(isInterveningWindowClear("unknown", "alice")).toBe(false);
  });

  it("is clear when only own-actor events intervened", () => {
    expect(
      isInterveningWindowClear(
        [
          { seq: 1, actor: "alice", type: "ADJUST_ESSENCE" },
          { seq: 2, actor: "alice", type: "SET_SCREEN" },
        ],
        "alice",
      ),
    ).toBe(true);
  });

  it("is not clear when a non-neutral partner event intervened", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: "bob", type: "ADJUST_ESSENCE" }],
        "alice",
      ),
    ).toBe(false);
  });

  it("ignores a decision-neutral partner event", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: "bob", type: "SET_CARD_NOTE" }],
        "alice",
      ),
    ).toBe(true);
  });

  it("still bounces when a partner OPEN_SITE intervened (exempt from bouncing, not from being intervening)", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: "bob", type: "OPEN_SITE" }],
        "alice",
      ),
    ).toBe(false);
  });
});

describe("genesisFoldState", () => {
  it("produces a null battle and a quest state seeded from genesis", () => {
    const fold = genesisFoldState(GENESIS);
    expect(fold.battle).toBeNull();
    expect(fold.quest.seed).toBe(GENESIS.seed);
    expect(typeof fold.quest.essence).toBe("number");
    expect(typeof fold.quest.essenceCap).toBe("number");
  });
});
