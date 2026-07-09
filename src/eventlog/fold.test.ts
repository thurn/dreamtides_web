import { describe, expect, it } from "vitest";
import { buildAppliedIndex, decodeAppliedIndex, foldEvents } from "./fold";
import { hashState } from "./hash";
import type { EngineConfig, EventContext, EventOutcome, Genesis, GameEvent } from "./types";

// A minimal, game-agnostic toy fold state and reducer used to exercise the
// pure fold driver. `n` is a running counter; `log` records applied events in
// order. No src/rules or src/coop imports appear here.
interface ToyState {
  n: number;
  log: string[];
}

const GENESIS: Genesis = { seed: "toy-seed", reducerVersion: "v1", createdAt: 0, contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" } };

/**
 * Toy reducer:
 * - `ADD {x}` applies, adding `x` to `n` and appending a log line.
 * - `POISON` throws (exercises poison containment).
 * - `BOUNCE_ME` always bounces (state unchanged), used to plant a partner
 *   event that must be excluded from later intervening windows.
 * - a CAS-ish rule: if `intervening` contains any APPLIED event authored by a
 *   different actor, the ADD bounces (mirrors the real rule-3 self-chain
 *   exemption at the data level).
 */
function toyReducer(state: ToyState, event: GameEvent, ctx: EventContext): { state: ToyState; outcome: EventOutcome } {
  if (event.type === "POISON") {
    throw new Error("poison event exploded");
  }
  if (event.type === "BOUNCE_ME") {
    return { state, outcome: "bounced" };
  }
  if (event.type === "ADD") {
    if (ctx.intervening === "unknown") {
      return { state, outcome: "bounced" };
    }
    const partnerIntervened = ctx.intervening.some((entry) => entry.actor !== event.actor);
    if (partnerIntervened) {
      return { state, outcome: "bounced" };
    }
    const x = (event.payload.x as number) ?? 0;
    return {
      state: { n: state.n + x, log: [...state.log, `seq${ctx.seq}:+${x}`] },
      outcome: "applied",
    };
  }
  return { state, outcome: "bounced" };
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
  basedOnSeq: number,
  type = "ADD",
  payload: Record<string, unknown> = { x: 1 },
): { seq: number; event: GameEvent } {
  return {
    seq,
    event: { type, payload, actor, clientTimestamp: `t${seq}`, basedOnSeq },
  };
}

const GENESIS_BASE = () => ({ seq: 0, state: CONFIG.genesisState(GENESIS) });

describe("foldEvents intervening window", () => {
  it("uses the open interval (basedOnSeq, seq) — no off-by-one on either end", () => {
    // Events 1..6, all applied. Event at seq 6 with basedOnSeq 3 must see
    // exactly seqs 4 and 5 (not 3, not 6).
    let captured: EventContext["intervening"] | undefined;
    const spyConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        if (ctx.seq === 6) {
          captured = ctx.intervening;
        }
        // Apply everything unconditionally so the window is fully populated.
        const x = (event.payload.x as number) ?? 0;
        return { state: { n: state.n + x, log: [...state.log, `s${ctx.seq}`] }, outcome: "applied" };
      },
    };
    const events = [
      ev(1, "A", 0),
      ev(2, "A", 1),
      ev(3, "A", 2),
      ev(4, "A", 3),
      ev(5, "A", 4),
      ev(6, "A", 3),
    ];
    foldEvents(spyConfig, GENESIS, GENESIS_BASE(), events);
    expect(captured).not.toBe("unknown");
    expect((captured as Array<{ seq: number }>).map((e) => e.seq)).toEqual([4, 5]);
  });

  it("self-chain: A appends 4,5,6 all basedOnSeq 3 with no partner — all apply", () => {
    const seed = [ev(1, "A", 0), ev(2, "A", 1), ev(3, "A", 2)];
    const chain = [ev(4, "A", 3), ev(5, "A", 3), ev(6, "A", 3)];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), [...seed, ...chain]);
    expect(result.outcomes.every((o) => o.outcome === "applied")).toBe(true);
    expect(result.state.n).toBe(6);
  });

  it("bounced-event echo: a partner event that bounced is excluded from later windows", () => {
    // seq 4 is a partner (actor B) event that bounces. A's later ADD at seq 6
    // (basedOnSeq 3) must NOT see seq 4 as intervening, so it applies.
    const events = [
      ev(1, "A", 0),
      ev(2, "A", 1),
      ev(3, "A", 2),
      ev(4, "B", 3, "BOUNCE_ME"),
      ev(5, "A", 4),
      ev(6, "A", 3),
    ];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    const bySeq = new Map(result.outcomes.map((o) => [o.seq, o.outcome]));
    expect(bySeq.get(4)).toBe("bounced");
    // seq 5 and 6 see no APPLIED partner event, so they apply.
    expect(bySeq.get(5)).toBe("applied");
    expect(bySeq.get(6)).toBe("applied");
  });

  it("an APPLIED partner event does bounce a later cross-actor ADD (control)", () => {
    const events = [
      ev(1, "A", 0),
      ev(2, "A", 1),
      ev(3, "A", 2),
      ev(4, "B", 3), // applied partner ADD
      ev(6, "A", 3), // sees seq 4 (partner) -> bounces
    ];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    const bySeq = new Map(result.outcomes.map((o) => [o.seq, o.outcome]));
    expect(bySeq.get(4)).toBe("applied");
    expect(bySeq.get(6)).toBe("bounced");
  });
});

