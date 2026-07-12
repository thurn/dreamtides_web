// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState, useQuest } from "../state/quest-context";
import { TangoRoot } from "../tango/TangoRoot";
import { TangoQuestChrome } from "./TangoQuestChrome";

vi.mock("../state/quest-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/quest-context")>();
  return { ...actual, useQuest: vi.fn() };
});

let root: Root;
let container: HTMLDivElement;

function stubViewport(isDesktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width") ? isDesktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubViewport(true);
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };

  const state = createDefaultState();
  state.essence = 275;
  state.deck = Array.from({ length: 17 }, (_, index) => ({
    entryId: `entry-${String(index)}`,
    cardNumber: index + 1,
    transfiguration: null,
    isBane: false,
  }));
  state.dreamcaller = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test Dreamcaller",
    title: "Keeper of Chrome",
    renderedText: "Draw a card.",
    imageNumber: "0001",
    startingEssence: 200,
  };
  vi.mocked(useQuest).mockReturnValue({
    state,
    mutations: {},
    cardDatabase: new Map(),
    questContent: {},
  } as ReturnType<typeof useQuest>);

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("TangoQuestChrome", () => {
  it("automatically docks the live quest HUD and desktop gear around content", () => {
    const onViewDeck = vi.fn();
    act(() => {
      root.render(
        <TangoRoot>
          <TangoQuestChrome handlers={{ onViewDeck }}>
            <div data-testid="screen-content" />
          </TangoQuestChrome>
        </TangoRoot>,
      );
    });

    expect(container.querySelector('[data-testid="screen-content"]')).not.toBeNull();
    expect(container.querySelector("[data-quest-status-bar-anchor]")).not.toBeNull();
    expect(container.textContent).toContain("275");
    expect(
      container.querySelector('[data-testid="dreamscape-menu-button"] i')
        ?.className,
    ).toBe("bxf bx-cog");
    const deck = container.querySelector<HTMLButtonElement>(
      '[aria-label="View deck — 17 cards"]',
    );
    act(() => deck?.click());
    expect(onViewDeck).toHaveBeenCalledTimes(1);
  });

  it("keeps the status bar and uses the top-left hamburger on mobile", () => {
    stubViewport(false);
    act(() => {
      root.render(
        <TangoRoot>
          <TangoQuestChrome>
            <div data-testid="mobile-content" />
          </TangoQuestChrome>
        </TangoRoot>,
      );
    });

    expect(container.querySelector("[data-quest-status-bar-anchor]")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dreamscape-menu-button"] i')
        ?.className,
    ).toBe("bxf bx-menu");
  });
});

