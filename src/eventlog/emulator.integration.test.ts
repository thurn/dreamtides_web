// Two-client convergence integration test for the event-sourcing engine
// against the real Firebase RTDB emulator (not a fake). Two independent
// `createLogClient` instances on ONE room simulate two browser tabs folding
// the same live log; the property under test is that they CONVERGE — both
// fold to identical confirmed state and resolve every intervening decision the
// same way.
//
// Because compaction now persists an `appliedIndex`, the equivalence holds
// below the compaction horizon too: a client that joins fresh AFTER compaction
// and folds from the snapshot enumerates the same intervening windows an
// always-connected client saw live, so an event's outcome is a pure function of
// the log prefix regardless of when a client joined. Scenario B asserts exactly
// that with a post-compaction joiner.
//
// Uses a game-agnostic TOY reducer (no src/rules/ or src/coop/ imports), kept
// local to this file, matching the CAS-in-miniature toy from client.test.ts.
//
// Harness pattern (emulator connection + skip-guard + rooms cleanup) copied
// from the legacy `src/multiplayer/firebase-emulator.integration.test.ts`,
// which is deleted in a later migration stage.

import { type Database, get, ref, remove } from "firebase/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appendEvent, COMPACT_THRESHOLD } from "./append";
import { getFirebaseDatabase } from "../firebase/app-config";
import { type EventDraft, type LogClient, type LogClientIo, createLogClient } from "./client";
import { hashState } from "./hash";
import { createRoom } from "./room";
import { decodeLogNode, subscribeToLog } from "./subscribe";
import type { EncodedLogNode, EngineConfig, Genesis } from "./types";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import {
  clearReplayFixtureProviders,
  DRAFT_SITE_ID,
  DREAMCALLER_ID,
  ESSENCE_SITE_ID,
  registerReplayFixtureProviders,
  SHOP_SITE_ID,
} from "../rules/replay/fixture-providers";

const runWithEmulator =
  process.env.FIREBASE_DATABASE_EMULATOR_HOST === undefined ? describe.skip : describe;

const database = getFirebaseDatabase("emulator", {});

// ---------------------------------------------------------------------------
// Toy reducer: a game-agnostic CAS-in-miniature state, `{ applied: string[] }`.
// An intent bounces if:
//   - `payload.invalid === true` (models a domain-invalid intent, e.g.
//     "insufficient resources" — independent of concurrency), or
//   - any APPLIED partner event (a different actor) intervened between its
//     `basedOnSeq` and its committed seq (ordinary CAS staleness), or
//   - the intervening window is "unknown" (compacted past the horizon).
// ---------------------------------------------------------------------------

interface ToyState {
  applied: string[];
}