describe("foldEvents interveningSeqs on a bounced outcome (P3-9)", () => {
  it("attaches the intervening window's seqs to a rule-3-style bounce", () => {
    const events = [
      ev(1, "A", 0),
      ev(2, "A", 1),
      ev(3, "A", 2),
      ev(4, "B", 3), // applied partner ADD
      ev(6, "A", 3), // sees seq 4 (partner) -> bounces
    ];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    const bySeq = new Map(result.outcomes.map((o) => [o.seq, o]));
    expect(bySeq.get(6)?.outcome).toBe("bounced");
    expect(bySeq.get(6)?.interveningSeqs).toEqual([4]);
    // An applied outcome carries no interveningSeqs.
    expect(bySeq.get(4)?.interveningSeqs).toBeUndefined();
  });

  it("attaches an EMPTY array when the window is enumerable but nothing intervened", () => {
    // BOUNCE_ME always bounces regardless of window contents; with a
    // basedOnSeq of the immediately preceding seq the window is empty.
    const events = [ev(1, "A", 0, "BOUNCE_ME")];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    expect(result.outcomes[0].outcome).toBe("bounced");
    expect(result.outcomes[0].interveningSeqs).toEqual([]);
  });

  it("omits interveningSeqs when the window is 'unknown' (compacted away)", () => {
    const events = [ev(6, "A", 1)]; // basedOnSeq 1 < base.seq 5 -> "unknown"
    const result = foldEvents(CONFIG, GENESIS, { seq: 5, state: CONFIG.genesisState(GENESIS) }, events);
    expect(result.outcomes[0].outcome).toBe("bounced");
    expect(result.outcomes[0].interveningSeqs).toBeUndefined();
  });

  it("omits interveningSeqs for a malformed basedOnSeq (never reaches computeIntervening)", () => {
    const events = [ev(1, "A", -1)];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    expect(result.outcomes[0].outcome).toBe("bounced");
    expect(result.outcomes[0].interveningSeqs).toBeUndefined();
  });

  it("attaches interveningSeqs to a contained reducer-throw bounce when the window was enumerable", () => {
    const events = [ev(1, "A", 0), ev(2, "B", 1), ev(3, "A", 1, "POISON")];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events, { devMode: false });
    const poisoned = result.outcomes.find((o) => o.seq === 3);
    expect(poisoned?.outcome).toBe("bounced");
    expect(poisoned?.error).toBeDefined();
    expect(poisoned?.interveningSeqs).toEqual([2]);
  });
});

