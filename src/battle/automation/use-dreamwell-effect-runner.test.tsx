// @vitest-environment jsdom
//
// Coop double-dispatch regression harness for the Dreamwell effect runner.
//
// In a shared room EVERY connected client mounts this runner and reacts to the
// same synced battle state. A Dreamwell card's scripted edits (e.g. Twilight
// Radiance's flat "+1 current energy", which has no prompt) are authority
// mutations that must be applied EXACTLY ONCE. Before the ownership gate, both
// clients dispatched the edit, so a +1 card moved energy by +2 in a two-client
// game. These tests pin the invariant by counting how many times the authority
// edit reaches a SHARED command sink (standing in for the room) when two clients
// — one primary, one not — process the identical Dreamwell reveal.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDreamwellEffectRunner,
  type DreamwellRunnerArgs,
} from "./use-dreamwell-effect-runner";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, DreamwellCardDefinition } from "../types";

// The runner logs through `../../logging`; stub it so the hook has no side
// effects in jsdom and the tests observe only dispatched edits.
vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  createBattleLogBaseFields: vi.fn(() => ({})),
}));

// Twilight Radiance — a registered Dreamwell script of a single, flat
// "+1 current energy" edits step (no prompt), in DREAMWELL_EFFECTS.
const TWILIGHT_RADIANCE_ID = "de98477c-e216-4618-bff1-0e24bd982fdb";

const DREAMWELL_DECK: readonly DreamwellCardDefinition[] = [
  {
    id: TWILIGHT_RADIANCE_ID,
    name: "Twilight Radiance",
    renderedText: "+1 current energy.",
    energyAdded: 1,
    order: 1,
    cardNumber: 1,
    imageNumber: 1,
  },
];

/**
 * A battle state parked on the active side's turn-2 Dreamwell phase with
 * Twilight Radiance freshly drawn — exactly the shape that makes the runner's
 * start effect fire. The runner reads state but never mutates it (edits go to
 * the dispatch sink), so two clients can share one frozen state, which isolates
 * "how many times is the edit emitted" from any apply/sync behaviour.
 */
function makeDreamwellState(): BattleMutableState {
  const init = createBattleInit({
    battleEntryKey: "site-7::3::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    dreamwellCards: DREAMWELL_DECK,
    seedOverride: 1234,
  });
  const base = createInitialBattleState(init);
  return {
    ...base,
    turnNumber: 2,
    phase: "dreamwell",
    activeSide: "player",
    result: null,
    sides: {
      ...base.sides,
      player: {
        ...base.sides.player,
        dreamwellCardIndex: 0,
        dreamwellDrawnTurn: 2,
      },
    },
  };
}

const roots: Root[] = [];

function Host(props: DreamwellRunnerArgs): null {
  useDreamwellEffectRunner(props);
  return null;
}

function mount(props: DreamwellRunnerArgs): Root {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<Host {...props} />);
  });
  return root;
}

function energyEdits(sink: BattleDebugEdit[]): BattleDebugEdit[] {
  return sink.filter((edit) => edit.kind === "ADJUST_CURRENT_ENERGY");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("useDreamwellEffectRunner coop dispatch", () => {
  it("applies a no-prompt Dreamwell edit exactly once across two coop clients", () => {
    const sink: BattleDebugEdit[] = [];
    const dispatchEdit = (edit: BattleDebugEdit): void => {
      sink.push(edit);
    };
    const state = makeDreamwellState();
    const common = {
      enabled: true,
      state,
      dreamwellDeck: DREAMWELL_DECK,
      dispatchEdit,
      cancelPromptSignal: 0,
    };

    // Two clients react to the identical reveal; only the authority client may
    // apply the energy. Pre-fix this sink held two +1 edits (the 5/3 bug).
    mount({ ...common, isPrimaryClient: true });
    mount({ ...common, isPrimaryClient: false });

    const energy = energyEdits(sink);
    expect(energy).toHaveLength(1);
    expect(energy[0]).toMatchObject({
      kind: "ADJUST_CURRENT_ENERGY",
      side: "player",
      amount: 1,
    });
  });

  it("single-player (one primary client) still applies the edit once", () => {
    const sink: BattleDebugEdit[] = [];
    mount({
      enabled: true,
      state: makeDreamwellState(),
      dreamwellDeck: DREAMWELL_DECK,
      dispatchEdit: (edit) => {
        sink.push(edit);
      },
      isPrimaryClient: true,
      cancelPromptSignal: 0,
    });
    expect(energyEdits(sink)).toHaveLength(1);
  });

  it("a non-primary client does not dispatch the authority edit on its own", () => {
    const sink: BattleDebugEdit[] = [];
    mount({
      enabled: true,
      state: makeDreamwellState(),
      dreamwellDeck: DREAMWELL_DECK,
      dispatchEdit: (edit) => {
        sink.push(edit);
      },
      isPrimaryClient: false,
      cancelPromptSignal: 0,
    });
    expect(energyEdits(sink)).toHaveLength(0);
  });
});
