// @vitest-environment jsdom
//
// Coop double-dispatch regression harness for the persistent-board effect runner
// (▸Materialized / ▸Dawn / Support).
//
// As with the Dreamwell runner, every connected client mounts this runner and
// reacts to the same synced board. A ▸Materialized script's flat edits (here
// Ashwalker's "Erode 3", which has no prompt) are authority mutations that must
// apply EXACTLY ONCE. Before the ownership gate both clients dispatched them, so
// the effect doubled in a two-client game. These tests drive a real board-diff
// (seed an empty board, then materialize the card) across two clients — one
// primary, one not — and assert the authority edit reaches a SHARED command sink
// exactly once.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBattleEffectRunner,
  type BattleEffectRunnerArgs,
} from "./use-battle-effect-runner";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleCardInstance, BattleMutableState } from "../types";

// The runner logs through `../../logging`; stub it so the hook has no side
// effects in jsdom and the tests observe only dispatched edits.
vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  createBattleLogBaseFields: vi.fn(() => ({})),
}));

// Ashwalker — a registered ▸Materialized script of a single, flat "Erode 3"
// edits step (no prompt), in BATTLE_CARD_EFFECTS.
const ASHWALKER_ID = "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40";
const ASHWALKER_INSTANCE_ID = "ashwalker-instance-1";

function makeBaseState(): BattleMutableState {
  const init = createBattleInit({
    battleEntryKey: "site-7::3::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    dreamwellCards: [],
    seedOverride: 1234,
  });
  // Phase `dreamwell` keeps the interactive-Dawn scan inert (it requires a
  // post-Dawn phase); the ▸Materialized board-diff fires regardless of phase.
  return {
    ...createInitialBattleState(init),
    turnNumber: 2,
    phase: "dreamwell",
    activeSide: "player",
    result: null,
  };
}

/**
 * A clone of a real opening-hand instance — so every `BattleCardInstance` field
 * is well-formed for the Support recompute — re-pointed at Ashwalker's card id.
 */
function makeAshwalkerInstance(base: BattleMutableState): BattleCardInstance {
  const template = Object.values(base.cardInstances)[0];
  if (template === undefined) {
    throw new Error("expected the initial state to seed opening-hand instances");
  }
  return {
    ...template,
    battleCardId: ASHWALKER_INSTANCE_ID,
    owner: "player",
    controller: "player",
    definition: { ...template.definition, cardId: ASHWALKER_ID },
  };
}

/** `base` with Ashwalker placed into the player's first back-rank slot. */
function withAshwalkerInPlay(base: BattleMutableState): BattleMutableState {
  const slot = Object.keys(base.sides.player.backRank)[0];
  return {
    ...base,
    sides: {
      ...base.sides,
      player: {
        ...base.sides.player,
        backRank: { ...base.sides.player.backRank, [slot]: ASHWALKER_INSTANCE_ID },
      },
    },
    cardInstances: {
      ...base.cardInstances,
      [ASHWALKER_INSTANCE_ID]: makeAshwalkerInstance(base),
    },
  };
}

const roots: Root[] = [];

function Host(props: BattleEffectRunnerArgs): null {
  useBattleEffectRunner(props);
  return null;
}

interface ClientHandle {
  root: Root;
  render: (props: BattleEffectRunnerArgs) => void;
}

function mount(props: BattleEffectRunnerArgs): ClientHandle {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<Host {...props} />);
  });
  return {
    root,
    render: (next) => {
      act(() => {
        root.render(<Host {...next} />);
      });
    },
  };
}

function erodeEdits(sink: BattleDebugEdit[]): BattleDebugEdit[] {
  return sink.filter((edit) => edit.kind === "ERODE");
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

function baseArgs(
  state: BattleMutableState,
  dispatchEdit: (edit: BattleDebugEdit) => void,
  isPrimaryClient: boolean,
): BattleEffectRunnerArgs {
  return { enabled: true, state, dispatchEdit, isPrimaryClient, cancelPromptSignal: 0 };
}

describe("useBattleEffectRunner coop dispatch", () => {
  it("applies a ▸Materialized edit exactly once across two coop clients", () => {
    const sink: BattleDebugEdit[] = [];
    const dispatchEdit = (edit: BattleDebugEdit): void => {
      sink.push(edit);
    };
    const empty = makeBaseState();
    const populated = withAshwalkerInPlay(empty);

    // Both clients first observe the empty board (seeds the in-play set without
    // firing), then both observe Ashwalker materialize.
    const primary = mount(baseArgs(empty, dispatchEdit, true));
    const partner = mount(baseArgs(empty, dispatchEdit, false));
    primary.render(baseArgs(populated, dispatchEdit, true));
    partner.render(baseArgs(populated, dispatchEdit, false));

    const erode = erodeEdits(sink);
    expect(erode).toHaveLength(1);
    expect(erode[0]).toMatchObject({ kind: "ERODE", side: "player", count: 3 });
  });

  it("single-player (one primary client) still applies the ▸Materialized edit once", () => {
    const sink: BattleDebugEdit[] = [];
    const dispatchEdit = (edit: BattleDebugEdit): void => {
      sink.push(edit);
    };
    const empty = makeBaseState();
    const client = mount(baseArgs(empty, dispatchEdit, true));
    client.render(baseArgs(withAshwalkerInPlay(empty), dispatchEdit, true));
    expect(erodeEdits(sink)).toHaveLength(1);
  });

  it("a non-primary client does not dispatch the ▸Materialized edit on its own", () => {
    const sink: BattleDebugEdit[] = [];
    const dispatchEdit = (edit: BattleDebugEdit): void => {
      sink.push(edit);
    };
    const empty = makeBaseState();
    const client = mount(baseArgs(empty, dispatchEdit, false));
    client.render(baseArgs(withAshwalkerInPlay(empty), dispatchEdit, false));
    expect(erodeEdits(sink)).toHaveLength(0);
  });
});
