// @vitest-environment jsdom

import { act } from "react";
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
import { BattleZoneBrowser } from "./BattleZoneBrowser";

function createState() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  const state = createInitialBattleState(battleInit);
  return state;
}

function mount(
  browser: { side: "player" | "enemy"; zone: "deck" | "hand" | "void" | "banished" },
  options: { isOpponentHandRevealed?: boolean } = {},
): {
  container: HTMLDivElement;
  onCommand: ReturnType<typeof vi.fn>;
  onCardContextMenu: ReturnType<typeof vi.fn>;
  onOpenForesee: ReturnType<typeof vi.fn>;
  onOpenReorderMultiple: ReturnType<typeof vi.fn>;
  root: Root;
  state: ReturnType<typeof createState>;
} {
  const state = createState();
  const onCommand = vi.fn();
  const onCardContextMenu = vi.fn();
  const onOpenForesee = vi.fn();
  const onOpenReorderMultiple = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BattleZoneBrowser
        browser={browser}
        isOpponentHandRevealed={options.isOpponentHandRevealed}
        state={state}
        onClose={() => undefined}
        onCommand={onCommand}
        onOpenForesee={onOpenForesee}
        onOpenReorderMultiple={onOpenReorderMultiple}
        onCardContextMenu={onCardContextMenu}
      />,
    );
  });

  return { container, onCommand, onCardContextMenu, onOpenForesee, onOpenReorderMultiple, root, state };
}

function dispatchContextMenu(element: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("BattleZoneBrowser", () => {
  it("renders the exact mockup header and controls for the deck browser", () => {
    const { container, onOpenForesee, onOpenReorderMultiple, root } = mount({ side: "player", zone: "deck" });

    expect(container.textContent).toContain("Your Deck");
    expect(
      container.querySelector<HTMLInputElement>("[data-zone-browser-search]")?.placeholder,
    ).toBe("Search by name…");
    expect(
      [...container.querySelectorAll<HTMLSelectElement>("select")].flatMap((element) =>
        [...element.options].map((option) => option.text),
      ),
    ).toEqual([
      "Current order",
      "Cost",
      "Spark",
      "Name",
      "All types",
      "Characters",
      "Events",
    ]);

    act(() => {
      container.querySelector<HTMLElement>('[data-zone-browser-card-id]')?.click();
    });

    expect(container.textContent).toContain("Reveal Top");
    expect(container.textContent).toContain("Play From Top");
    expect(container.textContent).toContain("Hide Top");
    expect(container.textContent).toContain("Foresee");
    expect(container.textContent).toContain("Reorder Full Deck");
    expect(container.textContent).not.toContain("Selected:");
    expect(container.textContent).not.toContain("Click a card to select.");
    expect(container.textContent).not.toContain("→ Hand");
    expect(container.textContent).not.toContain("→ Battlefield");
    expect(container.textContent).not.toContain("→ Void");
    expect(container.textContent).not.toContain("→ Banished");
    expect(container.textContent).not.toContain("→ Deck top");
    expect(container.textContent).not.toContain("→ Deck bot.");

    act(() => {
      container.querySelector<HTMLElement>('[data-zone-browser-action="foresee"]')?.click();
      container.querySelector<HTMLElement>('[data-zone-browser-action="reorder-full"]')?.click();
    });

    expect(onOpenForesee).toHaveBeenCalledWith("player", 1);
    expect(onOpenReorderMultiple).toHaveBeenCalledWith("player");

    act(() => {
      root.unmount();
    });
  });

  it("uses the local opponent-hand flag for enemy hand browsing and card context menus", () => {
    const hidden = mount({ side: "enemy", zone: "hand" });

    expect(hidden.container.querySelector(".hidden-enemy")).not.toBeNull();

    act(() => {
      hidden.container.querySelector<HTMLElement>('[data-zone-browser-card-id]')?.click();
    });

    expect(hidden.container.querySelector('[data-zone-browser-action="move-void"]')).toBeNull();
    expect(hidden.container.textContent).not.toContain("Reveal All");
    expect(hidden.container.textContent).not.toContain("Hide All");
    expect(hidden.container.textContent).not.toContain("Selected:");

    const hiddenCard = hidden.container.querySelector<HTMLElement>("[data-battle-card-id]");
    expect(hiddenCard).not.toBeNull();
    if (hiddenCard !== null) {
      act(() => {
        dispatchContextMenu(hiddenCard);
      });
    }
    expect(hidden.onCardContextMenu).not.toHaveBeenCalled();

    act(() => {
      hidden.root.unmount();
    });

    const { container, onCardContextMenu, root, state } = mount(
      { side: "enemy", zone: "hand" },
      { isOpponentHandRevealed: true },
    );

    expect(container.querySelector(".hidden-enemy")).toBeNull();

    act(() => {
      container.querySelector<HTMLElement>('[data-zone-browser-card-id]')?.click();
    });

    expect(container.textContent).not.toContain("Selected:");
    expect(container.textContent).not.toContain("→ Void");
    expect(container.textContent).not.toContain("→ Deck top");
    expect(container.textContent).not.toContain("Reveal All");
    expect(container.textContent).not.toContain("Hide All");
    expect(container.textContent).not.toContain("Reveal");
    expect(container.textContent).not.toContain("Hide");

    const visibleCard = container.querySelector<HTMLElement>("[data-battle-card-id]");
    expect(visibleCard).not.toBeNull();
    let contextMenuDefaultPrevented = false;
    act(() => {
      if (visibleCard !== null) {
        contextMenuDefaultPrevented = dispatchContextMenu(visibleCard).defaultPrevented;
      }
    });

    expect(contextMenuDefaultPrevented).toBe(true);
    expect(onCardContextMenu).toHaveBeenCalledWith(
      state.sides.enemy.hand[0],
      expect.any(Object),
      "zone-browser-hand",
    );

    act(() => {
      root.unmount();
    });
  });
});
