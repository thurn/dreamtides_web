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
  onAdjustEnergy: ReturnType<typeof vi.fn>;
  onAdjustScore: ReturnType<typeof vi.fn>;
  onCloseSummary: ReturnType<typeof vi.fn>;
  onOpenSummary: ReturnType<typeof vi.fn>;
  root: Root;
} {
  const state = createState();
  if (withBanished) {
    const banishedId = state.sides.player.deck.pop();
    if (banishedId !== undefined) {
      state.sides.player.banished.push(banishedId);
    }
  }
  const onCloseSummary = vi.fn();
  const onOpenSummary = vi.fn();
  const onAdjustEnergy = vi.fn();
  const onAdjustScore = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleStatusStrip
        dreamcaller={{
          id: "aeris",
          imageNumber: "01",
          name: "Aeris",
          renderedText: "Gain a fleeting advantage.",
          title: "Storm Archivist",
        }}
        side="player"
        sideState={state.sides.player}
        subtitle=""
        title="Aeris"
        isActive
        onAdjustEnergy={onAdjustEnergy}
        onAdjustScore={onAdjustScore}
        onCloseSummary={onCloseSummary}
        onOpenSummary={onOpenSummary}
      />,
    );
  });

  return { container, onAdjustEnergy, onAdjustScore, onCloseSummary, onOpenSummary, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleStatusStrip", () => {
  it("renders compact combat state without browseable zone counts", () => {
    const { container, onCloseSummary, onOpenSummary, root } = mount();
    const primaryStats = container.querySelector('[data-battle-status-primary="player"]');
    const summaryTrigger = container.querySelector<HTMLElement>('[data-battle-side-summary="player"]');

    expect(container.textContent).toContain("You");
    expect(container.querySelector("[data-battle-status-dreamcaller-thumb]")).not.toBeNull();
    expect(primaryStats?.textContent).toContain("PTS");
    expect(primaryStats?.textContent).toContain("E");
    expect(primaryStats?.textContent).toContain("9");
    expect(primaryStats?.textContent).toContain("2/4");
    expect(primaryStats?.textContent).not.toContain("H");
    expect(primaryStats?.textContent).not.toContain("D");
    expect(primaryStats?.textContent).not.toContain("V");
    expect(primaryStats?.textContent).not.toContain("B");
    expect(container.querySelector('[data-battle-status-incidental="player"]')).toBeNull();
    expect(container.querySelector('[data-battle-zone-open="player:hand"]')).toBeNull();
    expect(container.querySelector('[data-battle-zone-open="player:deck"]')).toBeNull();
    expect(container.querySelector('[data-battle-zone-open="player:void"]')).toBeNull();
    expect(container.querySelector('[data-battle-zone-open="player:banished"]')).toBeNull();

    act(() => {
      summaryTrigger?.click();
    });

    expect(onOpenSummary).not.toHaveBeenCalled();

    act(() => {
      summaryTrigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(onOpenSummary).toHaveBeenCalledTimes(1);

    act(() => {
      summaryTrigger?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    expect(onCloseSummary).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("shows the banished chip count when the side has banished cards", () => {
    const { container, root } = mount(true);

    expect(container.querySelector('[data-battle-zone-open="player:banished"]')).toBeNull();
    expect(container.textContent).not.toContain("B");

    act(() => {
      root.unmount();
    });
  });

  it("calls stat adjusters from the score and energy arrow controls", () => {
    const { container, onAdjustEnergy, onAdjustScore, root } = mount();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease your points"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase your points"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease your energy"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase your energy"]')?.click();
    });

    expect(onAdjustScore).toHaveBeenNthCalledWith(1, -1);
    expect(onAdjustScore).toHaveBeenNthCalledWith(2, 1);
    expect(onAdjustEnergy).toHaveBeenNthCalledWith(1, -1);
    expect(onAdjustEnergy).toHaveBeenNthCalledWith(2, 1);

    act(() => {
      root.unmount();
    });
  });
});