describe("foldEvents snapshot horizon", () => {
  it("reports 'unknown' (not []) when basedOnSeq < base.seq", () => {
    let captured: EventContext["intervening"] | undefined;
    const spyConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        captured = ctx.intervening;
        return toyReducer(state, event, ctx);
      },
    };
    // base.seq = 5 (snapshot horizon). Event basedOnSeq 3 < 5 -> unknown.
    const base = { seq: 5, state: { n: 5, log: [] } as ToyState };
    foldEvents(spyConfig, GENESIS, base, [ev(6, "A", 3)]);
    expect(captured).toBe("unknown");
  });

  it("reports [] (not 'unknown') when basedOnSeq >= base.seq and nothing intervened", () => {
    let captured: EventContext["intervening"] | undefined;
    const spyConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        captured = ctx.intervening;
        return toyReducer(state, event, ctx);
      },
    };
    const base = { seq: 5, state: { n: 5, log: [] } as ToyState };
    foldEvents(spyConfig, GENESIS, base, [ev(6, "A", 5)]);
    expect(captured).toEqual([]);
  });
});

describe("foldEvents applied-index horizon coverage", () => {
  it("a joiner folding from the snapshot computes the same intervening window a live client saw", () => {
    // Live client: folds seqs 1..6 from genesis. Actors 1-3,5,6 = A; seq 4 = B.
    // Event at seq 6 (basedOnSeq 3) sees applied partner seq 4 and bounces.
    const liveEvents = [
      ev(1, "A", 0),
      ev(2, "A", 1),
      ev(3, "A", 2),
      ev(4, "B", 3),
      ev(5, "A", 4),
      ev(6, "A", 3),
    ];
    let liveWindow: EventContext["intervening"] | undefined;
    const spyConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        if (ctx.seq === 6) {
          liveWindow = ctx.intervening;
        }
        return toyReducer(state, event, ctx);
      },
    };
    const live = foldEvents(spyConfig, GENESIS, GENESIS_BASE(), liveEvents);
    expect(new Map(live.outcomes.map((o) => [o.seq, o.outcome])).get(6)).toBe("bounced");
    expect(liveWindow).toEqual([
      { seq: 4, actor: "B", type: "ADD" },
      { seq: 5, actor: "A", type: "ADD" },
    ]);

    // Joiner: starts from a snapshot at the compaction horizon base.seq = 5,
    // seeded with the applied index the live client accumulated (covering
    // seqs 1..5) and coveredFromSeq 0. Folding only the live event at seq 6
    // (whose basedOnSeq 3 predates the horizon) must reproduce the SAME
    // enumerated window — not "unknown".
    const appliedBySeq = buildAppliedIndex(liveEvents.slice(0, 5), live.outcomes);
    let joinerWindow: EventContext["intervening"] | undefined;
    const joinerConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        joinerWindow = ctx.intervening;
        return toyReducer(state, event, ctx);
      },
    };
    const joiner = foldEvents(
      joinerConfig,
      GENESIS,
      { seq: 5, state: { n: 5, log: [] } },
      [ev(6, "A", 3)],
      { appliedBySeq, coveredFromSeq: 0 },
    );
    expect(joinerWindow).toEqual(liveWindow);
    expect(joiner.outcomes[0].outcome).toBe("bounced");
  });

  it("still reports 'unknown' below coveredFromSeq when the index does not reach that far", () => {
    // coveredFromSeq defaults to base.seq; an event based below it is unknown.
    let captured: EventContext["intervening"] | undefined;
    const spyConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        captured = ctx.intervening;
        return toyReducer(state, event, ctx);
      },
    };
    foldEvents(spyConfig, GENESIS, { seq: 5, state: { n: 5, log: [] } }, [ev(6, "A", 3)], {
      appliedBySeq: new Map(),
      coveredFromSeq: 4,
    });
    expect(captured).toBe("unknown");
  });
});

