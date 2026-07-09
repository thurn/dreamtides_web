// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSingleFlight } from "./hooks";

// Mounts `useSingleFlight` under a probe component and exposes the wrapped
// function so a test can invoke it directly (the wrapper is stable across
// renders, so the captured reference stays valid).

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mountSingleFlight(
  fn: (...args: unknown[]) => Promise<number>,
): (...args: unknown[]) => Promise<number | null> {
  let latest: (...args: unknown[]) => Promise<number | null> = () =>
    Promise.resolve(null);
  function Probe(): null {
    latest = useSingleFlight(fn);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  return (...args: unknown[]) => latest(...args);
}

describe("useSingleFlight", () => {
  it("fires once while in flight; a second call resolves to null without re-firing", async () => {
    let calls = 0;
    const resolvers: Array<(seq: number) => void> = [];
    const fn = (): Promise<number> => {
      calls += 1;
      return new Promise<number>((resolve) => {
        resolvers.push(resolve);
      });
    };

    const wrapped = mountSingleFlight(fn);

    const first = wrapped();
    const second = wrapped();

    // Only one underlying append fired; the in-flight second call short-circuits.
    expect(calls).toBe(1);
    await expect(second).resolves.toBeNull();

    // Settle the in-flight call; the wrapper re-arms.
    await act(async () => {
      resolvers[0](7);
      await first;
    });
    expect(await first).toBe(7);
    expect(calls).toBe(1);

    // A fresh call now fires again and forwards the underlying seq.
    const third = wrapped();
    expect(calls).toBe(2);
    await act(async () => {
      resolvers[1](9);
      await third;
    });
    expect(await third).toBe(9);
  });

  it("re-arms after the in-flight action rejects", async () => {
    let calls = 0;
    const rejecters: Array<(error: unknown) => void> = [];
    const resolvers: Array<(seq: number) => void> = [];
    const fn = (): Promise<number> =>
      new Promise<number>((resolve, reject) => {
        calls += 1;
        resolvers.push(resolve);
        rejecters.push(reject);
      });

    const wrapped = mountSingleFlight(fn);
    const first = wrapped();
    expect(calls).toBe(1);

    await act(async () => {
      rejecters[0](new Error("append failed"));
      await first.catch(() => undefined);
    });

    // The rejection re-armed the gate: a fresh call fires again.
    const second = wrapped();
    expect(calls).toBe(2);
    await act(async () => {
      resolvers[1](3);
      await second;
    });
    expect(await second).toBe(3);
  });
});
