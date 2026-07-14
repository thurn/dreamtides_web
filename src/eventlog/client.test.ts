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
import type {
  BounceReason,
  EngineConfig,
  EventOutcome,
  GameEvent,
  Genesis,
  LogNode,
} from "./types";

interface ToyState {
  applied: string[];
}

const GENESIS: Genesis = { seed: "toy-seed", reducerVersion: "v1", createdAt: 0, contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" } };

const config: EngineConfig<ToyState> = {
  genesisState: () => ({ applied: [] }),
  reducer: (state, event, ctx) => {
    if (ctx.intervening === "unknown") {
      return { state, outcome: "bounced", bounceReason: "unknown_conflict" };
    }
    for (const iv of ctx.intervening) {
      if (iv.actor !== event.actor) {
        return { state, outcome: "bounced", bounceReason: "partner_conflict" };
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
    // The engine-level `LogNode.baseSnapshot` field is the RAW encoded
    // string (subscribe.ts no longer pre-parses it — see client.ts's
    // `baseState`), so this helper encodes the caller's convenience object
    // the same way `config.encode` would.
    baseSnapshot: opts.baseSnapshot === undefined || opts.baseSnapshot === null
      ? null
      : JSON.stringify(opts.baseSnapshot),
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
  outcomes: Array<{
    event: GameEvent;
    seq: number;
    outcome: EventOutcome;
    interveningSeqs?: number[];
    bounceReason?: BounceReason;
  }>;
  divergences: Array<{ seq: number; expected: string; actual: string }>;
  foldErrors: Array<{ seq: number; message: string }>;
  appendFailures: Array<{ event: GameEvent; error: unknown }>;
  pendingDropped: GameEvent[][];
}

interface HarnessOptions {
  /** When set, every `io.append` rejects with this error (append-failure path). */
  rejectAppendWith?: Error;
  /** Optional append implementation for race-shaping tests. */
  append?: (event: GameEvent) => Promise<number>;
}

function makeHarness(
  cfg: EngineConfig<ToyState> = config,
  opts: HarnessOptions = {},
): {
  harness: Harness;
  client: ReturnType<typeof createLogClient<ToyState>>;
} {
  let onNode: ((node: LogNode) => void) | undefined;
  const appended: GameEvent[] = [];
  let seqCounter = 0;
  const displayedStates: ToyState[] = [];
  const outcomes: Harness["outcomes"] = [];
  const divergences: Harness["divergences"] = [];
  const foldErrors: Harness["foldErrors"] = [];
  const appendFailures: Harness["appendFailures"] = [];
  const pendingDropped: Harness["pendingDropped"] = [];

  const io: LogClientIo = {
    subscribe: (cb) => {
      onNode = cb;
      return () => {
        onNode = undefined;
      };
    },
    append: (event) => {
      appended.push(event);
      if (opts.append !== undefined) {
        return opts.append(event);
      }
      if (opts.rejectAppendWith !== undefined) {
        return Promise.reject(opts.rejectAppendWith);
      }
      seqCounter += 1;
      return Promise.resolve(seqCounter);
    },
  };

  const client = createLogClient<ToyState>(cfg, io, {
    onDisplayState: (s) => displayedStates.push(s),
    onEventOutcome: (event, seq, outcome, detail) =>
      outcomes.push({
        event,
        seq,
        outcome,
        interveningSeqs: detail?.interveningSeqs,
        bounceReason: detail?.bounceReason,
      }),
    onDivergence: (info) => divergences.push(info),
    onFoldError: (error) => foldErrors.push({ seq: error.seq, message: error.message }),
    onAppendFailed: (event, error) => appendFailures.push({ event, error }),
    onPendingDropped: (events) => pendingDropped.push(events),
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
    foldErrors,
    appendFailures,
    pendingDropped,
  };
  return { harness, client };
}

/** A confirmed event whose `basedOnSeq` is nonsensical, so the fold's malformed
 *  guard reports a bounced no-op carrying a `FoldError` without reaching the reducer. */
function malformedConfirmed(tag: string): GameEvent {
  return { ...confirmedEvent({ tag, actor: "me", basedOnSeq: 0 }), basedOnSeq: -1 };
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
    expect(ownOutcome?.bounceReason).toBe("partner_conflict");
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

describe("LogClient decode-path symmetry (P3-2)", () => {
  it("decodes a compacted snapshot through config.decode, not a bare JSON.parse", () => {
    // A non-identity decode: wraps the parsed value in a `decoded` marker so a
    // client that (incorrectly) treated `node.baseSnapshot` as already-parsed
    // JSON — casting it straight to `S` instead of calling `config.decode` —
    // would produce a state missing that marker, failing this assertion.
    const markingConfig: EngineConfig<ToyState & { decoded: true }> = {
      ...config,
      genesisState: () => ({ applied: [], decoded: true }),
      decode: (raw: string) => ({ ...(JSON.parse(raw) as ToyState), decoded: true }),
    } as unknown as EngineConfig<ToyState & { decoded: true }>;

    const { harness } = makeHarness(markingConfig as unknown as EngineConfig<ToyState>);
    const snapshot: ToyState = { applied: ["a", "b"] };
    // No live events above baseSeq: the displayed state is exactly the
    // decoded base state, with no reducer fold in between to obscure it.
    harness.deliver(makeNode({ baseSeq: 5, baseSnapshot: snapshot, events: {} }));

    expect(harness.displayed()).toEqual({ applied: ["a", "b"], decoded: true });
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
    const outcome = harness.outcomes.find((o) => o.seq === 6);
    expect(outcome?.outcome).toBe("bounced");
    // onEventOutcome's detail arg (P3-9) surfaces the diagnostic seqs the
    // fold's intervening window saw — here, seqs 4 (the below-horizon
    // partner, reconstructed from the joiner's persisted appliedIndex) and 5
    // (this client's own earlier applied event); interveningSeqs is
    // diagnostic and unfiltered by actor, unlike the CAS rule-3 check.
    expect(outcome?.interveningSeqs).toEqual([4, 5]);
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

describe("LogClient append rejection (P1-3)", () => {
  it("removes the pending intent and reports onAppendFailed when append rejects", async () => {
    const boom = new Error("append rejected");
    const { harness, client } = makeHarness(config, { rejectAppendWith: boom });
    harness.deliver(makeNode({ events: {} }));

    // The echo shows optimistically, then the append rejects and the intent is
    // swept out — `submit` rethrows the rejection.
    await expect(
      client.submit({ type: "T", payload: { tag: "A" }, actor: "me" }),
    ).rejects.toBe(boom);

    // The stranded echo was rolled back: displayed reverts to the confirmed
    // (empty) state, not the optimistic ["A"].
    expect(harness.displayed()?.applied).toEqual([]);
    // The failure was reported with the event and the rejection error.
    expect(harness.appendFailures).toHaveLength(1);
    expect(harness.appendFailures[0].event.payload.tag).toBe("A");
    expect(harness.appendFailures[0].error).toBe(boom);

    // A later confirmed node folds cleanly — nothing stale left in the queue.
    const other = confirmedEvent({ tag: "Z", actor: "partner", basedOnSeq: 0 });
    harness.deliver(makeNode({ events: { 1: other } }));
    expect(harness.displayed()?.applied).toEqual(["Z"]);
  });

  it("does not report append failure when the rejected append was already confirmed", async () => {
    const boom = new Error("ack lost after commit");
    let rejectAppend: ((error: Error) => void) | undefined;
    const { harness, client } = makeHarness(config, {
      append: () =>
        new Promise<number>((_resolve, reject) => {
          rejectAppend = reject;
        }),
    });
    harness.deliver(makeNode({ events: {} }));

    const submit = client.submit({ type: "T", payload: { tag: "A" }, actor: "me" });
    const committed = harness.appended[0];
    harness.deliver(makeNode({ events: { 1: committed } }));

    rejectAppend?.(boom);
    await expect(submit).rejects.toBe(boom);

    expect(harness.displayed()?.applied).toEqual(["A"]);
    expect(harness.appendFailures).toHaveLength(0);
  });
});

describe("LogClient full-refold pending sweep (P1-3)", () => {
  it("drops all pending intents with onPendingDropped on a full refold", async () => {
    const { harness, client } = makeHarness();
    harness.deliver(makeNode({ events: {} }));

    await client.submit({ type: "T", payload: { tag: "A" }, actor: "me" });
    await client.submit({ type: "T", payload: { tag: "B" }, actor: "me" });
    expect(harness.displayed()?.applied).toEqual(["A", "B"]);

    // A compacted node advances baseSeq past our fold -> a full refold. The
    // confirmation window is now untrustworthy, so the unconfirmed queue drops.
    const snapshot: ToyState = { applied: ["x"] };
    harness.deliver(makeNode({ baseSeq: 5, baseSnapshot: snapshot, events: {} }));

    expect(harness.pendingDropped).toHaveLength(1);
    expect(harness.pendingDropped[0].map((e) => e.payload.tag)).toEqual(["A", "B"]);
    // Displayed is the pure snapshot — no dropped echoes re-applied on top.
    expect(harness.displayed()?.applied).toEqual(["x"]);
  });
});

describe("LogClient seq-gap handling (P1-7)", () => {
  it("stops folding at a seq gap and resumes when a complete node arrives", () => {
    const { harness } = makeHarness();
    const e1 = confirmedEvent({ tag: "a", actor: "me", basedOnSeq: 0 });
    const e2 = confirmedEvent({ tag: "b", actor: "me", basedOnSeq: 1 });
    const e3 = confirmedEvent({ tag: "c", actor: "me", basedOnSeq: 2 });

    // A node with a hole at seq 2: head 3 but only 1 and 3 are present.
    harness.deliver(makeNode({ events: { 1: e1, 3: e3 } }));
    // Nothing past the hole folds: only seq 1 applied and was reported.
    expect(harness.displayed()?.applied).toEqual(["a"]);
    expect(harness.outcomes.map((o) => o.seq)).toEqual([1]);

    // The complete node arrives; folding resumes exactly at the hole.
    harness.deliver(makeNode({ events: { 1: e1, 2: e2, 3: e3 } }));
    expect(harness.displayed()?.applied).toEqual(["a", "b", "c"]);
    // Outcomes for 2 and 3 each emitted exactly once (1 was already emitted).
    expect(harness.outcomes.map((o) => o.seq)).toEqual([1, 2, 3]);
  });
});

describe("LogClient rewind refold hygiene (P1-4)", () => {
  it("re-reports outcomes and fold errors once per seq across a rewind refold", () => {
    const { harness } = makeHarness();
    const good1 = confirmedEvent({ tag: "a", actor: "me", basedOnSeq: 0 });
    const malformed = malformedConfirmed("x");
    const good3 = confirmedEvent({ tag: "c", actor: "me", basedOnSeq: 0 });

    harness.deliver(makeNode({ events: { 1: good1, 2: malformed, 3: good3 } }));
    // The malformed seq 2 folded to a bounce carrying a FoldError, reported once.
    expect(harness.foldErrors.filter((e) => e.seq === 2)).toHaveLength(1);
    expect(harness.outcomes.filter((o) => o.seq === 2)).toHaveLength(1);

    // A rewind: the log is rewritten shorter (head 2 < our lastFoldedSeq 3). The
    // rewritten log is authoritative, so its outcomes and fold errors re-report.
    harness.deliver(makeNode({ events: { 1: good1, 2: malformed } }));
    expect(harness.outcomes.filter((o) => o.seq === 1)).toHaveLength(2);
    expect(harness.outcomes.filter((o) => o.seq === 2)).toHaveLength(2);
    // The fold error for seq 2 was reported once per full-refold pass (gated with
    // the outcome, not spammed) — twice total across the two authoritative folds.
    expect(harness.foldErrors.filter((e) => e.seq === 2)).toHaveLength(2);
  });
});
