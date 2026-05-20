// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleStatusStrip } from "./BattleStatusStrip";

function createState() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  const state = createInitialBattleState(battleInit);
  const deployedId = state.sides.player.hand.shift();
  if (deployedId === undefined) {
    throw new Error("expected opening hand card");
  }
  state.sides.player.deployed.D0 = deployedId;
  const deployedCard = state.cardInstances[deployedId];
  if (deployedCard === undefined) {
    throw new Error("expected deployed card instance");
  }
  deployedCard.sparkDelta = 1;
  state.sides.player.currentEnergy = 2;
  state.sides.player.maxEnergy = 4;
  state.sides.player.score = 9;
  return state;
}

function mount(withBanished = false): {
  container: HTMLDivElement;
  onOpenZone: ReturnType<typeof vi.fn>;
  onSelectSummary: ReturnType<typeof vi.fn>;
  root: Root;
} {
  const state = createState();
  if (withBanished) {
    const banishedId = state.sides.player.deck.pop();
    if (banishedId !== undefined) {
      state.sides.player.banished.push(banishedId);
    }
  }
  const onOpenZone = vi.fn();
  const onSelectSummary = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleStatusStrip
        side="player"
        sideState={state.sides.player}
        state={state}
        subtitle=""
        title="Aeris"
        isActive
        onOpenZone={onOpenZone}
        onSelectSummary={onSelectSummary}
      />,
    );
  });

  return { container, onOpenZone, onSelectSummary, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleStatusStrip", () => {
  it("renders compact combat state and keeps browseable zones in incidental details", () => {
    const { container, onOpenZone, onSelectSummary, root } = mount();
    const primaryStats = container.querySelector('[data-battle-status-primary="player"]');
    const incidentalStats = container.querySelector('[data-battle-status-incidental="player"]');

    expect(container.textContent).toContain("You");
    expect(primaryStats?.textContent).toContain("PTS");
    expect(primaryStats?.textContent).toContain("E");
    expect(primaryStats?.textContent).toContain("9");
    expect(primaryStats?.textContent).toContain("2/4");
    expect(primaryStats?.textContent).not.toContain("H");
    expect(primaryStats?.textContent).not.toContain("D");
    expect(primaryStats?.textContent).not.toContain("V");
    expect(primaryStats?.textContent).not.toContain("B");
    expect(incidentalStats?.textContent).toContain("◆");
    expect(incidentalStats?.textContent).toContain("H");
    expect(incidentalStats?.textContent).toContain("D");
    expect(incidentalStats?.textContent).toContain("V");
    expect(incidentalStats?.textContent).toContain("B");
    expect(incidentalStats?.textContent).toContain("3");

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-side-summary="player"]')?.click();
      container.querySelector<HTMLElement>('[data-battle-zone-open="player:hand"]')?.click();
      container.querySelector<HTMLElement>('[data-battle-zone-open="player:deck"]')?.click();
      container.querySelector<HTMLElement>('[data-battle-zone-open="player:void"]')?.click();
      container.querySelector<HTMLElement>('[data-battle-zone-open="player:banished"]')?.click();
    });

    expect(onSelectSummary).toHaveBeenCalledTimes(1);
    expect(onOpenZone.mock.calls).toEqual([["hand"], ["deck"], ["void"], ["banished"]]);

    act(() => {
      root.unmount();
    });
  });

  it("shows the banished chip count when the side has banished cards", () => {
    const { container, onOpenZone, root } = mount(true);

    expect(container.textContent).toContain("B");

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-zone-open="player:banished"]')?.click();
    });

    expect(onOpenZone).toHaveBeenCalledWith("banished");

    act(() => {
      root.unmount();
    });
  });
});
