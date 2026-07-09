// Unit tests for the stateful LogClient: confirmed fold + pending-intent
// queue + optimistic echo reconciliation + divergence tripwire + hash gating.
//
// These tests use a TOY reducer and a FAKE io (no Firebase, no game imports).
// The toy reducer models the engine's compare-and-swap policy in miniature: an
// intent bounces if any APPLIED partner event (different actor) intervened
// between its basedOnSeq and its committed seq, or if the intervening window is
// "unknown". That is exactly enough CAS behavior to exercise optimistic-echo
// rollback without pulling in src/rules/.

import { describe, expect, it } from "vitest";
import { createLogClient } from "./client";
import type { LogClientIo } from "./client";
import { type AppliedEntry, foldEvents } from "./fold";
import { hashState } from "./hash";
import type { EngineConfig, EventOutcome, GameEvent, Genesis, LogNode } from "./types";

interface ToyState {
  applied: string[];
}

const GENESIS: Genesis = { seed: "toy-seed", reducerVersion: "v1", createdAt: 0 };

const config: EngineConfig<ToyState> = {
  genesisState: () => ({ applied: [] }),
  reducer: (state, event, ctx) => {
    if (ctx.intervening === "unknown") {
      return { state, outcome: "bounced" };
    }
    for (const iv of ctx.intervening) {
      if (iv.actor !== event.actor) {
        return { state, outcome: "bounced" };
      }
    }
    const tag = event.payload.tag as string;
    return { state: { applied: [...state.applied, tag] }, outcome: "applied" };
  },
  encode: (s) => JSON.stringify(s),
  decode: (raw) => JSON.parse(raw) as ToyState,
  hash: (s) => hashState(s),
};

/** Confirmed event body (as it appears committed in the log). */
function confirmedEvent(opts: {
  tag: string;
  actor: string;
  basedOnSeq: number;
  nonce?: string;
  stateHashAfter?: string;
}): GameEvent {
  return {
    type: "T",
    payload: { tag: opts.tag },
    actor: opts.actor,
    clientTimestamp: "0",
    basedOnSeq: opts.basedOnSeq,
    nonce: opts.nonce,
    stateHashAfter: opts.stateHashAfter,
  };
}

function makeNode(opts: {
  baseSeq?: number;
  baseSnapshot?: ToyState | null;
  events: Record<number, GameEvent>;
  appliedIndex?: Map<number, AppliedEntry>;
}): LogNode {
  const seqs = Object.keys(opts.events).map(Number);
  const baseSeq = opts.baseSeq ?? 0;
  const head = seqs.length ? Math.max(...seqs) : baseSeq;
  return {
    genesis: GENESIS,
    baseSeq,
    baseSnapshot: opts.baseSnapshot ?? null,
    head,
    events: new Map(seqs.map((s) => [s, opts.events[s]])),
    appliedIndex: opts.appliedIndex ?? new Map<number, AppliedEntry>(),
  };
}

interface Harness {
  io: LogClientIo;
  deliver: (node: LogNode) => void;
  appended: GameEvent[];
  displayed: () => ToyState | undefined;
  outcomes: Array<{ event: GameEvent; seq: number; outcome: EventOutcome }>;
  divergences: Array<{ seq: number; expected: string; actual: string }>;
}

function makeHarness(cfg: EngineConfig<ToyState> = config): {
  harness: Harness;
  client: ReturnType<typeof createLogClient<ToyState>>;
} {
  let onNode: ((node: LogNode) => void) | undefined;
  const appended: GameEvent[] = [];
  let seqCounter = 0;
  const displayedStates: ToyState[] = [];
  const outcomes: Harness["outcomes"] = [];
  const divergences: Harness["divergences"] = [];

  const io: LogClientIo = {
    subscribe: (cb) => {
      onNode = cb;
      return () => {
        onNode = undefined;
      };
    },
    append: (event) => {
      appended.push(event);
      seqCounter += 1;
      return Promise.resolve(seqCounter);
    },
  };

  const client = createLogClient<ToyState>(cfg, io, {
    onDisplayState: (s) => displayedStates.push(s),
    onEventOutcome: (event, seq, outcome) => outcomes.push({ event, seq, outcome }),
    onDivergence: (info) => divergences.push(info),
  });

  const harness: Harness = {
    io,
    deliver: (node) => {
      if (!onNode) throw new Error("no subscriber");
      onNode(node);
    },
    appended,
    displayed: () => displayedStates[displayedStates.length - 1],
    outcomes,
    divergences,
  };
  return { harness, client };
}

