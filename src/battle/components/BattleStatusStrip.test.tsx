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
  state.sides.player.frontRank.F0 = deployedId;
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
  onSetEnergy: ReturnType<typeof vi.fn>;
  onSetScore: ReturnType<typeof vi.fn>;
  onIncreaseMaxEnergyAndFill: ReturnType<typeof vi.fn>;
  onDrawCard: ReturnType<typeof vi.fn>;
  onDreamwellDraw: ReturnType<typeof vi.fn>;
  onErode: ReturnType<typeof vi.fn>;
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
  const onIncreaseMaxEnergyAndFill = vi.fn();
  const onDrawCard = vi.fn();
  const onDreamwellDraw = vi.fn();
  const onErode = vi.fn();
  const onSetEnergy = vi.fn();
  const onSetScore = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function render() {
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
        onSetEnergy={onSetEnergy}
        onSetScore={onSetScore}
        onIncreaseMaxEnergyAndFill={onIncreaseMaxEnergyAndFill}
        onDrawCard={onDrawCard}
        onDreamwellDraw={onDreamwellDraw}
        onErode={onErode}
        onCloseSummary={onCloseSummary}
        onOpenSummary={onOpenSummary}
      />,
    );
  }

  act(render);

  return {
    container,
    onSetEnergy,
    onSetScore,
    onIncreaseMaxEnergyAndFill,
    onDrawCard,
    onDreamwellDraw,
    onErode,
    onCloseSummary,
    onOpenSummary,
    root,
  };
}