describe("decodeAppliedIndex", () => {
  it("is total for corrupt persisted appliedIndex strings", () => {
    expect(() => decodeAppliedIndex("{ not valid json")).not.toThrow();
    expect(decodeAppliedIndex("{ not valid json").size).toBe(0);
  });

  it("skips malformed appliedIndex entries and keeps valid integer-keyed entries", () => {
    const decoded = decodeAppliedIndex(
      JSON.stringify({
        1: { actor: "a", type: "T" },
        nope: { actor: "b", type: "T" },
        2: { actor: "missing-type" },
        3: null,
        4: { actor: "c", type: "U" },
      }),
    );

    expect([...decoded.entries()]).toEqual([
      [1, { actor: "a", type: "T" }],
      [4, { actor: "c", type: "U" }],
    ]);
  });
});

describe("foldEvents poison containment", () => {
  it("(devMode off) a throwing reducer bounces that event, applies the rest, reports one error", () => {
    const events = [
      ev(1, "A", 0),
      ev(2, "A", 1, "POISON"),
      ev(3, "A", 1),
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
    const events = [ev(1, "A", 0, "POISON")];
    expect(() => foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events, { devMode: true })).toThrow(
      /poison/,
    );
  });
});

describe("foldEvents malformed basedOnSeq", () => {
  it("bounces a nonsensical basedOnSeq (>= own seq) without invoking the reducer", () => {
    let reducerCalls = 0;
    const spyConfig: EngineConfig<ToyState> = {
      ...CONFIG,
      reducer: (state, event, ctx) => {
        reducerCalls += 1;
        return toyReducer(state, event, ctx);
      },
    };
    const result = foldEvents(spyConfig, GENESIS, GENESIS_BASE(), [ev(3, "A", 3)]);
    expect(result.outcomes[0].outcome).toBe("bounced");
    expect(result.outcomes[0].error).toBeDefined();
    expect(reducerCalls).toBe(0);
  });
});

describe("foldEvents determinism", () => {
  it("folding the same inputs twice yields identical state and hash", () => {
    const events = [ev(1, "A", 0), ev(2, "B", 1), ev(3, "A", 1), ev(4, "B", 3), ev(5, "A", 2)];
    const a = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    const b = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    expect(a.state).toEqual(b.state);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.lastSeq).toBe(b.lastSeq);
  });
});

describe("foldEvents incremental equivalence", () => {
  it("fold [1..10] at once === fold [1..5] then [6..10] carrying the applied index", () => {
    const all = Array.from({ length: 10 }, (_, i) => {
      const seq = i + 1;
      // Alternate actors and vary basedOnSeq to make intervening windows
      // non-trivial; keep basedOnSeq < seq.
      const actor = seq % 2 === 0 ? "A" : "B";
      const basedOnSeq = Math.max(0, seq - 2);
      return ev(seq, actor, basedOnSeq);
    });

    const batch = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), all);

    const first = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), all.slice(0, 5));
    const appliedBySeq = buildAppliedIndex(all.slice(0, 5), first.outcomes);
    const second = foldEvents(
      CONFIG,
      GENESIS,
      { seq: 0, state: first.state },
      all.slice(5),
      { appliedBySeq },
    );

    expect(hashState(second.state)).toBe(hashState(batch.state));
    expect(second.state).toEqual(batch.state);
    // Combined outcomes match batch outcomes seq-by-seq.
    const incrementalOutcomes = [...first.outcomes, ...second.outcomes].map((o) => [o.seq, o.outcome]);
    const batchOutcomes = batch.outcomes.map((o) => [o.seq, o.outcome]);
    expect(incrementalOutcomes).toEqual(batchOutcomes);
  });
});

describe("buildAppliedIndex", () => {
  it("includes only applied events with actor and type", () => {
    const events = [ev(1, "A", 0), ev(2, "B", 1, "BOUNCE_ME"), ev(3, "A", 1)];
    const result = foldEvents(CONFIG, GENESIS, GENESIS_BASE(), events);
    const index = buildAppliedIndex(events, result.outcomes);
    expect([...index.keys()].sort((a, b) => a - b)).toEqual([1, 3]);
    expect(index.get(1)).toEqual({ actor: "A", type: "ADD" });
    expect(index.has(2)).toBe(false);
  });
});