describe("LogClient double-apply of own intent", () => {
  it("shows an own confirmed intent exactly once (nonce removal)", async () => {
    const { harness, client } = makeHarness();
    harness.deliver(makeNode({ events: {} }));

    await client.submit({ type: "T", payload: { tag: "A" }, actor: "me" });
    // Optimistic echo: A applied once.
    expect(harness.displayed()?.applied).toEqual(["A"]);

    // The committed event carries the client's nonce.
    const committed = harness.appended[0];
    expect(committed.nonce).toBeTruthy();

    harness.deliver(makeNode({ events: { 1: committed } }));

    // Confirmed state contains A exactly once; the pending copy was removed.
    expect(harness.displayed()?.applied).toEqual(["A"]);
    expect(harness.outcomes).toContainEqual({ event: committed, seq: 1, outcome: "applied" });
  });
});

describe("LogClient optimistic echo rollback", () => {
  it("drops the echo and reports a bounce when a partner wins the race", async () => {
    const { harness, client } = makeHarness();
    harness.deliver(makeNode({ events: {} }));

    await client.submit({ type: "T", payload: { tag: "A" }, actor: "me" });
    expect(harness.displayed()?.applied).toEqual(["A"]);
    const ownA = harness.appended[0];

    // Partner event lands FIRST at seq 1.
    const partner = confirmedEvent({ tag: "P", actor: "partner", basedOnSeq: 0 });
    harness.deliver(makeNode({ events: { 1: partner } }));
    // Echo rolls back: the pending A now re-folds after the partner and bounces.
    expect(harness.displayed()?.applied).toEqual(["P"]);

    // Own A commits at seq 2 and bounces against the intervening partner.
    harness.deliver(makeNode({ events: { 1: partner, 2: ownA } }));
    expect(harness.displayed()?.applied).toEqual(["P"]);
    const ownOutcome = harness.outcomes.find((o) => o.event.nonce === ownA.nonce);
    expect(ownOutcome?.outcome).toBe("bounced");
  });
});