afterEach(() => {
  vi.useRealTimers();
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

    expect(onOpenSummary).not.toHaveBeenCalled();

    act(() => {
      container.querySelector<HTMLElement>('[data-battle-status-primary="player"]')
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(onOpenSummary).not.toHaveBeenCalled();

    act(() => {
      container.querySelector<HTMLElement>("[data-battle-status-dreamcaller-name]")
        ?.dispatchEvent(new Event("pointerenter"));
    });

    expect(onOpenSummary).not.toHaveBeenCalled();

    act(() => {
      container.querySelector<HTMLElement>("[data-battle-status-dreamcaller-thumb]")
        ?.dispatchEvent(new Event("pointerenter"));
    });

    expect(onOpenSummary).toHaveBeenCalledTimes(1);

    act(() => {
      container.querySelector<HTMLElement>("[data-battle-status-dreamcaller-thumb]")
        ?.dispatchEvent(new Event("pointerleave"));
    });

    expect(onCloseSummary).toHaveBeenCalledTimes(1);

    act(() => {
      container.querySelector<HTMLElement>("[data-battle-status-dreamcaller-name]")
        ?.dispatchEvent(new Event("pointerleave"));
    });

    expect(onCloseSummary).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("shows the hand-card count on the dreamcaller portrait", () => {
    const { container, root } = mount();
    const handCount = container.querySelector<HTMLElement>(
      '[data-battle-status-hand-count="player"]',
    );
    const thumb = container.querySelector('[data-battle-status-dreamcaller-thumb]');

    expect(handCount).not.toBeNull();
    expect(thumb?.contains(handCount)).toBe(true);
    // createState() deploys one opening-hand card, leaving the rest in hand.
    expect(handCount?.textContent).toContain("4");

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

  it("updates displayed stats immediately and commits debounced absolute values", () => {
    vi.useFakeTimers();
    const { container, onSetEnergy, onSetScore, root } = mount();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase your points"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease your energy"]')?.click();
    });

    expect(container.querySelector('[data-battle-stat="player:score"]')?.getAttribute("data-battle-value"))
      .toBe("10");
    expect(container.querySelector('[data-battle-stat="player:energy"]')?.getAttribute("data-battle-current-energy"))
      .toBe("1");
    expect(onSetScore).not.toHaveBeenCalled();
    expect(onSetEnergy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onSetScore).toHaveBeenCalledWith(10);
    expect(onSetEnergy).toHaveBeenCalledWith(1);

    act(() => {
      root.unmount();
    });
  });

  it("renders an energy refill button after the energy arrow controls", () => {
    const { container, onIncreaseMaxEnergyAndFill, root } = mount();
    const energyButtons = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-battle-stat="player:energy"] button'),
    ];

    expect(energyButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Decrease your energy",
      "Increase your energy",
      "Increase your maximum energy and refill energy",
    ]);

    act(() => {
      energyButtons[2]?.click();
    });

    expect(onIncreaseMaxEnergyAndFill).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("clears pending local energy commits when refilling energy", () => {
    vi.useFakeTimers();
    const { container, onSetEnergy, onIncreaseMaxEnergyAndFill, root } = mount();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Decrease your energy"]')?.click();
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Increase your maximum energy and refill energy"]')
        ?.click();
      vi.advanceTimersByTime(250);
    });

    expect(onIncreaseMaxEnergyAndFill).toHaveBeenCalledTimes(1);
    expect(onSetEnergy).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("ignores external stat updates for ten seconds after a local edit", () => {
    vi.useFakeTimers();
    const state = createState();
    const onSetEnergy = vi.fn();
    const onSetScore = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = () => root.render(
      <BattleStatusStrip
        side="player"
        sideState={state.sides.player}
        subtitle=""
        title="Aeris"
        isActive
        onSetEnergy={onSetEnergy}
        onSetScore={onSetScore}
        onIncreaseMaxEnergyAndFill={vi.fn()}
        onDrawCard={vi.fn()}
        onDreamwellDraw={vi.fn()}
        onErode={vi.fn()}
        onCloseSummary={vi.fn()}
        onOpenSummary={vi.fn()}
      />,
    );

    act(render);
    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Increase your points"]')?.click();
    });

    state.sides.player.score = 99;
    act(render);

    expect(container.querySelector('[data-battle-stat="player:score"]')?.getAttribute("data-battle-value"))
      .toBe("10");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(container.querySelector('[data-battle-stat="player:score"]')?.getAttribute("data-battle-value"))
      .toBe("99");

    act(() => {
      root.unmount();
    });
  });

  it("erodes the chosen count from the side's deck", () => {
    const { container, onErode, root } = mount();
    const erodeButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-action="status-erode-player"]',
    );

    expect(erodeButton).not.toBeNull();
    // The count defaults to 1 so the first erode moves a single card.
    expect(erodeButton?.textContent).toContain("Erode 1");

    act(() => {
      erodeButton?.click();
    });

    expect(onErode).toHaveBeenCalledTimes(1);
    expect(onErode).toHaveBeenCalledWith(1);

    act(() => {
      root.unmount();
    });
  });

  it("steps the erode count and erodes that many cards", () => {
    const { container, onErode, root } = mount();
    const increase = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase erode count for you"]',
    );
    const decrease = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease erode count for you"]',
    );

    act(() => {
      increase?.click();
      increase?.click();
    });

    const erodeButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-action="status-erode-player"]',
    );
    expect(erodeButton?.textContent).toContain("Erode 3");

    act(() => {
      erodeButton?.click();
    });

    expect(onErode).toHaveBeenCalledWith(3);

    // The count never drops below 1.
    act(() => {
      decrease?.click();
      decrease?.click();
      decrease?.click();
      decrease?.click();
    });

    expect(erodeButton?.textContent).toContain("Erode 1");

    act(() => {
      root.unmount();
    });
  });

  it("fires the Dreamwell-draw callback from the side-scoped button", () => {
    const { container, onDreamwellDraw, root } = mount();
    const dreamwellButton = container.querySelector<HTMLButtonElement>(
      '[data-battle-action="status-dreamwell-draw-player"]',
    );

    expect(dreamwellButton?.textContent).toContain("Dreamwell + draw");

    act(() => {
      dreamwellButton?.click();
    });

    expect(onDreamwellDraw).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
