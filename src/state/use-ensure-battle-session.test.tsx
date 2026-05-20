// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Database } from "firebase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEnsureBattleSession } from "./use-ensure-battle-session";
import * as battleService from "../multiplayer/battle-service";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";

vi.mock("../multiplayer/battle-service", async () => {
  const actual = await vi.importActual<typeof import("../multiplayer/battle-service")>(
    "../multiplayer/battle-service",
  );
  return {
    ...actual,
    ensureBattleSession: vi.fn(() => Promise.resolve(undefined)),
  };
});

const roots: Root[] = [];

function makeFakeBattleState(): SharedBattleState {
  const init = createBattleInit({
    battleEntryKey: "site-7::3::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    seedOverride: 1234,
  });
  const initial = createInitialBattleState(init);
  return {
    init,
    reducer: {
      mutable: initial,
      history: { past: [], future: [] },
      lastTransition: null,
      commandSerial: 0,
      lastActivityKind: null,
    },
  };
}

interface HostProps {
  battleState: SharedBattleState | null;
  battleEntryKey: string;
}

function Host({ battleState, battleEntryKey }: HostProps): ReactNode {
  useEnsureBattleSession({
    database: {} as Database,
    roomId: "room-1",
    clientId: "client-a",
    battleState,
    battleEntryKey,
    site: makeBattleTestSite(),
    questState: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    seedOverride: 1234,
  });
  return null;
}

function mount(props: HostProps): Root {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<Host {...props} />);
  });
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
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

describe("useEnsureBattleSession", () => {
  it("calls ensureBattleSession exactly once when battleState starts null", () => {
    mount({ battleState: null, battleEntryKey: "site-7::3::dreamscape-2" });
    expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(1);
  });

  it("does not call ensureBattleSession when battleState is already populated", () => {
    mount({
      battleState: makeFakeBattleState(),
      battleEntryKey: "site-7::3::dreamscape-2",
    });
    expect(battleService.ensureBattleSession).not.toHaveBeenCalled();
  });

  it(
    "does not re-fire when battleState transitions populated -> cleared while the same entry key is still mounted (defeat-clear race)",
    () => {
      const fake = makeFakeBattleState();
      const root = mount({
        battleState: null,
        battleEntryKey: "site-7::3::dreamscape-2",
      });

      // First render: null -> ensureBattleSession fires once.
      expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(1);

      // Server confirms by populating battleState.
      act(() => {
        root.render(
          <Host battleState={fake} battleEntryKey="site-7::3::dreamscape-2" />,
        );
      });
      // No additional fire when populated.
      expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(1);

      // Defeat path: clearBattleStateInRoom zeros the slot, but the screen-flip
      // write from setScreen({type:"questFailed"}) has not yet been delivered
      // to this client, so BattleSiteRoute is still mounted with the same
      // battleEntryKey. The hook MUST NOT re-issue ensureBattleSession.
      act(() => {
        root.render(
          <Host battleState={null} battleEntryKey="site-7::3::dreamscape-2" />,
        );
      });
      expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(1);
    },
  );

  it("fires for a new battleEntryKey even after a previous successful ensure", () => {
    const fake = makeFakeBattleState();
    const root = mount({
      battleState: null,
      battleEntryKey: "site-7::3::dreamscape-2",
    });
    expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <Host battleState={fake} battleEntryKey="site-7::3::dreamscape-2" />,
      );
    });
    expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(1);

    // A new battle is reached (different completion level / dreamscape) and
    // the slot is null again. The hook should ensure for the new key.
    act(() => {
      root.render(
        <Host battleState={null} battleEntryKey="site-9::4::dreamscape-3" />,
      );
    });
    expect(battleService.ensureBattleSession).toHaveBeenCalledTimes(2);
  });
});