describe("LogClient refold after compaction", () => {
  it("re-folds from the snapshot when baseSeq advances past lastFoldedSeq", () => {
    const { harness } = makeHarness();
    // Fold up to seq 3.
    const e1 = confirmedEvent({ tag: "a", actor: "me", basedOnSeq: 0 });
    const e2 = confirmedEvent({ tag: "b", actor: "me", basedOnSeq: 1 });
    const e3 = confirmedEvent({ tag: "c", actor: "me", basedOnSeq: 2 });
    harness.deliver(makeNode({ events: { 1: e1, 2: e2, 3: e3 } }));
    expect(harness.displayed()?.applied).toEqual(["a", "b", "c"]);

    // A compacted node: baseSeq jumped to 5 (past our lastFoldedSeq of 3) with a
    // snapshot, plus live events 6 and 7.
    const snapshot: ToyState = { applied: ["a", "b", "c", "d", "e"] };
    const e6 = confirmedEvent({ tag: "f", actor: "me", basedOnSeq: 5 });
    const e7 = confirmedEvent({ tag: "g", actor: "me", basedOnSeq: 6 });
    harness.deliver(
      makeNode({ baseSeq: 5, baseSnapshot: snapshot, events: { 6: e6, 7: e7 } }),
    );

    const batch = foldEvents(
      config,
      GENESIS,
      { seq: 5, state: snapshot },
      [
        { seq: 6, event: e6 },
        { seq: 7, event: e7 },
      ],
    ).state;
    expect(harness.displayed()).toEqual(batch);
    expect(harness.displayed()?.applied).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});

describe("LogClient joiner seeds the applied index from the snapshot", () => {
  it("enumerates a below-horizon window from node.appliedIndex, matching a live client", () => {
    // A joiner's first node is already compacted: baseSeq 5 with a snapshot and
    // a persisted applied index recording that partner "them" applied at seq 4.
    // A live event at seq 6 with basedOnSeq 3 (below the horizon) must see that
    // partner in its intervening window and bounce — not fold to "unknown" and
    // apply spuriously.
    const { harness } = makeHarness();
    const snapshot: ToyState = { applied: ["a", "b", "c", "d"] };
    const appliedIndex = new Map<number, AppliedEntry>([
      [4, { actor: "them", type: "T" }],
      [5, { actor: "me", type: "T" }],
    ]);
    const e6 = confirmedEvent({ tag: "z", actor: "me", basedOnSeq: 3 });
    harness.deliver(
      makeNode({ baseSeq: 5, baseSnapshot: snapshot, appliedIndex, events: { 6: e6 } }),
    );

    // seq 6 sees applied partner "them" at seq 4 -> bounced, so the snapshot is
    // unchanged (z not appended).
    expect(harness.displayed()?.applied).toEqual(["a", "b", "c", "d"]);
    expect(harness.outcomes.find((o) => o.seq === 6)?.outcome).toBe("bounced");
  });
});

describe("LogClient stateHashAfter gating", () => {
  it("stamps stateHashAfter on a clean single submit and omits it when pending is non-empty", async () => {
    const { harness, client } = makeHarness();
    harness.deliver(makeNode({ events: {} }));

    await client.submit({ type: "T", payload: { tag: "A" }, actor: "me" });
    await client.submit({ type: "T", payload: { tag: "B" }, actor: "me" });

    // First submit had an empty pending queue and predicted seq lastConfirmed+1.
    expect(typeof harness.appended[0].stateHashAfter).toBe("string");
    // Second submit was made while A was still pending -> no hash.
    expect(harness.appended[1].stateHashAfter).toBeUndefined();

    // The stamped hash matches the optimistic single-event fold.
    const optimistic = foldEvents(
      config,
      GENESIS,
      { seq: 0, state: config.genesisState(GENESIS) },
      [{ seq: 1, event: harness.appended[0] }],
    ).state;
    expect(harness.appended[0].stateHashAfter).toBe(config.hash(optimistic));
  });
});

describe("LogClient divergence tripwire", () => {
  it("reports divergence exactly once when a confirmed event carries a wrong hash", () => {
    const { harness } = makeHarness();
    harness.deliver(makeNode({ events: {} }));

    const bad = confirmedEvent({
      tag: "X",
      actor: "partner",
      basedOnSeq: 0,
      stateHashAfter: "deadbeef",
    });
    const node = makeNode({ events: { 1: bad } });
    harness.deliver(node);
    // Re-delivering the same node must not re-report.
    harness.deliver(node);

    expect(harness.divergences).toHaveLength(1);
    expect(harness.divergences[0].seq).toBe(1);
    expect(harness.divergences[0].expected).toBe("deadbeef");
    expect(harness.divergences[0].actual).toBe(config.hash({ applied: ["X"] }));
  });

  it("does not false-positive on an own skewed prediction that bounces", async () => {
    const { harness, client } = makeHarness();
    harness.deliver(makeNode({ events: {} }));
    await client.submit({ type: "T", payload: { tag: "A" }, actor: "me" });
    const ownA = harness.appended[0];
    expect(typeof ownA.stateHashAfter).toBe("string");

    // Partner wins seq 1; own A commits at seq 2 and bounces. Its stamped
    // (optimistic, applied) hash must NOT be read as divergence on a bounce.
    const partner = confirmedEvent({ tag: "P", actor: "partner", basedOnSeq: 0 });
    harness.deliver(makeNode({ events: { 1: partner, 2: ownA } }));
    expect(harness.divergences).toHaveLength(0);
  });

  it("does not false-positive on a skewed-but-APPLIED event under an rng-drawing reducer", async () => {
    // A reducer that draws from ctx.rng (keyed by committed seq) so the fold
    // state — and thus the hash — depends on the seq an event lands at.
    // `forceBounce` lets a preceding event bounce without intervening.
    const rngConfig: EngineConfig<ToyState> = {
      ...config,
      reducer: (state, event, ctx) => {
        if (event.payload.forceBounce === true) {
          return { state, outcome: "bounced" };
        }
        if (ctx.intervening === "unknown") {
          return { state, outcome: "bounced" };
        }
        for (const iv of ctx.intervening) {
          if (iv.actor !== event.actor) {
            return { state, outcome: "bounced" };
          }
        }
        const draw = ctx.rng(0).toFixed(6);
        const tag = `${event.payload.tag as string}@${draw}`;
        return { state: { applied: [...state.applied, tag] }, outcome: "applied" };
      },
    };
    const { harness, client } = makeHarness(rngConfig);

    // Confirm events 1..5 so lastFoldedSeq == 5.
    const confirmed: Record<number, GameEvent> = {};
    for (let seq = 1; seq <= 5; seq++) {
      confirmed[seq] = confirmedEvent({ tag: `c${seq}`, actor: "me", basedOnSeq: seq - 1 });
    }
    harness.deliver(makeNode({ events: { ...confirmed } }));

    // Submit E: pending empty, basedOnSeq == 5, predicts seq 6, stamps the
    // hash of E folded at seq 6 (rng keyed by 6).
    await client.submit({ type: "T", payload: { tag: "E" }, actor: "me" });
    const ownE = harness.appended[0];
    expect(ownE.basedOnSeq).toBe(5);
    expect(typeof ownE.stateHashAfter).toBe("string");

    // Partner event commits at seq 6 and BOUNCES; E skews forward to seq 7 and
    // APPLIES (P bounced, so the (5,7) window has zero applied events). E now
    // folds with rng keyed by 7 -> a different hash than the stamped hash@6,
    // with NO nondeterminism bug. basedOnSeq(5) != seq-1(6), so no divergence.
    const partnerBounce = confirmedEvent({ tag: "P", actor: "partner", basedOnSeq: 5 });
    partnerBounce.payload.forceBounce = true;
    harness.deliver(makeNode({ events: { ...confirmed, 6: partnerBounce, 7: ownE } }));

    const eOutcome = harness.outcomes.find((o) => o.event.nonce === ownE.nonce);
    expect(eOutcome?.outcome).toBe("applied");
    expect(harness.divergences).toHaveLength(0);
  });
});
