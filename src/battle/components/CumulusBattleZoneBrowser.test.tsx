// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { DOUBLE_TAP_WINDOW_MS } from "../../cumulus/primitives/pointer-gesture";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
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
    dreamAvatars: makeBattleTestDreamAvatars(),
  }));
}

function mount(
  zone: "deck" | "void" | "banished",
  mutateState?: (state: ReturnType<typeof createState>) => void,
  options: {
    readonly browserSide?: "player" | "enemy";
    readonly perspectiveSide?: "player" | "enemy";
  } = {},
): {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly state: ReturnType<typeof createState>;
  readonly onCardContextMenu: ReturnType<typeof vi.fn>;
  readonly onCardDoubleTap: ReturnType<typeof vi.fn>;
  readonly onCardDragStart: ReturnType<typeof vi.fn>;
} {
  const state = createState();
  mutateState?.(state);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onCardContextMenu = vi.fn();
  const onCardDoubleTap = vi.fn();
  const onCardDragStart = vi.fn();

  act(() => {
    root.render(
      <CumulusRoot>
        <CumulusBattleZoneBrowser
          browser={{ side: options.browserSide ?? "player", zone }}
          perspectiveSide={options.perspectiveSide ?? "player"}
          state={state}
          onClose={() => undefined}
          onCardContextMenu={onCardContextMenu}
          onCardDoubleTap={onCardDoubleTap}
          onCardDragStart={onCardDragStart}
        />
      </CumulusRoot>,
    );
  });

  return {
    container,
    root,
    state,
    onCardContextMenu,
    onCardDoubleTap,
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
  it("renders stable deck browser controls and ordered cards without actions", () => {
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
    expect(container.textContent).not.toContain("Top To Bottom");
    expect(container.textContent).not.toContain("Reveal Top");
    expect(container.textContent).not.toContain("Play From Top");
    expect(container.textContent).not.toContain("Hide Top");
    expect(container.textContent).not.toContain("Foresee…");
    expect(container.textContent).not.toContain("Reorder Full Deck");
    expect(
      container.querySelector<HTMLElement>("section")?.dataset.galleryWidthMode,
    ).toBe("fill");
    expect(
      container.querySelector<HTMLElement>("section")?.dataset.galleryHeightMode,
    ).toBe("fill");

    act(() => mounted.root.unmount());
  });

  it("labels a zone relative to the current battle perspective", () => {
    const mounted = mount("banished", undefined, {
      browserSide: "player",
      perspectiveSide: "enemy",
    });

    expect(mounted.container.textContent).toContain("Opponent Banished");
    expect(mounted.container.textContent).not.toContain("Your Banished");

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
    "renders %s controls and keeps card debug gestures",
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
      if (zone === "void") {
        expect(mounted.container.querySelector("input[type=search]")).toBeNull();
        expect(
          mounted.container.querySelector(
            'button[aria-label="Filter zone cards by type"]',
          ),
        ).toBeNull();
      } else {
        expect(mounted.container.querySelector("input[type=search]")).not.toBeNull();
      }
      expect(
        mounted.container.querySelector('button[aria-label="Sort zone cards"]'),
      ).not.toBeNull();
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
  it.each(["deck", "void", "banished"] as const)(
    "opens %s card debug actions from a mobile double-tap",
    (zone) => {
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      let zoneCardId = "";
      const mounted = mount(zone, (state) => {
        if (zone === "deck") {
          zoneCardId = state.sides.player.deck[0] ?? "";
          return;
        }
        zoneCardId = state.sides.player.hand[0] ?? "";
        state.sides.player.hand = state.sides.player.hand.filter(
          (cardId) => cardId !== zoneCardId,
        );
        state.sides.player[zone] = [zoneCardId];
      });
      const card = mounted.container.querySelector<HTMLElement>(
        `[data-gallery-entry-id="${zoneCardId}"] [data-game-card-source]`,
      );

      act(() => {
        card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(mounted.onCardDoubleTap).toHaveBeenCalledWith(
        zoneCardId,
        `zone-browser-${zone}`,
      );

      act(() => {
        vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS);
        mounted.root.unmount();
      });
      vi.useRealTimers();
    },
  );

  it("keeps a mobile void-card reading reveal open while the touch is held", () => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const mounted = mount("void", (state) => {
      const voidCardId = state.sides.player.hand[0] ?? "";
      state.sides.player.hand = state.sides.player.hand.filter(
        (cardId) => cardId !== voidCardId,
      );
      state.sides.player.void = [voidCardId];
    });
    const entry = mounted.container.querySelector<HTMLElement>(
      "[data-gallery-entry-id]",
    );
    const source = entry?.querySelector<HTMLElement>("[data-game-card-source]");

    expect(entry?.draggable).toBe(false);
    act(() => {
      source?.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 7,
        clientX: 100,
        clientY: 200,
      }));
      vi.advanceTimersByTime(1_000);
    });

    expect(source?.dataset.revealActive).toBe("true");
    expect(document.querySelector("[data-cumulus-reveal-portal]")).not.toBeNull();

    act(() => {
      source?.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 7,
      }));
      mounted.root.unmount();
    });
    vi.useRealTimers();
  });
});
