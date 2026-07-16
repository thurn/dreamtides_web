// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { CumulusBattleZoneBrowser } from "./CumulusBattleZoneBrowser";

function createState() {
  return createInitialBattleState(createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  }));
}

function mount(
  zone: "deck" | "void" | "banished",
  mutateState?: (state: ReturnType<typeof createState>) => void,
): {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly state: ReturnType<typeof createState>;
  readonly onCommand: ReturnType<typeof vi.fn>;
  readonly onOpenForesee: ReturnType<typeof vi.fn>;
  readonly onOpenReorderMultiple: ReturnType<typeof vi.fn>;
  readonly onCardContextMenu: ReturnType<typeof vi.fn>;
  readonly onCardDragStart: ReturnType<typeof vi.fn>;
} {
  const state = createState();
  mutateState?.(state);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onCommand = vi.fn();
  const onOpenForesee = vi.fn();
  const onOpenReorderMultiple = vi.fn();
  const onCardContextMenu = vi.fn();
  const onCardDragStart = vi.fn();

  act(() => {
    root.render(
      <CumulusRoot>
        <CumulusBattleZoneBrowser
          browser={{ side: "player", zone }}
          state={state}
          onClose={() => undefined}
          onCommand={onCommand}
          onOpenForesee={onOpenForesee}
          onOpenReorderMultiple={onOpenReorderMultiple}
          onCardContextMenu={onCardContextMenu}
          onCardDragStart={onCardDragStart}
        />
      </CumulusRoot>,
    );
  });

  return {
    container,
    root,
    state,
    onCommand,
    onOpenForesee,
    onOpenReorderMultiple,
    onCardContextMenu,
    onCardDragStart,
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("CumulusBattleZoneBrowser", () => {
  it("renders the deck browser controls, ordered cards, and per-zone actions", () => {
    const mounted = mount("deck");
    const { container, state } = mounted;

    expect(container.textContent).toContain("Your Deck");
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="card-zone-browser-search"]',
      )?.placeholder,
    ).toBe("Search by name…");
    expect(container.querySelector('button[aria-label="Sort zone cards"]')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Filter zone cards by type"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-gallery-entry-id]")).toHaveLength(
      state.sides.player.deck.length,
    );
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("Reveal Top");
    expect(container.textContent).toContain("Play From Top");
    expect(container.textContent).toContain("Hide Top");
    expect(container.textContent).toContain("Foresee…");
    expect(container.textContent).toContain("Reorder Full Deck");

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="card-zone-browser-reveal-top"]',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        '[data-testid="card-zone-browser-foresee"]',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        '[data-testid="card-zone-browser-reorder-full"]',
      )?.click();
    });

    expect(mounted.onCommand).toHaveBeenCalledWith({
      id: "DEBUG_EDIT",
      edit: { kind: "REVEAL_DECK_TOP", count: 3, side: "player" },
      sourceSurface: "zone-browser-deck",
    });
    expect(mounted.onOpenForesee).toHaveBeenCalledWith("player", 1);
    expect(mounted.onOpenReorderMultiple).toHaveBeenCalledWith("player");

    act(() => mounted.root.unmount());
  });

  it("searches the current zone by card name", () => {
    const mounted = mount("deck");
    const firstCardId = mounted.state.sides.player.deck[0];
    const firstName = mounted.state.cardInstances[firstCardId]?.definition.name ?? "";
    const input = mounted.container.querySelector<HTMLInputElement>(
      '[data-testid="card-zone-browser-search"]',
    );

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.bind(input);
      valueSetter?.(firstName);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      mounted.container.querySelectorAll("[data-gallery-entry-id]").length,
    ).toBeGreaterThan(0);
    expect(mounted.container.textContent).toContain(firstName);

    act(() => mounted.root.unmount());
  });

  it.each(["void", "banished"] as const)(
    "renders %s without deck-only actions and keeps card debug gestures",
    (zone) => {
      let zoneCardId = "";
      const mounted = mount(zone, (state) => {
        zoneCardId = state.sides.player.hand[0] ?? "";
        state.sides.player.hand = state.sides.player.hand.filter(
          (cardId) => cardId !== zoneCardId,
        );
        state.sides.player[zone] = [zoneCardId];
      });
      const entry = mounted.container.querySelector<HTMLElement>(
        `[data-gallery-entry-id="${zoneCardId}"]`,
      );

      expect(mounted.container.textContent).not.toContain("Reveal Top");
      expect(entry?.draggable).toBe(true);

      act(() => {
        entry?.dispatchEvent(new Event("dragstart", {
          bubbles: true,
          cancelable: true,
        }));
        entry?.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
        }));
      });

      expect(mounted.onCardDragStart).toHaveBeenCalledWith(
        zoneCardId,
        `zone-browser-${zone}`,
      );
      expect(mounted.onCardContextMenu).toHaveBeenCalledWith(
        zoneCardId,
        expect.any(Object),
        `zone-browser-${zone}`,
      );

      act(() => mounted.root.unmount());
    },
  );
});
