// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import type { BattleFieldSlotAddress } from "../types";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattlefieldGrid } from "./BattlefieldGrid";

function createState() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  const state = createInitialBattleState(battleInit);
  const reserveId = state.sides.player.hand.shift();
  const deployId = state.sides.player.hand.shift();
  if (reserveId === undefined || deployId === undefined) {
    throw new Error("expected opening hand cards");
  }
  state.sides.player.reserve.R1 = reserveId;
  state.sides.player.deployed.D0 = deployId;
  return state;
}

function mount(zone: "reserve" | "deployed"): {
  cardClicks: ReturnType<typeof vi.fn>;
  container: HTMLDivElement;
  root: Root;
  state: ReturnType<typeof createState>;
  slotClicks: ReturnType<typeof vi.fn>;
} {
  const state = createState();
  const cardClicks = vi.fn();
  const slotClicks = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattlefieldGrid
        side="player"
        zone={zone}
        state={state}
        canInteract
        handSelectionSide="player"
        pendingDragCardId={null}
        selectedCardId={zone === "reserve" ? state.sides.player.reserve.R1 : state.sides.player.deployed.D0}
        selectedSlot={null}
        selectionAnchor={{ side: "player", zone: "reserve", slotId: "R1" }}
        onCardClick={cardClicks}
        onCardContextMenu={() => undefined}
        onSlotClick={slotClicks as (target: BattleFieldSlotAddress, isOccupied: boolean) => void}
      />,
    );
  });

  return { cardClicks, container, root, state, slotClicks };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattlefieldGrid", () => {
  it("makes every battlefield card tile draggable and free of the reserved class even when canInteract is false", () => {
    const state = createState();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <BattlefieldGrid
          side="player"
          zone="reserve"
          state={state}
          canInteract={false}
          handSelectionSide={null}
          pendingDragCardId={null}
          selectedCardId={null}
          selectedSlot={null}
          selectionAnchor={null}
          onCardClick={() => undefined}
          onSlotClick={() => undefined}
        />,
      );
    });

    const cards = [...container.querySelectorAll<HTMLElement>("[data-battle-card-id]")];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.getAttribute("draggable")).toBe("true");
      expect(card.classList.contains("reserved")).toBe(false);
    }

    act(() => {
      root.unmount();
    });
  });

  it("renders the row shell, slot ids, selected card state, and support highlights", () => {
    const { container, root, state } = mount("deployed");
    const deployedCardId = state.sides.player.deployed.D0;

    expect(container.querySelector('[data-battle-region="player-deployed-row"]')).not.toBeNull();
    expect(container.querySelector('[data-slot-id="player-deployed-D0"]')).not.toBeNull();
    expect(container.querySelector('[data-slot-id="player-deployed-D3"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot-id="player-deployed-D0"] [data-battle-card-id]')?.textContent,
    ).toContain(state.cardInstances[deployedCardId!]?.definition.name ?? "");
    expect(
      container.querySelector('[data-slot-id="player-deployed-D0"]')?.getAttribute("data-battle-support-highlighted"),
    ).toBe("true");
    expect(
      container.querySelector('[data-slot-id="player-deployed-D1"]')?.getAttribute("data-battle-support-highlighted"),
    ).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("routes occupied clicks to onCardClick and empty clicks to onSlotClick", () => {
    const { cardClicks, container, root, slotClicks } = mount("reserve");
    const occupied = container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R1"]');
    const empty = container.querySelector<HTMLElement>('[data-slot-id="player-reserve-R4"]');

    if (occupied === null || empty === null) {
      throw new Error("expected reserve slots");
    }

    act(() => {
      occupied.click();
      empty.click();
    });

    expect(cardClicks).toHaveBeenCalledTimes(1);
    expect(slotClicks).toHaveBeenCalledWith(
      { side: "player", zone: "reserve", slotId: "R4" },
      false,
    );

    act(() => {
      root.unmount();
    });
  });
});
