// @vitest-environment jsdom

// Focused regression coverage for bounce diagnostics and player-facing copy.
// These tests drive a REAL LogClient through both a partner conflict and a
// domain-invalid action, then assert the cause, intervening seqs, log record,
// and toast message stay aligned.
//
// Harness pattern (fake IO on a microtask, mocked engine config) copied from
// coop-provider-append-queue.test.tsx.

import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BounceReason } from "../eventlog/types";
import type { AppendFn } from "./actions";
import {
  INVALID_ACTION_MESSAGE,
  PARTNER_CONFLICT_MESSAGE,
} from "./BounceToast";

interface FakeEvent {
  type: string;
  payload: Record<string, unknown>;
  actor: string;
  clientTimestamp: string;
  basedOnSeq: number;
  nonce?: string;
  stateHashAfter?: string;
}

const fake = vi.hoisted(() => {
  const genesis = {
    seed: "s",
    reducerVersion: "v",
    createdAt: 0,
    contentConfig: {
      poolVariant: "test",
      draftMode: "pool",
      fresh20PackSize: null,
      atlasFoldHash: "fixture-atlas-fold-hash",
      economyFoldHash: "a".repeat(64),
      opponentsFoldHash: "b".repeat(64),
      defaultStartingEssence: 17,
      dreamsignCap: 4,
    },
  };
  const committed: FakeEvent[] = [];
  let subscriber: ((node: unknown) => void) | null = null;

  function buildNode(): unknown {
    const events = new Map<number, FakeEvent>();
    committed.forEach((event, index) => events.set(index + 1, event));
    return {
      genesis,
      baseSeq: 0,
      baseSnapshot: null,
      head: committed.length,
      events,
      appliedIndex: new Map(),
    };
  }
  function deliver(): void {
    const node = buildNode();
    void Promise.resolve().then(() => subscriber?.(node));
  }
  return {
    genesis,
    subscribe(onNode: (node: unknown) => void): () => void {
      subscriber = onNode;
      deliver();
      return () => {
        subscriber = null;
      };
    },
    append(event: unknown): Promise<number> {
      committed.push(event as FakeEvent);
      const seq = committed.length;
      deliver();
      return Promise.resolve(seq);
    },
    reset(): void {
      committed.length = 0;
      subscriber = null;
    },
  };
});

vi.mock("../eventlog/subscribe", () => ({
  subscribeToLog: (
    _db: unknown,
    _roomId: unknown,
    onNode: (node: unknown) => void,
  ) => fake.subscribe(onNode),
}));
vi.mock("../eventlog/append", () => ({
  appendEvent: (
    _db: unknown,
    _roomId: unknown,
    _config: unknown,
    event: unknown,
  ) => fake.append(event),
}));
// A toy config whose reducer bounces via a genuine intervening-window rule (a
// cross-actor applied partner in the window), not a payload flag — so
// fold.ts's interveningSeqs comes from a real `computeIntervening` call.
vi.mock("../rules/replay/replay", () => ({
  GAME_ENGINE_CONFIG: {
    genesisState: () => ({ n: 0 }),
    reducer: (
      state: { n: number },
      event: { actor: string; type: string },
      ctx: { intervening: "unknown" | Array<{ actor: string }> },
    ) => {
      if (event.type === "INVALID") {
        return { state, outcome: "bounced", bounceReason: "invalid_action" };
      }
      if (
        ctx.intervening !== "unknown" &&
        ctx.intervening.some((e) => e.actor !== event.actor)
      ) {
        return { state, outcome: "bounced", bounceReason: "partner_conflict" };
      }
      return { state: { n: state.n + 1 }, outcome: "applied" };
    },
    encode: (state: unknown) => JSON.stringify(state),
    decode: (raw: string) => JSON.parse(raw) as unknown,
    hash: (state: unknown) => JSON.stringify(state),
  },
}));
vi.mock("firebase/database", () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => () => {}),
}));

import { CoopProvider, useAppend } from "./hooks";
import type { RoomReadyContext } from "./RoomGate";

const bounceCalls: Array<
  [number, readonly number[], BounceReason | undefined]
> = [];

function makeContext(): RoomReadyContext {
  return {
    db: {} as RoomReadyContext["db"],
    roomId: "room-1",
    clientId: "client-test",
    genesis: fake.genesis,
    logSink: {
      recordCoopEvent: (event: FakeEvent) => event.actor === "client-test",
      recordBounce: (
        seq: number,
        interveningSeqs: readonly number[],
        bounceReason?: BounceReason,
      ) => {
        bounceCalls.push([seq, interveningSeqs, bounceReason]);
      },
      recordDivergence: () => {},
    } as unknown as RoomReadyContext["logSink"],
  };
}

function CaptureAppend({
  onReady,
}: {
  onReady: (append: AppendFn) => void;
}): null {
  const append = useAppend();
  useEffect(() => onReady(append), [append, onReady]);
  return null;
}

describe("hooks.ts bounce diagnostics", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fake.reset();
    bounceCalls.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function settle(): Promise<void> {
    await act(async () => {
      for (let i = 0; i < 25; i++) {
        await Promise.resolve();
      }
    });
  }

  it("passes the real intervening seqs to recordBounce, not a hardcoded []", async () => {
    const holder: { append: AppendFn | null } = { append: null };
    await act(async () => {
      root.render(
        <CoopProvider context={makeContext()}>
          <CaptureAppend onReady={(fn) => (holder.append = fn)} />
        </CoopProvider>,
      );
      await Promise.resolve();
    });
    await settle();
    const append = holder.append;
    if (append === null) throw new Error("append was not captured");

    // Race, matching the real optimistic-echo-rollback scenario: the
    // partner's event is pushed to the log FIRST (committed as seq 1) but its
    // async node delivery has not landed yet, so this client's `lastFoldedSeq`
    // is still 0 when `append` stamps `basedOnSeq` on its own event —
    // committed as seq 2, based on seq 0. Once both deliveries land, seq 2's
    // intervening window is [1] (the applied partner), and the reducer's
    // cross-actor rule bounces it.
    await act(async () => {
      void fake.append({
        type: "T",
        payload: {},
        actor: "partner",
        clientTimestamp: "0",
        basedOnSeq: 0,
      });
      void append({ type: "T", payload: {} });
      await Promise.resolve();
    });
    await settle();

    expect(bounceCalls.length).toBeGreaterThan(0);
    const [seq, interveningSeqs, bounceReason] =
      bounceCalls[bounceCalls.length - 1];
    expect(seq).toBe(2);
    expect(interveningSeqs).toEqual([1]);
    expect(bounceReason).toBe("partner_conflict");
    expect(
      container.querySelector("[data-coop-bounce-toast]")?.textContent,
    ).toBe(PARTNER_CONFLICT_MESSAGE);
  });

  it("shows an invalid-action error without blaming a partner", async () => {
    const holder: { append: AppendFn | null } = { append: null };
    await act(async () => {
      root.render(
        <CoopProvider context={makeContext()}>
          <CaptureAppend onReady={(fn) => (holder.append = fn)} />
        </CoopProvider>,
      );
      await Promise.resolve();
    });
    await settle();
    const append = holder.append;
    if (append === null) throw new Error("append was not captured");

    await act(async () => {
      void append({ type: "INVALID", payload: {} });
      await Promise.resolve();
    });
    await settle();

    expect(bounceCalls).toEqual([[1, [], "invalid_action"]]);
    const toast = container.querySelector("[data-coop-bounce-toast]");
    expect(toast?.textContent).toBe(INVALID_ACTION_MESSAGE);
    expect(toast?.textContent).not.toContain("partner");
  });
});
