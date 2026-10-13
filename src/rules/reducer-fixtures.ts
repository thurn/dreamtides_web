import { testJourneySeed } from "../types/test-identities";
import { testEventActor } from "../types/test-identities";
import type { GameEvent, EventContext, Genesis } from "../eventlog/types";
import { genesisFoldState, type FoldState } from "./fold-state";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";



// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const GENESIS: Genesis = {
  seed: testJourneySeed("test-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};


/** A base fold state with a known, mutable essence value. */
export function foldStateWithEssence(essence: number): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      essence,
    },
  };
}


export function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 10,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}


export function event(
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor: testEventActor(actor),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}


export function adjustEssence(delta: number, actor = "alice"): GameEvent {
  return event("ADJUST_ESSENCE", { delta }, actor);
}


// ---------------------------------------------------------------------------
