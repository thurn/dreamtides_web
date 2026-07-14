import { describe, expect, it } from "vitest";

import type { GameEvent, EventContext, Genesis } from "../eventlog/types";
import { foldEvents } from "../eventlog/fold";
import type {
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
} from "../battle/types";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../battle/test-support";
import { genesisFoldState, type FoldState } from "./fold-state";
import { GAME_ENGINE_CONFIG } from "./replay/replay";
import { registerQuestLifecycleContentProvider } from "./quest/lifecycle";
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
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" },
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
    expect(result.bounceReason).toBe("partner_conflict");
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

  it("applies when a partner MARK_SITE_VISITED (decision-neutral) intervened", () => {
    // An already-visited MARK_SITE_VISITED applies as an idempotent no-op, so it
    // must not bounce an unrelated partner's concurrent ADJUST_ESSENCE.
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [{ seq: 5, actor: "bob", type: "MARK_SITE_VISITED" }],
      }),
    );
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(110);
  });

  it("applies when a partner DISMISS_STARTING_DECK_POPUP (decision-neutral) intervened", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(
      state,
      adjustEssence(10, "alice"),
      ctx({
        intervening: [
          { seq: 5, actor: "bob", type: "DISMISS_STARTING_DECK_POPUP" },
        ],
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
    expect(result.bounceReason).toBe("unknown_conflict");
    expect(result.state.quest.essence).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 / Rule 2 — prompt gate
// ---------------------------------------------------------------------------

function stateWithPendingPrompt(promptId: number): FoldState {
  const base = foldStateWithEssence(100);
  // The CAS policy reads only `battle.pendingPrompt.promptId`; the board is
  // cast because these tests never touch it (battle-fold construction is
  // exercised by driver.test.ts).
  const battle = {
    board: {},
    effectQueue: [],
    pendingPrompt: {
      promptId,
      run: { scriptRef: { table: "dreamwell", id: "" }, cursor: [0], side: "player" },
      kind: "foresee",
      options: { kind: "foresee", count: 0 },
    },
  } as unknown as NonNullable<FoldState["battle"]>;
  return { ...base, battle };
}

// A note payload matching the `{ noteId, text, expiry }` shape SET_CARD_NOTE
// stores (the shape the battle note editor writes).
const NOTE_PAYLOAD = {
  noteId: "n1",
  text: "hi",
  expiry: { kind: "manual" },
};

function makeBattleSide(): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  } as BattleMutableState["sides"][BattleSide];
}

function makeCardInstance(battleCardId: string): BattleCardInstance {
  return {
    battleCardId,
    definition: {
      sourceDeckEntryId: null,
      cardId: "card-uuid",
      cardNumber: 0,
      name: "Fixture Card",
      battleCardKind: "character",
      subtype: "Unit",
      energyCost: 0,
      printedEnergyCost: 0,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 0,
      transfiguration: null,
      isBane: false,
    },
    owner: "player",
    controller: "player",
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: {
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedUnstoppable: false,
      grantedVengeful: false,
      grantedPreeminence: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

/**
 * A fold state inside a battle with one real card instance (`cardId`), and
 * optionally an open prompt. SET_CARD_NOTE needs a live card to annotate, so
 * the CAS-exempt seam tests use this rather than the board-less fixtures above.
 */
function stateWithBattleCard(cardId: string, promptId?: number): FoldState {
  const base = foldStateWithEssence(100);
  const board: BattleMutableState = {
    battleId: "b",
    activeSide: "player",
    turnNumber: 3,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: { player: makeBattleSide(), enemy: makeBattleSide() },
    cardInstances: { [cardId]: makeCardInstance(cardId) },
  } as BattleMutableState;
  const battle = {
    init: {} as never,
    board,
    effectQueue: [],
    pendingPrompt:
      promptId === undefined
        ? null
        : {
            promptId,
            run: { scriptRef: { table: "dreamwell", id: "" }, cursor: [0], side: "player" },
            kind: "foresee",
            options: { kind: "foresee", count: 0 },
          },
  } as unknown as NonNullable<FoldState["battle"]>;
  return { ...base, battle };
}

describe("rule 4 — prompt gate", () => {
  it("bounces a non-RESOLVE intent while a prompt is pending", () => {
    const state = stateWithPendingPrompt(1);
    const result = reduceGameEvent(state, adjustEssence(10), ctx());
    expect(result.outcome).toBe("bounced");
    expect(result.bounceReason).toBe("prompt_pending");
    expect(result.state.quest.essence).toBe(100);
  });

  it("applies a matching-promptId RESOLVE_PROMPT past the CAS gate (rule 2 fast path)", () => {
    const state = stateWithPendingPrompt(1);
    const result = reduceGameEvent(
      state,
      event("RESOLVE_PROMPT", { promptId: 1, resolution: { kind: "foresee" } }),
      ctx({
        // A partner-intervening event that WOULD bounce at rule 3 — the fast
        // path (rule 2) skips rules 3–4, so the matching resolve still applies.
        intervening: [{ seq: 5, actor: "bob", type: "ADJUST_ESSENCE" }],
      }),
    );
    // The domain case resolves the open prompt and clears it.
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.pendingPrompt).toBeNull();
  });

  it("bounces a RESOLVE_PROMPT whose promptId does not match, leaving the prompt open", () => {
    const state = stateWithPendingPrompt(1);
    const result = reduceGameEvent(
      state,
      event("RESOLVE_PROMPT", { promptId: 999, resolution: { kind: "foresee" } }),
      ctx(),
    );
    // A stale/mismatched promptId is gated by rule 4 (a pending prompt bounces
    // any non-matching intent) and never reaches the domain case.
    expect(result.outcome).toBe("bounced");
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — CAS-exempt discipline
// ---------------------------------------------------------------------------

describe("rule 1 — CAS-exempt types", () => {
  it("applies SET_CARD_NOTE through a hostile partner window", () => {
    const state = stateWithBattleCard("i1");
    const result = reduceGameEvent(
      state,
      event("SET_CARD_NOTE", { instanceId: "i1", note: NOTE_PAYLOAD }),
      ctx({
        intervening: [{ seq: 5, actor: "bob", type: "ADJUST_ESSENCE" }],
      }),
    );
    // CAS-exempt (rule 1): skips rules 2–4, so the hostile partner window never
    // gates it. The domain case stores the note on the card.
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.cardInstances["i1"].notes).toHaveLength(1);
  });

  it("applies SET_CARD_NOTE through an open prompt (rule 4 skipped)", () => {
    const state = stateWithBattleCard("i1", 1);
    const result = reduceGameEvent(
      state,
      event("SET_CARD_NOTE", { instanceId: "i1", note: NOTE_PAYLOAD }),
      ctx(),
    );
    // CAS-exempt: applies even while a prompt is open, and leaves it intact.
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.board.cardInstances["i1"].notes).toHaveLength(1);
    expect(result.state.battle?.pendingPrompt?.promptId).toBe(1);
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
    expect(result.bounceReason).toBe("invalid_action");
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
    expect(result.bounceReason).toBe("invalid_action");
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
  it("exempts presentation and site-bootstrap events", () => {
    expect(isCasExempt("SET_CARD_NOTE")).toBe(true);
    expect(isCasExempt("SET_CARD_SOURCE_DEBUG")).toBe(true);
    expect(isCasExempt("OPEN_SITE")).toBe(true);
    expect(isCasExempt("ENTER_DRAFT_SITE")).toBe(true);
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

  it("ignores decision-neutral idempotent no-op events (MARK_SITE_VISITED / DISMISS_STARTING_DECK_POPUP)", () => {
    expect(
      isInterveningWindowClear(
        [
          { seq: 1, actor: "bob", type: "MARK_SITE_VISITED" },
          { seq: 2, actor: "bob", type: "DISMISS_STARTING_DECK_POPUP" },
        ],
        "alice",
      ),
    ).toBe(true);
  });

  it("ignores a partner OPEN_SITE bootstrap", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: "bob", type: "OPEN_SITE" }],
        "alice",
      ),
    ).toBe(true);
  });

  it("ignores a partner ENTER_DRAFT_SITE bootstrap", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: "bob", type: "ENTER_DRAFT_SITE" }],
        "alice",
      ),
    ).toBe(true);
  });

  it("ignores client presentation provenance", () => {
    expect(
      isInterveningWindowClear(
        [{ seq: 1, actor: "bob", type: "SET_CARD_SOURCE_DEBUG" }],
        "alice",
      ),
    ).toBe(true);
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

// ---------------------------------------------------------------------------
// Reducer containment (P1-1) — a programmer-error throw from a domain case is
// NOT swallowed by the reducer; it propagates to the engine's fold containment.
// ---------------------------------------------------------------------------

describe("reducer containment at the foldEvents layer", () => {
  it("a throwing domain case propagates in dev fold mode and becomes fold_error in prod fold mode", () => {
    // A lifecycle provider whose START_QUEST assembly THROWS — a stand-in for a
    // programmer error deep inside a domain case (the reducer never swallows it).
    registerQuestLifecycleContentProvider({
      resolveDreamcallerPackage: () => {
        throw new Error("resolveDreamcallerPackage exploded");
      },
      startQuest: () => {
        throw new Error("startQuest exploded");
      },
    });
    try {
      const state = genesisFoldState(GENESIS);
      const batch = [
        { seq: 1, event: event("START_QUEST", { dreamcallerId: "dc-x" }) },
      ];
      const base = { seq: 0, state };

      // Dev fold mode: the programmer error surfaces at its origin.
      expect(() =>
        foldEvents(GAME_ENGINE_CONFIG, GENESIS, base, batch, { devMode: true }),
      ).toThrow(/startQuest exploded/);

      // Prod fold mode: contained as a bounce plus a loud error report; the
      // pre-event state is untouched (no partial application).
      const result = foldEvents(GAME_ENGINE_CONFIG, GENESIS, base, batch, {
        devMode: false,
      });
      expect(result.outcomes[0].outcome).toBe("bounced");
      expect(result.outcomes[0].error).toBeDefined();
      expect(result.state).toBe(state);
    } finally {
      registerQuestLifecycleContentProvider(null);
    }
  });
});

// ---------------------------------------------------------------------------
// RESOLVE_PROMPT single sanctioned catch (P1-2) — a throw while resolving the
// open prompt clears it (applied) instead of wedging the room forever.
// ---------------------------------------------------------------------------

/**
 * A battle fold state parked on an open prompt whose run cursor descends
 * through a non-existent branch (`[0, 0]` into an empty script), so
 * `resolvePendingPrompt` THROWS when the matching resolve reaches it.
 */
function stateWithPoisonedPrompt(promptId: number): FoldState {
  const base = foldStateWithEssence(100);
  const board: BattleMutableState = {
    battleId: "b",
    activeSide: "player",
    turnNumber: 3,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: { player: makeBattleSide(), enemy: makeBattleSide() },
    cardInstances: {},
  } as BattleMutableState;
  const run = { scriptRef: { table: "dreamwell", id: "" }, cursor: [0, 0], side: "player" };
  const battle = {
    init: {} as never,
    board,
    // A queued run present so the fallback's queue-clear is observable.
    effectQueue: [run],
    pendingPrompt: {
      promptId,
      run,
      kind: "foresee",
      options: { kind: "foresee", count: 0 },
    },
  } as unknown as NonNullable<FoldState["battle"]>;
  return { ...base, battle };
}

describe("RESOLVE_PROMPT throw containment", () => {
  it("a throw while resolving the open prompt clears the prompt instead of wedging", () => {
    const state = stateWithPoisonedPrompt(1);
    const result = reduceGameEvent(
      state,
      event("RESOLVE_PROMPT", { promptId: 1, resolution: { kind: "foresee" } }),
      ctx(),
    );
    // The resolve applied its containment fallback: the prompt is cleared and
    // the queued automation dropped, so the room is never wedged open.
    expect(result.outcome).toBe("applied");
    expect(result.state.battle?.pendingPrompt).toBeNull();
    expect(result.state.battle?.effectQueue).toEqual([]);
  });
});
