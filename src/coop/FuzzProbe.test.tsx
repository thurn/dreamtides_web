import { testJourneySeed } from "../types/test-identities";
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genesisFoldState } from "../rules/fold-state";

const state = genesisFoldState({
  seed: testJourneySeed("probe"),
  reducerVersion: "test",
  createdAt: 0,
});

vi.mock("./hooks", () => ({
  useClientId: () => "probe-client",
  useConfirmedHead: () => 7,
  useGameState: () => state,
  useConfirmedGameState: () => state,
}));

const { FuzzProbe } = await import("./FuzzProbe");

describe("FuzzProbe", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubEnv("VITE_FUZZ_TEST", "1");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete window.__questFuzzProbe;
    vi.unstubAllEnvs();
  });

  it("exposes copied fold state and stable client diagnostics", () => {
    act(() => root.render(<FuzzProbe />));

    const snapshot = window.__questFuzzProbe?.snapshot();
    expect(snapshot).toMatchObject({
      clientId: "probe-client",
      confirmedHead: 7,
      frontDoorPhase: "journey",
      screenType: "journeyStart",
      controllerClientId: null,
      battleId: null,
    });
    expect(snapshot?.displayedHash).toBe(snapshot?.confirmedHash);
    expect(snapshot?.confirmedState).not.toBe(state);

    if (snapshot !== undefined) {
      const copy = snapshot.confirmedState as unknown as {
        journey: { essence: number };
      };
      copy.journey.essence = 0;
    }
    expect(state.journey.essence).toBe(200);
  });
});
