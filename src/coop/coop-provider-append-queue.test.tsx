// @vitest-environment jsdom

import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDraft, LogClient } from "../eventlog/client";

// The LogClient is created inside CoopProvider's effect. Mock it so the test
// controls timing precisely and never touches Firebase. `submit` records the
// drafts it receives and resolves with a fixed committed seq.
const submit = vi.fn<(draft: EventDraft) => Promise<number>>(() =>
  Promise.resolve(7),
);
const close = vi.fn();
const createLogClient = vi.fn<() => LogClient>(() => ({
  submit,
  clientId: "client-test",
  close,
}));

vi.mock("../eventlog/client", () => ({
  createLogClient: (...args: unknown[]) => createLogClient(...(args as [])),
}));
vi.mock("../eventlog/subscribe", () => ({ subscribeToLog: vi.fn(() => () => {}) }));
vi.mock("../eventlog/append", () => ({ appendEvent: vi.fn() }));
vi.mock("../rules/replay/replay", () => ({
  GAME_ENGINE_CONFIG: { genesisState: () => ({}) },
}));
// The presence subscription reaches for the real Firebase RTDB; stub it out so
// the fake `db` never hits Firebase internals.
vi.mock("firebase/database", () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => () => {}),
}));

import { CoopProvider, useAppend } from "./hooks";
import type { RoomReadyContext } from "./RoomGate";

/**
 * A child that appends a bootstrap event in its OWN mount effect. React flushes
 * child effects before the parent CoopProvider's client-creating effect, so at
 * this call the LogClient does not yet exist — exactly the `?startInBattle=1` /
 * `?goto=` bootstrap race.
 */
function BootstrapChild({
  onSeq,
}: {
  onSeq: (seq: number) => void;
}): null {
  const append = useAppend();
  useEffect(() => {
    void append({ type: "LOAD_STATE", payload: { snapshot: {} } }).then(onSeq);
  }, [append, onSeq]);
  return null;
}

describe("CoopProvider append queue", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    submit.mockClear();
    close.mockClear();
    createLogClient.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("flushes an append issued before the LogClient exists", async () => {
    const context: RoomReadyContext = {
      db: {} as RoomReadyContext["db"],
      roomId: "room-1",
      clientId: "client-test",
      genesis: { seed: "s", reducerVersion: "v", createdAt: 0 },
      logSink: {
        recordCoopEvent: () => false,
        recordBounce: () => {},
        recordDivergence: () => {},
      } as unknown as RoomReadyContext["logSink"],
    };

    let resolvedSeq: number | null = null;
    await act(async () => {
      root.render(
        <CoopProvider context={context}>
          <BootstrapChild onSeq={(seq) => (resolvedSeq = seq)} />
        </CoopProvider>,
      );
      // Let passive effects run (child append queued, parent client flushes it)
      // and the flushed submit's promise settle so `onSeq` fires.
      await Promise.resolve();
      await Promise.resolve();
    });

    // The child's pre-ready append was queued, then flushed once the client's
    // effect ran: submit saw the bootstrap draft and the promise resolved.
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ type: "LOAD_STATE" });
    expect(resolvedSeq).toBe(7);
  });
});
