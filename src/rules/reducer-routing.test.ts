import { testEventActor } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import type { GameEvent, Genesis } from "../eventlog/types";
import { foldEvents } from "../eventlog/fold";
import { hashState } from "../eventlog/hash";
import { genesisFoldState } from "./fold-state";
import { GAME_ENGINE_CONFIG } from "./replay/replay";
import { reduceGameEvent } from "./reducer";
import { testFoldHash } from "../types/test-identities";
import { GENESIS, foldStateWithEssence, ctx, event, adjustEssence } from "./reducer-fixtures";


// ---------------------------------------------------------------------------
// Rule 5 — routing / garbage tolerance
// ---------------------------------------------------------------------------

describe("rule 5 — routing and garbage tolerance", () => {
  it("bounces an unknown event type without throwing", () => {
    const state = foldStateWithEssence(100);
    const garbage = {
      type: "NOT_A_REAL_TYPE",
      payload: null as unknown as Record<string, unknown>,
      actor: testEventActor("alice"),
      clientTimestamp: "x",
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
    expect(result.state.journey.essence).toBe(100);
  });
});


// ---------------------------------------------------------------------------
// ADJUST_ESSENCE domain math / clamp
// ---------------------------------------------------------------------------

describe("ADJUST_ESSENCE domain case", () => {
  it("applies a positive delta", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(state, adjustEssence(50), ctx());
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(150);
  });

  it("never leaves the non-negative range across a delta sweep", () => {
    for (const start of [0, 100, 250, 500]) {
      for (const delta of [-1000, -250, -1, 0, 1, 250, 1000]) {
        const state = foldStateWithEssence(start);
        const result = reduceGameEvent(state, adjustEssence(delta), ctx());
        expect(result.state.journey.essence).toBeGreaterThanOrEqual(0);
        expect(result.state.journey.essence).toBe(Math.max(0, start + delta));
      }
    }
  });

  it("does not mutate the input state (returns a new object)", () => {
    const state = foldStateWithEssence(100);
    const result = reduceGameEvent(state, adjustEssence(10), ctx());
    expect(state.journey.essence).toBe(100);
    expect(result.state).not.toBe(state);
  });
});


describe("genesisFoldState", () => {
  it("produces a null battle and a journey state seeded from genesis", () => {
    const fold = genesisFoldState(GENESIS);
    expect(fold.battle).toBeNull();
    expect(fold.journey.seed).toBe(GENESIS.seed);
    expect(typeof fold.journey.essence).toBe("number");
  });

  it("uses economy defaults pinned in genesis", () => {
    const fold = genesisFoldState({
      ...GENESIS,
      contentConfig: {
        poolVariant: "tides4",
        economyFoldHash: testFoldHash("synthetic-economy"),
        defaultStartingEssence: 137,
        dreamsignCap: 9,
      },
    });

    expect(fold.journey.essence).toBe(137);
    expect(fold.journey.maxDreamsigns).toBe(9);
  });

  it("folds the same economy config, seed, and events to the same state hash", () => {
    const genesis: Genesis = {
      ...GENESIS,
      contentConfig: {
        poolVariant: "tides4",
        atlasFoldHash: testFoldHash("synthetic-atlas"),
        economyFoldHash: testFoldHash("synthetic-economy"),
        defaultStartingEssence: 137,
        dreamsignCap: 9,
      },
    };
    const base = { seq: 0, state: genesisFoldState(genesis) };
    const events = [{ seq: 1, event: adjustEssence(7) }];

    const first = foldEvents(GAME_ENGINE_CONFIG, genesis, base, events, {
      devMode: true,
    });
    const second = foldEvents(GAME_ENGINE_CONFIG, genesis, base, events, {
      devMode: true,
    });

    expect(hashState(first.state)).toBe(hashState(second.state));
  });
});