const toyConfig: EngineConfig<ToyState> = {
  genesisState: () => ({ applied: [] }),
  reducer: (state, event, ctx) => {
    if (event.payload.invalid === true) {
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
    const tag = event.payload.tag as string;
    return { state: { applied: [...state.applied, tag] }, outcome: "applied" };
  },
  encode: (s) => JSON.stringify(s),
  decode: (raw) => JSON.parse(raw) as ToyState,
  hash: (s) => hashState(s),
};

function toyGenesis(seed: string): Genesis {
  return {
    seed,
    reducerVersion: "toy-v1",
    createdAt: Date.now(),
    contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
  };
}

function realGenesis(seed: string): Genesis {
  return {
    seed,
    reducerVersion: "real-v1",
    createdAt: Date.now(),
    contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
  };
}

// ---------------------------------------------------------------------------
// Real-reducer client harness: identical shape to the toy harness above, but
// wired to the ACTUAL game (`GAME_ENGINE_CONFIG` — the real root reducer,
// genesis-state builder, codec, and hash) instead of the toy CAS-in-miniature
// reducer. Used by scenario D's real-quest-event storm.
// ---------------------------------------------------------------------------

interface RealClientHarness {
  client: LogClient;
  displayed: FoldState | undefined;
  lastFoldedSeq: number;
  errors: unknown[];
}

function makeRealIo(db: Database, roomId: string): LogClientIo {
  return {
    subscribe: (onNode) => subscribeToLog(db, roomId, onNode),
    append: (event) => appendEvent(db, roomId, GAME_ENGINE_CONFIG, event),
  };
}

function makeRealClientHarness(db: Database, roomId: string, clientId: string): RealClientHarness {
  const harness: RealClientHarness = {
    client: undefined as unknown as LogClient,
    displayed: undefined,
    lastFoldedSeq: 0,
    errors: [],
  };
  harness.client = createLogClient<FoldState>(
    GAME_ENGINE_CONFIG,
    makeRealIo(db, roomId),
    {
      onDisplayState: (s) => {
        harness.displayed = s;
      },
      onEventOutcome: (_event, seq) => {
        if (seq > harness.lastFoldedSeq) {
          harness.lastFoldedSeq = seq;
        }
      },
      onDivergence: (info) => {
        harness.errors.push(
          new Error(`divergence at seq ${info.seq}: expected ${info.expected}, actual ${info.actual}`),
        );
      },
      onFoldError: (error) => {
        harness.errors.push(error);
      },
    },
    { clientId },
  );
  return harness;
}

/**
 * Builds one storm submission from `harness`'s CURRENT locally-displayed
 * state (exactly how a real player's client decides what to submit next) —
 * a mix of real quest events, some of which are structurally valid (may
 * still bounce on ordinary CAS staleness under concurrency) and some
 * deliberately invalid/stale (a malformed payload, an unknown site, a
 * post-completion re-pick), so the storm exercises both bounce paths.
 */
function stormDraft(harness: RealClientHarness, rng: () => number): EventDraft {
  const roll = rng();
  const draftState = harness.displayed?.quest.draftState;

  if (roll < 0.25) {
    if (rng() < 0.15) {
      // Malformed payload — bounces before the reducer's CAS window even matters.
      return { type: "ADJUST_ESSENCE", payload: { delta: "not-a-number" } };
    }
    const delta = Math.floor(rng() * 21) - 10;
    return { type: "ADJUST_ESSENCE", payload: { delta } };
  }
  if (roll < 0.4) {
    const siteId = rng() < 0.5 ? ESSENCE_SITE_ID : SHOP_SITE_ID;
    return { type: "OPEN_SITE", payload: { siteId } };
  }
  if (roll < 0.45) {
    // Unknown site — domain-invalid bounce.
    return { type: "OPEN_SITE", payload: { siteId: "no-such-site" } };
  }
  if (roll < 0.55) {
    // Idempotent re-entry once already active — a no-change applied outcome.
    return { type: "ENTER_DRAFT_SITE", payload: { siteId: DRAFT_SITE_ID } };
  }
  if (roll < 0.85) {
    const offer = draftState?.currentOffer ?? [];
    if (offer.length > 0) {
      return { type: "PICK_DRAFT_CARD", payload: { packIndex: 0, cardId: `card-${String(offer[0])}` } };
    }
    // Stale: no live offer to pick from right now — a guaranteed domain bounce.
    return { type: "PICK_DRAFT_CARD", payload: { packIndex: 99, cardId: "card-9999" } };
  }
  // Already selected by the setup phase's START_QUEST — a guaranteed domain bounce.
  return { type: "SELECT_DREAMCALLER", payload: { dreamcallerId: DREAMCALLER_ID } };
}

// ---------------------------------------------------------------------------
// Client harness: wires a real `createLogClient` to the emulator via
// `subscribeToLog` + `appendEvent`, and records enough to observe the
// confirmed fold from the outside.
//
// `lastFoldedSeq` tracks the max seq seen via `onEventOutcome`, which is a
// faithful external mirror of the client's internal `lastFoldedSeq` at rest:
// `onEventOutcome` fires for every newly-folded seq up to `node.head` on
// every `onNode` call (see client.ts `foldConfirmedRange`), so once a
// client's tracked value reaches the log's true `head`, its confirmed fold
// is caught up. This holds even across compaction (the newest live events
// are never compacted away, so `head` itself is always eventually reported)
// — unlike a raw *count* of reported seqs, which can undercount when a
// client jumps straight to a post-compaction snapshot without ever seeing
// the compacted-away seqs individually.
// ---------------------------------------------------------------------------

interface ClientHarness {
  client: LogClient;
  displayed: ToyState | undefined;
  lastFoldedSeq: number;
  errors: unknown[];
}

function makeIo(db: Database, roomId: string): LogClientIo {
  return {
    subscribe: (onNode) => subscribeToLog(db, roomId, onNode),
    append: (event) => appendEvent(db, roomId, toyConfig, event),
  };
}

function makeClientHarness(db: Database, roomId: string, clientId: string): ClientHarness {
  const harness: ClientHarness = {
    client: undefined as unknown as LogClient,
    displayed: undefined,
    lastFoldedSeq: 0,
    errors: [],
  };
  harness.client = createLogClient<ToyState>(
    toyConfig,
    makeIo(db, roomId),
    {
      onDisplayState: (s) => {
        harness.displayed = s;
      },
      onEventOutcome: (_event, seq) => {
        if (seq > harness.lastFoldedSeq) {
          harness.lastFoldedSeq = seq;
        }
      },
      onDivergence: (info) => {
        harness.errors.push(
          new Error(`divergence at seq ${info.seq}: expected ${info.expected}, actual ${info.actual}`),
        );
      },
      onFoldError: (error) => {
        harness.errors.push(error);
      },
    },
    { clientId },
  );
  return harness;
}

async function waitFor(predicate: () => boolean, timeoutMs = 20_000, intervalMs = 20): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function readHead(roomId: string): Promise<number> {
  const snapshot = await get(ref(database, `rooms/${roomId}/log/head`));
  return snapshot.val() as number;
}

/** Reads and decodes the full log node directly from RTDB (bypasses the client fold). */
async function readLogNode(roomId: string): Promise<NonNullable<ReturnType<typeof decodeLogNode>>> {
  const snapshot = await get(ref(database, `rooms/${roomId}/log`));
  const node = decodeLogNode(snapshot.val() as EncodedLogNode);
  if (node === null) {
    throw new Error(`readLogNode: room ${roomId} decoded to null (corrupt genesis/snapshot)`);
  }
  return node;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) for the chaos storm — deterministic, no
// `Math.random`, so a failing run is reproducible.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

runWithEmulator("eventlog emulator integration", () => {
  beforeEach(async () => {
    await remove(ref(database, "rooms"));
  });

  afterAll(async () => {
    await remove(ref(database, "rooms"));
  });

  it(
    "scenario A: two clients converge after concurrent interleaved appends",
    async () => {
      const roomId = "eventlog-conv";
      await createRoom(database, roomId, toyGenesis("scenario-a"));

      const clientA = makeClientHarness(database, roomId, "client-a");
      const clientB = makeClientHarness(database, roomId, "client-b");
      await waitFor(() => clientA.displayed !== undefined && clientB.displayed !== undefined);

      const perClient = 10;
      const submissions: Array<Promise<unknown>> = [];
      for (let i = 0; i < perClient; i++) {
        submissions.push(clientA.client.submit({ type: "T", payload: { tag: `a${i}` } }));
        submissions.push(clientB.client.submit({ type: "T", payload: { tag: `b${i}` } }));
      }
      await Promise.all(submissions);

      const head = await readHead(roomId);
      expect(head).toBe(perClient * 2);

      await waitFor(() => clientA.lastFoldedSeq === head && clientB.lastFoldedSeq === head);

      expect(clientA.errors).toEqual([]);
      expect(clientB.errors).toEqual([]);
      expect(clientA.lastFoldedSeq).toBe(clientB.lastFoldedSeq);
      expect(hashState(clientA.displayed)).toBe(hashState(clientB.displayed));

      clientA.client.close();
      clientB.client.close();
    },
    30_000,
  );

  it(
    "scenario B: converges and compacts under sustained two-client contention",
    async () => {
      const roomId = "eventlog-compact";
      await createRoom(database, roomId, toyGenesis("scenario-b"));

      const clientA = makeClientHarness(database, roomId, "client-a");
      const clientB = makeClientHarness(database, roomId, "client-b");
      await waitFor(() => clientA.displayed !== undefined && clientB.displayed !== undefined);

      // Past COMPACT_THRESHOLD (200) live events, split across both clients,
      // so compaction fires mid-run under real contention.
      const perClient = Math.ceil((COMPACT_THRESHOLD + 20) / 2);
      const submissions: Array<Promise<unknown>> = [];
      for (let i = 0; i < perClient; i++) {
        submissions.push(clientA.client.submit({ type: "T", payload: { tag: `a${i}` } }));
        submissions.push(clientB.client.submit({ type: "T", payload: { tag: `b${i}` } }));
      }
      await Promise.all(submissions);

      const head = await readHead(roomId);
      expect(head).toBe(perClient * 2);

      await waitFor(() => clientA.lastFoldedSeq === head && clientB.lastFoldedSeq === head, 30_000);

      expect(clientA.errors).toEqual([]);
      expect(clientB.errors).toEqual([]);
      expect(hashState(clientA.displayed)).toBe(hashState(clientB.displayed));
      expect(clientA.lastFoldedSeq).toBe(clientB.lastFoldedSeq);

      // Compaction fired: the live `baseSeq` advanced past 0 ...
      const baseSeqSnapshot = await get(ref(database, `rooms/${roomId}/log/baseSeq`));
      expect(baseSeqSnapshot.val()).toBeGreaterThan(0);

      // ... and the `events` node stayed at or under the threshold. RTDB may
      // return a sparse array or a plain object for `events` — tolerate both
      // shapes, matching subscribe.ts's own handling.
      const eventsSnapshot = await get(ref(database, `rooms/${roomId}/log/events`));
      const rawEvents = eventsSnapshot.val() as unknown;
      const liveCount = Array.isArray(rawEvents)
        ? rawEvents.filter((v) => v !== null && v !== undefined).length
        : Object.keys((rawEvents ?? {}) as Record<string, unknown>).length;
      expect(liveCount).toBeLessThanOrEqual(COMPACT_THRESHOLD);

      // Outcome-immutability below the horizon: a THIRD client joins fresh now,
      // after compaction, and folds from the persisted snapshot + appliedIndex.
      // It must converge on the SAME confirmed hash as the always-connected
      // client, proving the below-horizon intervening windows resolve identically
      // whether folded live or reconstructed from the index.
      const clientC = makeClientHarness(database, roomId, "client-c");
      await waitFor(() => clientC.lastFoldedSeq === head, 30_000);
      expect(clientC.errors).toEqual([]);
      expect(clientC.lastFoldedSeq).toBe(head);
      expect(hashState(clientC.displayed)).toBe(hashState(clientA.displayed));

      clientA.client.close();
      clientB.client.close();
      clientC.client.close();
    },
    60_000,
  );

  it(
    "scenario C: chaos storm — seeded random valid/invalid/stale intents from both clients converge with zero errors and dense seqs",
    async () => {
      const roomId = "eventlog-chaos";
      await createRoom(database, roomId, toyGenesis("scenario-c"));

      const clientA = makeClientHarness(database, roomId, "client-a");
      const clientB = makeClientHarness(database, roomId, "client-b");
      await waitFor(() => clientA.displayed !== undefined && clientB.displayed !== undefined);

      const perClient = 100;
      const rngA = mulberry32(0xc0ffee);
      const rngB = mulberry32(0xdeadbeef);

      /**
       * Fires `count` submits from `harness` at random small delays via the
       * seeded `rng`. Each intent is a mix of:
       *  - ordinary valid intents (may still bounce on ordinary CAS
       *    staleness from concurrent submission timing — that IS the
       *    "stale basedOnSeq" case: `submit()` stamps `basedOnSeq` from
       *    `lastFoldedSeq` at call time, and by commit time a partner may
       *    have intervened),
       *  - explicit `payload.invalid` intents (invalid-in-toy-state,
       *    unconditionally bounced by the reducer).
       * A thrown/rejected submit is captured into `errors` rather than
       * failing the batch, so the assertion below can verify zero errors
       * across the whole storm.
       */
      function fireStorm(harness: ClientHarness, rng: () => number, count: number): Promise<void[]> {
        const tasks: Array<Promise<void>> = [];
        for (let i = 0; i < count; i++) {
          const invalid = rng() < 0.25;
          const delayMs = Math.floor(rng() * 25);
          const draft: EventDraft = {
            type: "T",
            payload: { tag: `${harness.client.clientId}-${i}`, invalid },
          };
          tasks.push(
            new Promise<void>((resolve) => {
              setTimeout(() => {
                harness.client
                  .submit(draft)
                  .then(() => resolve())
                  .catch((error: unknown) => {
                    harness.errors.push(error);
                    resolve();
                  });
              }, delayMs);
            }),
          );
        }
        return Promise.all(tasks);
      }

      await Promise.all([
        fireStorm(clientA, rngA, perClient),
        fireStorm(clientB, rngB, perClient),
      ]);

      const head = await readHead(roomId);
      expect(head).toBe(perClient * 2);

      await waitFor(() => clientA.lastFoldedSeq === head && clientB.lastFoldedSeq === head, 30_000);

      // Zero thrown errors across the entire storm (both clients).
      expect(clientA.errors).toEqual([]);
      expect(clientB.errors).toEqual([]);

      // Both clients converge on an identical confirmed fold.
      expect(clientA.lastFoldedSeq).toBe(clientB.lastFoldedSeq);
      expect(hashState(clientA.displayed)).toBe(hashState(clientB.displayed));

      // Bug class under test: transaction retry losing or reordering events.
      // Read the raw log directly (not via a client fold) and assert exactly
      // `head` events observed with dense seqs — no gaps, no duplicates.
      const node = await readLogNode(roomId);
      const liveCount = node.head - node.baseSeq;
      expect(node.events.size).toBe(liveCount);
      for (let seq = node.baseSeq + 1; seq <= node.head; seq++) {
        expect(node.events.has(seq)).toBe(true);
      }

      clientA.client.close();
      clientB.client.close();
    },
    60_000,
  );

  describe("scenario D: real-reducer quest-event storm convergence", () => {
    beforeAll(() => {
      registerReplayFixtureProviders();
    });
    afterAll(() => {
      clearReplayFixtureProviders();
    });

    it(
      "two clients storm real quest events (START_QUEST/SELECT_DREAMCALLER/ADJUST_ESSENCE/OPEN_SITE/ENTER_DRAFT_SITE/PICK_DRAFT_CARD) with interleaved invalid/stale intents, converging including a post-compaction joiner",
      async () => {
        const roomId = "eventlog-real-storm";
        await createRoom(database, roomId, realGenesis("scenario-d"));

        const clientA = makeRealClientHarness(database, roomId, "client-a");
        const clientB = makeRealClientHarness(database, roomId, "client-b");
        await waitFor(() => clientA.displayed !== undefined && clientB.displayed !== undefined);

        // Sequential setup: start the run and enter the draft site, so the
        // concurrent storm below always has a live quest + draft offer to
        // operate against on both clients.
        await clientA.client.submit({
          type: "START_QUEST",
          payload: { dreamcallerId: DREAMCALLER_ID },
        });
        await waitFor(
          () =>
            clientA.displayed?.quest.dreamcaller !== null &&
            clientB.displayed?.quest.dreamcaller !== null,
        );
        await clientA.client.submit({
          type: "ENTER_DRAFT_SITE",
          payload: { siteId: DRAFT_SITE_ID },
        });
        await waitFor(
          () =>
            (clientA.displayed?.quest.draftState?.currentOffer.length ?? 0) > 0 &&
            (clientB.displayed?.quest.draftState?.currentOffer.length ?? 0) > 0,
        );

        const perClient = 110;
        const rngA = mulberry32(0xfeed1);
        const rngB = mulberry32(0xfeed2);

        function fireRealStorm(
          harness: RealClientHarness,
          rng: () => number,
          count: number,
        ): Promise<void[]> {
          const tasks: Array<Promise<void>> = [];
          for (let i = 0; i < count; i++) {
            const delayMs = Math.floor(rng() * 15);
            tasks.push(
              new Promise<void>((resolve) => {
                setTimeout(() => {
                  const draft = stormDraft(harness, rng);
                  harness.client
                    .submit(draft)
                    .then(() => resolve())
                    .catch((error: unknown) => {
                      harness.errors.push(error);
                      resolve();
                    });
                }, delayMs);
              }),
            );
          }
          return Promise.all(tasks);
        }

        await Promise.all([
          fireRealStorm(clientA, rngA, perClient),
          fireRealStorm(clientB, rngB, perClient),
        ]);

        const head = await readHead(roomId);
        await waitFor(
          () => clientA.lastFoldedSeq === head && clientB.lastFoldedSeq === head,
          60_000,
        );

        // Zero thrown errors across the entire storm (both clients).
        expect(clientA.errors).toEqual([]);
        expect(clientB.errors).toEqual([]);

        // Both clients converge on an identical confirmed fold.
        expect(clientA.lastFoldedSeq).toBe(clientB.lastFoldedSeq);
        expect(GAME_ENGINE_CONFIG.hash(clientA.displayed as FoldState)).toBe(
          GAME_ENGINE_CONFIG.hash(clientB.displayed as FoldState),
        );

        // Dense seqs — no gaps, no duplicates.
        const node = await readLogNode(roomId);
        const liveCount = node.head - node.baseSeq;
        expect(node.events.size).toBe(liveCount);
        for (let seq = node.baseSeq + 1; seq <= node.head; seq++) {
          expect(node.events.has(seq)).toBe(true);
        }

        // This volume (2 setup + 220 storm events) exceeds COMPACT_THRESHOLD
        // (200), so compaction fired under real contention.
        expect(node.baseSeq).toBeGreaterThan(0);

        // A THIRD client joins fresh now, after compaction, and folds from the
        // persisted snapshot + appliedIndex. It must converge on the SAME
        // confirmed hash as the always-connected clients, proving the
        // below-horizon intervening windows resolve identically for the REAL
        // reducer, not just the toy one in scenario B.
        const clientC = makeRealClientHarness(database, roomId, "client-c");
        await waitFor(() => clientC.lastFoldedSeq === head, 60_000);
        expect(clientC.errors).toEqual([]);
        expect(GAME_ENGINE_CONFIG.hash(clientC.displayed as FoldState)).toBe(
          GAME_ENGINE_CONFIG.hash(clientA.displayed as FoldState),
        );

        clientA.client.close();
        clientB.client.close();
        clientC.client.close();
      },
      120_000,
    );
  });
});
