// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState, useQuest } from "../state/quest-context";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { CumulusQuestChrome } from "./CumulusQuestChrome";

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
  state.dreamsigns = Array.from({ length: 5 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
    name: `Test Dreamsign ${String(index + 1)}`,
    effectDescription: "Keep watch over the lower corner.",
    imageName: "bell.png",
    isBane: false,
  }));
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

describe("CumulusQuestChrome", () => {
  it("automatically docks the live quest HUD and desktop gear around content", () => {
    const onViewDeck = vi.fn();
    act(() => {
      root.render(
        <CumulusRoot>
          <CumulusQuestChrome handlers={{ onViewDeck }}>
            <div data-testid="screen-content" />
          </CumulusQuestChrome>
        </CumulusRoot>,
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
        <CumulusRoot>
          <CumulusQuestChrome>
            <div data-testid="mobile-content" />
          </CumulusQuestChrome>
        </CumulusRoot>,
      );
    });

    expect(container.querySelector("[data-quest-status-bar-anchor]")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dreamscape-menu-button"] i')
        ?.className,
    ).toBe("bxf bx-menu");
  });

  it("shows only the partial quest resources around a desktop battle", () => {
    act(() => {
      root.render(
        <CumulusRoot>
          <CumulusQuestChrome variant="battle">
            <div data-testid="battle-content" />
          </CumulusQuestChrome>
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector('[data-quest-status-bar-variant="battle"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-quest-status-essence]')?.textContent,
    ).toContain("275");
    expect(
      container.querySelector('[data-quest-status-dreamsigns] img'),
    ).not.toBeNull();
    const dreamsignColumns = container.querySelector<HTMLElement>(
      '[data-quest-status-dreamsign-columns="two-high"]',
    );
    expect(dreamsignColumns?.style.gridTemplateColumns).toBe(
      "repeat(3, max-content)",
    );
    expect(dreamsignColumns?.style.gridTemplateRows).toBe(
      "repeat(2, max-content)",
    );
    expect(
      dreamsignColumns?.querySelectorAll("[data-quest-status-dreamsign]"),
    ).toHaveLength(5);
    expect(
      Array.from(
        dreamsignColumns?.querySelectorAll<HTMLElement>(
          "[data-quest-status-dreamsign]",
        ) ?? [],
      ).map((dreamsign) => [
        dreamsign.dataset.questStatusDreamsignColumn,
        dreamsign.dataset.questStatusDreamsignRow,
      ]),
    ).toEqual([
      ["3", "2"],
      ["3", "1"],
      ["2", "2"],
      ["2", "1"],
      ["1", "2"],
    ]);
    expect(container.querySelector('[aria-label^="View deck"]')).toBeNull();
    expect(container.querySelector('[aria-label="Dreamcaller"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="dreamscape-menu-button"]'),
    ).toBeNull();
  });

  it("omits the partial quest resources from a mobile battle", () => {
    stubViewport(false);
    act(() => {
      root.render(
        <CumulusRoot>
          <CumulusQuestChrome variant="battle">
            <div data-testid="mobile-battle-content" />
          </CumulusQuestChrome>
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector('[data-testid="mobile-battle-content"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-quest-status-bar-anchor]")).toBeNull();
    expect(
      container.querySelector('[data-testid="dreamscape-menu-button"]'),
    ).toBeNull();
  });

  it("keeps the utility menu while omitting the status bar for an end screen", () => {
    stubViewport(false);
    act(() => {
      root.render(
        <CumulusRoot>
          <CumulusQuestChrome showStatusBar={false}>
            <div data-testid="end-screen-content" />
          </CumulusQuestChrome>
        </CumulusRoot>,
      );
    });

    expect(container.querySelector('[data-testid="end-screen-content"]')).not.toBeNull();
    expect(container.querySelector("[data-quest-status-bar-anchor]")).toBeNull();
    expect(container.querySelector('[data-testid="dreamscape-menu-button"]')).not.toBeNull();
  });
});
