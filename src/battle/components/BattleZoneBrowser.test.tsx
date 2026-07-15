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
  return state;
}

function mount(
  browser: { side: "player" | "enemy"; zone: "deck" | "hand" | "void" | "banished" },
  options: {
    isOpponentHandRevealed?: boolean;
    mutateState?: (state: ReturnType<typeof createState>) => void;
  } = {},
): {
  container: HTMLDivElement;
  onCommand: ReturnType<typeof vi.fn>;
  onCardContextMenu: ReturnType<typeof vi.fn>;
  onCardDragEnd: ReturnType<typeof vi.fn>;
  onCardDragStart: ReturnType<typeof vi.fn>;
  onCardDropToBrowser: ReturnType<typeof vi.fn>;
  onOpenForesee: ReturnType<typeof vi.fn>;
  onOpenReorderMultiple: ReturnType<typeof vi.fn>;
  root: Root;
  state: ReturnType<typeof createState>;
} {
  const state = createState();
  options.mutateState?.(state);
  const onCommand = vi.fn();
  const onCardContextMenu = vi.fn();
  const onCardDragEnd = vi.fn();
  const onCardDragStart = vi.fn();
  const onCardDropToBrowser = vi.fn();
  const onOpenForesee = vi.fn();
  const onOpenReorderMultiple = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <CumulusRoot><BattleZoneBrowser
        browser={browser}
        isOpponentHandRevealed={options.isOpponentHandRevealed}
        state={state}
        onClose={() => undefined}
        onCommand={onCommand}
        onOpenForesee={onOpenForesee}
        onOpenReorderMultiple={onOpenReorderMultiple}
        onCardContextMenu={onCardContextMenu}
        onCardDragStart={onCardDragStart}
        onCardDragEnd={onCardDragEnd}
        onCardDropToBrowser={onCardDropToBrowser}
        pendingDragSourceSurface="hand-tray"
      /></CumulusRoot>,
    );
  });

  return {
    container,
    onCommand,
    onCardContextMenu,
    onCardDragEnd,
    onCardDragStart,
    onCardDropToBrowser,
    onOpenForesee,
    onOpenReorderMultiple,
    root,
    state,
  };
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
      container.querySelector<HTMLInputElement>('[data-testid="battle-zone-browser-search"]')?.placeholder,
    ).toBe("Search by name…");
    expect(container.querySelector('button[aria-label="Sort deck cards"]')?.textContent).toContain("Current order");
    expect(
      [...container.querySelectorAll('[data-zone-browser-filter] [role="tab"]')].map((element) => element.textContent),
    ).toEqual(["All", "Characters", "Events"]);

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

  it("renders void and banished as compact floating browsers with draggable cards", () => {
    let voidCardId = "";
    const { container, onCardDragEnd, onCardDragStart, onCardDropToBrowser, root } = mount(
      { side: "player", zone: "void" },
      {
        mutateState: (state) => {
          voidCardId = state.sides.player.hand[0] ?? "";
          state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== voidCardId);
          state.sides.player.void = [voidCardId];
        },
      },
    );

    expect(container.querySelector(".modal-scrim")).toBeNull();
    expect(container.querySelector(".zone-browser-floating-layer")).not.toBeNull();
    expect(container.querySelector(".compact-zone-browser")).not.toBeNull();
    expect(
      container.querySelector("[data-battle-zone-browser]")?.getAttribute("data-battle-zone-browser-floating"),
    ).toBe("true");
    expect(
      container.querySelector("[data-battle-zone-browser]")?.getAttribute("data-battle-zone-drop-target"),
    ).toBe("player:void");
    expect(container.querySelector(".m-head .btn.ghost")).not.toBeNull();

    const browserCard = container.querySelector<HTMLElement>("[data-battle-card-id]");
    expect(browserCard).not.toBeNull();

    act(() => {
      browserCard?.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      browserCard?.dispatchEvent(new Event("dragend", { bubbles: true, cancelable: true }));
      container.querySelector("[data-battle-zone-browser]")?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
    });

    expect(onCardDragStart).toHaveBeenCalledWith(voidCardId, "zone-browser-void");
    expect(onCardDragEnd).toHaveBeenCalled();
    expect(onCardDropToBrowser).toHaveBeenCalledWith("hand-tray");

    act(() => {
      root.unmount();
    });

    const banished = mount(
      { side: "player", zone: "banished" },
      {
        mutateState: (state) => {
          const banishedCardId = state.sides.player.hand[0] ?? "";
          state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== banishedCardId);
          state.sides.player.banished = [banishedCardId];
        },
      },
    );

    expect(banished.container.querySelector(".modal-scrim")).toBeNull();
    expect(banished.container.querySelector(".compact-zone-browser")).not.toBeNull();
    expect(banished.container.querySelector(".m-head .btn.ghost")).not.toBeNull();

    const banishedCard = banished.container.querySelector<HTMLElement>("[data-battle-card-id]");
    act(() => {
      banishedCard?.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    });

    expect(banished.onCardDragStart).toHaveBeenCalledWith(
      banished.state.sides.player.banished[0],
      "zone-browser-banished",
    );

    act(() => {
      banished.root.unmount();
    });
  });

  it("renders void browser cards through their named semantic source", () => {
    const { container, root, state } = mount(
      { side: "player", zone: "void" },
      {
        mutateState: (mutable) => {
          const voidCardId = mutable.sides.player.hand[0] ?? "";
          mutable.sides.player.hand = mutable.sides.player.hand.filter((cardId) => cardId !== voidCardId);
          mutable.sides.player.void = [voidCardId];
        },
      },
    );
    const voidCardId = state.sides.player.void[0];
    const cell = container.querySelector<HTMLElement>("button.browse-cell");
    expect(cell).not.toBeNull();
    expect(cell?.querySelector(`[data-battle-card-id="${voidCardId}"] [data-game-card-source]`)).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
