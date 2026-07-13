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
import { CumulusRoot } from "../../cumulus/CumulusRoot";

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
  state.sides.player.backRank.B1 = reserveId;
  state.sides.player.frontRank.F0 = deployId;
  return state;
}

function mount(zone: "backRank" | "frontRank"): {
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
      <CumulusRoot><BattlefieldGrid
        side="player"
        zone={zone}
        state={state}
        canInteract
        handSelectionSide="player"
        pendingDragCardId={null}
        selectedCardId={zone === "backRank" ? state.sides.player.backRank.B1 : state.sides.player.frontRank.F0}
        selectedSlot={null}
        selectionAnchor={{ side: "player", zone: "backRank", slotId: "B1" }}
        onCardClick={cardClicks}
        onCardContextMenu={() => undefined}
        onSlotClick={slotClicks as (target: BattleFieldSlotAddress, isOccupied: boolean) => void}
      /></CumulusRoot>,
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
  it("gives an occupied slot one activation owner for mouse, keyboard, and touch", () => {
    const state = createState();
    const battleCardId = state.sides.player.frontRank.F0;
    if (battleCardId === null) throw new Error("expected occupied fixture slot");
    const original = state.cardInstances[battleCardId];
    state.cardInstances[battleCardId] = { ...original, definition: { ...original.definition,
      cardId: "11111111-1111-4111-8111-111111111111" } };
    const cardClicks = vi.fn();
    const slotClicks = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><BattlefieldGrid side="player" zone="frontRank" state={state}
      canInteract handSelectionSide={null} pendingDragCardId={null} selectedCardId={null}
      selectedSlot={null} selectionAnchor={null} onCardClick={cardClicks} onSlotClick={slotClicks} /></CumulusRoot>));
    const source = container.querySelector<HTMLElement>(`[data-battle-card-id="${battleCardId}"] [data-game-card-source]`);
    expect(source).not.toBeNull();
    expect(source?.closest("button")).toBeNull();

    act(() => { source?.click(); });
    expect(cardClicks).toHaveBeenCalledTimes(1);
    cardClicks.mockClear();
    act(() => { source?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(cardClicks).toHaveBeenCalledTimes(1);
    cardClicks.mockClear();
    act(() => { source?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 4 })); });
    act(() => { source?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 4 })); });
    expect(cardClicks).toHaveBeenCalledTimes(1);
    expect(slotClicks).not.toHaveBeenCalled();
    act(() => root.unmount()); container.remove();
  });

  it("makes battlefield card tiles non-draggable and slots inert when canInteract is false", () => {
    // canInteract is false while the AI holds an un-approved action proposal: the
    // human must not free-edit the board, only drive the turn via the proposal
    // bar.
    const state = createState();
    const cardDragStart = vi.fn();
    const slotDrop = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot><BattlefieldGrid
          side="player"
          zone="backRank"
          state={state}
          canInteract={false}
          handSelectionSide={null}
          pendingDragCardId={null}
          selectedCardId={null}
          selectedSlot={null}
          selectionAnchor={null}
          onCardClick={() => undefined}
          onCardDragStart={cardDragStart}
          onSlotClick={() => undefined}
          onSlotDrop={slotDrop}
        /></CumulusRoot>,
      );
    });

    const cards = [...container.querySelectorAll<HTMLElement>("[data-battle-card-id]")];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.getAttribute("draggable")).toBe("false");
      expect(card.classList.contains("reserved")).toBe(false);
    }

    // Dropping onto a slot is inert: the drop handler must not fire a board edit.
    const slots = [...container.querySelectorAll<HTMLElement>("[data-slot-id]")];
    expect(slots.length).toBeGreaterThan(0);
    act(() => {
      slots[0]?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });
    expect(slotDrop).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("renders the row shell, slot ids, selected card state, and support highlights", () => {
    const { container, root, state } = mount("frontRank");
    const deployedCardId = state.sides.player.frontRank.F0;

    // The play area is dynamic; with one front occupant it renders the 2-slot
    // minimum front rank (F0, F1). Slots beyond the active size are not rendered.
    expect(container.querySelector('[data-battle-region="player-frontRank-row"]')).not.toBeNull();
    expect(container.querySelector('[data-slot-id="player-frontRank-F0"]')).not.toBeNull();
    expect(container.querySelector('[data-slot-id="player-frontRank-F1"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot-id="player-frontRank-F0"] [data-battle-card-id]')?.textContent,
    ).toContain(state.cardInstances[deployedCardId!]?.definition.name ?? "");
    expect(
      container.querySelector('[data-slot-id="player-frontRank-F0"]')?.getAttribute("data-battle-support-highlighted"),
    ).toBe("true");
    expect(
      container.querySelector('[data-slot-id="player-frontRank-F1"]')?.getAttribute("data-battle-support-highlighted"),
    ).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("routes occupied clicks to onCardClick and empty clicks to onSlotClick", () => {
    const { cardClicks, container, root, slotClicks } = mount("backRank");
    // With B1 occupied the back rank renders its 3-slot minimum (B0, B1, B2);
    // B2 is an empty rendered slot.
    const occupied = container.querySelector<HTMLElement>(
      '[data-slot-id="player-backRank-B1"] [data-battle-card-id]',
    );
    const activationSource = occupied?.querySelector<HTMLElement>("[data-game-card-source]");
    const empty = container.querySelector<HTMLElement>('[data-slot-id="player-backRank-B2"]');

    if (occupied === null || activationSource === undefined || activationSource === null || empty === null) {
      throw new Error("expected reserve slots");
    }

    act(() => {
      activationSource.click();
      empty.click();
    });

    expect(cardClicks).toHaveBeenCalledTimes(1);
    expect(slotClicks).toHaveBeenCalledWith(
      { side: "player", zone: "backRank", slotId: "B2" },
      false,
    );

    act(() => {
      root.unmount();
    });
  });
});
