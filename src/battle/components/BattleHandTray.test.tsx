// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleHandTray } from "./BattleHandTray";
import { TangoRoot } from "../../tango/TangoRoot";

function renderWithTango(root: Root, element: ReactElement): void { root.render(<TangoRoot>{element}</TangoRoot>); }

function createState() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  const state = createInitialBattleState(battleInit);
  state.sides.player.currentEnergy = 1;
  return state;
}

function mount(): {
  clickCard: ReturnType<typeof vi.fn>;
  container: HTMLDivElement;
  contextMenu: ReturnType<typeof vi.fn>;
  doubleClickCard: ReturnType<typeof vi.fn>;
  root: Root;
  state: ReturnType<typeof createState>;
} {
  const state = createState();
  const clickCard = vi.fn();
  const contextMenu = vi.fn();
  const doubleClickCard = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    renderWithTango(root,
      <BattleHandTray
        canInteract
        currentEnergy={state.sides.player.currentEnergy}
        hand={state.sides.player.hand.slice(0, 2)}
        onHandCardAction={() => undefined}
        openingHandSize={5}
        playerDrawSkipsTurnOne
        selectedCardId={state.sides.player.hand[0] ?? null}
        state={state}
        onCardClick={clickCard}
        onCardContextMenu={contextMenu}
        onCardDoubleClick={doubleClickCard}
      />,
    );
  });

  return { clickCard, container, contextMenu, doubleClickCard, root, state };
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

describe("BattleHandTray", () => {
  it("renders one mockup card per hand entry without affordability dimming", () => {
    const { container, root, state } = mount();
    const cards = [...container.querySelectorAll<HTMLElement>("[data-battle-card-id]")];
    const firstCardId = state.sides.player.hand[0];
    const secondCardId = state.sides.player.hand[1];

    if (firstCardId === undefined || secondCardId === undefined) {
      throw new Error("expected opening hand cards");
    }

    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain(state.cardInstances[firstCardId]?.definition.name ?? "");
    expect(cards[1]?.textContent).toContain(state.cardInstances[secondCardId]?.definition.name ?? "");
    expect(cards[0]?.classList.contains("selected")).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it("never dims or disables hand cards regardless of energy or phase", () => {
    // Render with energy=0 so any card with cost > 0 would normally be unaffordable.
    const { container, root, state } = mount();
    // Force at least one card to have a cost exceeding available energy.
    const secondCardId = state.sides.player.hand[1];
    if (secondCardId === undefined) {
      throw new Error("expected second hand card");
    }
    const card = state.cardInstances[secondCardId];
    if (card === undefined) {
      throw new Error("expected card instance");
    }
    card.definition = { ...card.definition, energyCost: 99 };

    // Re-render with the mutated state so the overpriced card is in the tray.
    act(() => {
      renderWithTango(root,
        <BattleHandTray
          canInteract
          currentEnergy={0}
          hand={state.sides.player.hand.slice(0, 2)}
          onHandCardAction={() => undefined}
          openingHandSize={5}
          playerDrawSkipsTurnOne
          selectedCardId={null}
          state={state}
          onCardClick={() => undefined}
          onCardDoubleClick={() => undefined}
        />,
      );
    });

    const cards = [...container.querySelectorAll<HTMLElement>("[data-battle-card-id]")];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.classList.contains("unaffordable")).toBe(false);
      expect(card.classList.contains("playable")).toBe(false);
      expect(card.getAttribute("draggable")).toBe("true");
    }

    act(() => {
      root.unmount();
    });
  });

  it("makes hand cards non-draggable and inert when canInteract is false", () => {
    // canInteract is false while the AI holds an un-approved action proposal: the
    // human must drive the turn only via the proposal bar, not by free-editing
    // their own hand.
    const state = createState();
    const clickCard = vi.fn();
    const doubleClickCard = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      renderWithTango(root,
        <BattleHandTray
          canInteract={false}
          currentEnergy={state.sides.player.currentEnergy}
          hand={state.sides.player.hand.slice(0, 2)}
          onHandCardAction={() => undefined}
          openingHandSize={5}
          playerDrawSkipsTurnOne
          selectedCardId={null}
          state={state}
          onCardClick={clickCard}
          onCardDoubleClick={doubleClickCard}
        />,
      );
    });

    const cards = [...container.querySelectorAll<HTMLElement>("[data-battle-card-id]")];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.getAttribute("draggable")).toBe("false");
    }

    const firstCard = cards[0];
    if (firstCard === undefined) {
      throw new Error("expected first hand card");
    }
    act(() => {
      firstCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      firstCard.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(clickCard).not.toHaveBeenCalled();
    expect(doubleClickCard).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("keeps hand card art from becoming the native drag image", () => {
    const { container, root } = mount();
    const firstCard = container.querySelector<HTMLElement>("[data-battle-card-id]");
    const firstCardImage = firstCard?.querySelector<HTMLImageElement>("img");

    expect(firstCard?.classList.contains("quest-card")).toBe(true);
    expect(firstCard?.getAttribute("draggable")).toBe("true");
    expect(firstCardImage?.getAttribute("draggable")).toBe("false");
    expect(firstCardImage?.draggable).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("forwards click, double-click, and context-menu events with the battle card id", () => {
    const { clickCard, container, contextMenu, doubleClickCard, root } = mount();
    const firstCard = container.querySelector<HTMLElement>("[data-battle-card-id]");
    const battleCardId = firstCard?.getAttribute("data-battle-card-id");

    if (firstCard === null || battleCardId === null) {
      throw new Error("expected first hand card");
    }

    act(() => {
      firstCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      firstCard.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      firstCard.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });

    expect(clickCard).toHaveBeenCalledWith(battleCardId);
    expect(doubleClickCard).toHaveBeenCalledWith(battleCardId);
    expect(contextMenu.mock.calls[0]?.[0]).toBe(battleCardId);

    act(() => {
      root.unmount();
    });
  });
});
