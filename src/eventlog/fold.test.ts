import { testJourneySeed } from "../types/test-identities";
import { testEventActor } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import { foldEvents } from "./fold";
import { hashState } from "./hash";
import type {
  EngineConfig,
  EventContext,
  Genesis,
  GameEvent,
  ReducerResult,
} from "./types";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";

// A minimal, game-agnostic toy fold state and reducer used to exercise the
// pure fold driver. `n` is a running counter; `log` records applied events in
// order. No src/rules or src/session imports appear here.
interface ToyState {
  n: number;
  log: string[];
}

const GENESIS: Genesis = { seed: testJourneySeed("toy-seed"), reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };

/**
 * Toy reducer:
 * - `ADD {x}` applies, adding `x` to `n` and appending a log line.
 * - `POISON` throws (exercises poison containment).
 * - `BOUNCE_ME` always bounces (state unchanged).
 */
function toyReducer(
  state: ToyState,
  event: GameEvent,
  ctx: EventContext,
): ReducerResult<ToyState> {
  if (event.type === "POISON") {
    throw new Error("poison event exploded");
  }
  if (event.type === "BOUNCE_ME") {
    return { state, outcome: "bounced", bounceReason: "invalid_action" };
  }
  if (event.type === "ADD") {
    const x = (event.payload.x as number) ?? 0;
    return {
      state: { n: state.n + x, log: [...state.log, `seq${ctx.seq}:+${x}`] },
      outcome: "applied",
    };
  }
  return { state, outcome: "bounced", bounceReason: "invalid_action" };
}

const CONFIG: EngineConfig<ToyState> = {
  reducer: toyReducer,
  genesisState: () => ({ n: 0, log: [] }),
  encode: (s) => JSON.stringify(s),
  decode: (raw) => JSON.parse(raw) as ToyState,
  hash: (s) => hashState(s),
};

function ev(
  seq: number,
  actor: string,
  type: GameEvent["type"] = "ADD",
  payload: Record<string, unknown> = { x: 1 },
): { seq: number; event: GameEvent } {
  return {
    seq,
    event: {
      type,
      payload,
      actor: testEventActor(actor),
      clientTimestamp: `t${seq}`,
    },
  };
}

const GENESIS_BASE = () => ({ seq: 0, state: CONFIG.genesisState(GENESIS) });

describe("foldEvents ordering", () => {
  it("folds events in seq order, keeps bounced events out of state, and reports the last seq", () => {
    const events = [ev(1, "A"), ev(2, "A", "BOUNCE_ME"), ev(3, "A")];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    expect(result.outcomes.map((o) => [o.seq, o.outcome, o.bounceReason])).toEqual([
      [1, "applied", undefined],
      [2, "bounced", "invalid_action"],
      [3, "applied", undefined],
    ]);
    expect(result.state.log).toEqual(["seq1:+1", "seq3:+1"]);
    expect(result.lastSeq).toBe(3);
  });
});

describe("foldEvents poison containment", () => {
  it("(devMode off) a throwing reducer bounces that event, applies the rest, reports one error", () => {
    const events = [
      ev(1, "A"),
      ev(2, "A", "POISON"),
      ev(3, "A"),
    ];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events, { devMode: false });
    const bySeq = new Map(result.outcomes.map((o) => [o.seq, o.outcome]));
    expect(bySeq.get(1)).toBe("applied");
    expect(bySeq.get(2)).toBe("bounced");
    expect(bySeq.get(3)).toBe("applied");
    const errors = result.outcomes.filter((o) => o.error !== undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0].seq).toBe(2);
    expect(errors[0].error?.message).toContain("poison");
    // state reflects seq 1 and seq 3 applying (n = 2), poison contained.
    expect(result.state.n).toBe(2);
  });

  it("(devMode on) a throwing reducer rethrows so programmer errors stay visible", () => {
    const events = [ev(1, "A", "POISON")];
    expect(() => foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events, { devMode: true })).toThrow(
      /poison/,
    );
  });
});

describe("foldEvents determinism", () => {
  it("folding the same inputs twice yields identical state and hash", () => {
    const events = [ev(1, "A"), ev(2, "A", "BOUNCE_ME"), ev(3, "A", "ADD", { x: 2 }), ev(4, "A"), ev(5, "A", "ADD", { x: 3 })];
    const a = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    const b = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    expect(a.state).toEqual(b.state);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.lastSeq).toBe(b.lastSeq);
  });
});
