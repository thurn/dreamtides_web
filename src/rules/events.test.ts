// Registry-tie coverage (audit finding P3-5): `EventPayloads`, `GameEventType`,
// and `KNOWN_EVENT_TYPES` are tied at COMPILE time in events.ts (the
// `KNOWN_EVENT_TYPES_AS_OBJECT: Record<GameEventType, true>` literal plus its
// `_exhaustive` assignment fail to typecheck on drift), and `routeDomain`'s
// switch in reducer.ts is tied to `GameEventType` the same way (its `default`
// arm assigns the narrowed type to `never`). Together those two compile-time
// checks guarantee every `EventPayloads` key has exactly one `routeDomain`
// case. This suite is the RUNTIME companion: it drives every declared
// `KNOWN_EVENT_TYPES` member through `routeDomain` and asserts it resolves to
// a well-formed outcome without throwing — a regression net for a case body
// that would crash on an empty payload, independent of the type-level proof.

import { describe, expect, it } from "vitest";
import type { EventContext, GameEvent } from "../eventlog/types";
import { genesisFoldState } from "./fold-state";
import { routeDomain } from "./reducer";
import { INTENTIONALLY_UNROUTED_EVENT_TYPES, KNOWN_EVENT_TYPES } from "./events";

const GENESIS = {
  seed: "events-registry-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" },
};

const CTX: EventContext = {
  seq: 1,
  rng: () => 0,
  intervening: [],
  timestamp: "1970-01-01T00:00:00.000Z",
};

function event(type: string): GameEvent {
  return {
    type,
    payload: {},
    actor: "alice",
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

describe("KNOWN_EVENT_TYPES registry tie", () => {
  it("routes every non-exempt member through routeDomain without throwing", () => {
    const state = genesisFoldState(GENESIS);
    for (const type of KNOWN_EVENT_TYPES) {
      if (INTENTIONALLY_UNROUTED_EVENT_TYPES.has(type)) {
        continue;
      }
      expect(() => routeDomain(state, event(type), CTX), type).not.toThrow();
      const result = routeDomain(state, event(type), CTX);
      expect(["applied", "bounced"], type).toContain(result.outcome);
    }
  });

  it("bounces an event whose type is not in the registry (the default arm)", () => {
    const state = genesisFoldState(GENESIS);
    const result = routeDomain(state, event("__NOT_A_REAL_EVENT_TYPE__"), CTX);
    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(state);
  });
});
