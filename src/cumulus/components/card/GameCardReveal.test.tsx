// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { GameCard, type GameCardModel } from "./CardView";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
let resizeCallbacks: ResizeObserverCallback[] = [];

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: CARD_ID,
    name: asCardName("Archive Sentry"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Synth",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "Discard a bane.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function model(displaySnapshot = card()): GameCardModel {
  return { cardId: CARD_ID, displaySnapshot };
}

function mount(element: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

function rect(width: number, left = 80, top = 120): DOMRect {
  const height = width * 1.5;
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

function pointer(type: string, init: PointerEventInit): Event {
  return new PointerEvent(type, { bubbles: true, ...init });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("pointer: fine"), media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  resizeCallbacks = [];
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect(this: HTMLElement) {
    if (this.hasAttribute("data-game-card-source")) return rect(Number(this.parentElement?.dataset.testWidth ?? 160));
    if (this.getAttribute("data-reveal-measure") === "primary") return rect(340, 0, 0);
    if (this.getAttribute("data-reveal-measure") === "secondary") return rect(248, 0, 0);
    if (this.classList.contains("card-view")) return rect(160);
    return rect(100);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
});

function remeasure(): void {
  act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
}

describe("GameCard reveal contract", () => {
  it("registers canonical UUID semantics and derives de-duplicated glossary secondaries", () => {
    const { container, root } = mount(<GameCard model={model(card({ renderedText: "Bane, then discard another bane." }))} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    expect(source?.getAttribute("aria-describedby")).toMatch(/^cumulus-reveal-description-/);
    const description = document.querySelector("[data-cumulus-reveal-descriptions]")?.textContent ?? "";
    expect(description).toContain("Archive Sentry");
    expect(description).toContain("Bane, then discard another bane");
    expect(description.match(/A penalty card forced into your deck\./g)).toHaveLength(1);
    act(() => root.unmount());
  });

  it("uses a reading copy below 340px and leaves a complete wide source in place", async () => {
    const small = mount(<div data-test-width="160"><GameCard model={model()} /></div>);
    const smallSource = small.container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { smallSource?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 1 })); });
    expect(smallSource?.dataset.revealActive).toBe("true");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    expect(smallSource?.style.opacity).toBe("0");
    expect(document.querySelector<HTMLElement>('[data-cumulus-reveal-card="primary"]')?.style.width).toBe("340px");
    act(() => small.root.unmount());

    const wide = mount(<div data-test-width="360"><GameCard model={model()} /></div>);
    const wideSource = wide.container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { wideSource?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 2 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-cumulus-reveal-card="secondary"]')).toHaveLength(1));
    expect(wideSource?.style.opacity).not.toBe("0");
    expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).toBeNull();
    expect(document.querySelectorAll('[data-cumulus-reveal-card="secondary"]')).toHaveLength(1);
    act(() => wide.root.unmount());
  });

  it("keeps hidden-rules cards eligible for a complete popup", async () => {
    const { container, root } = mount(<GameCard model={model()} hideRulesText />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    expect(source?.dataset.revealCompleteGameCard).toBe("false");
    act(() => { source?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 1 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    expect(document.querySelector('[data-cumulus-reveal-card="primary"]')?.textContent).toContain("Discard a bane");
    act(() => root.unmount());
  });

  it("renders an applied proposed transfiguration on the reading copy", async () => {
    const displaySnapshot = card({ energyCost: 1 });
    const { container, root } = mount(
      <GameCard
        model={{
          cardId: CARD_ID,
          displaySnapshot,
          transfiguration: {
            type: "Empowered",
            color: "#20d6a2",
            markedText: displaySnapshot.renderedText,
            energyChanged: true,
            sparkChanged: false,
            fastChanged: false,
          },
        }}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    act(() => {
      source?.dispatchEvent(
        pointer("pointerover", { pointerType: "mouse", pointerId: 1 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    remeasure();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector(
        '[data-cumulus-reveal-card="primary"] [aria-label="Empowered transfiguration"]',
      ),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("keeps informative unavailable cards focusable while suppressing activation", async () => {
    const activate = vi.fn();
    const { container, root } = mount(<GameCard model={model()} unavailable onActivate={activate} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    expect(source?.tabIndex).toBe(0);
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    remeasure();
    await vi.waitFor(() => expect(document.querySelector('[data-cumulus-reveal-card="primary"]')).not.toBeNull());
    act(() => source?.click());
    expect(activate).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("fires quick activation, suppresses a hold, and dismisses on drag recognition", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const { container, root } = mount(<GameCard model={model()} onActivate={activate} />);
    const source = container.querySelector<HTMLElement>("[data-game-card-source]");
    act(() => { source?.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 4, clientX: 100, clientY: 200 })); });
    act(() => { source?.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 4, clientX: 100, clientY: 200 })); });
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      source?.dispatchEvent(pointer("pointerdown", { pointerType: "touch", pointerId: 5, clientX: 100, clientY: 200 }));
      vi.advanceTimersByTime(300);
      source?.dispatchEvent(pointer("pointerup", { pointerType: "touch", pointerId: 5, clientX: 100, clientY: 200 }));
    });
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      source?.dispatchEvent(pointer("pointerover", { pointerType: "mouse", pointerId: 6 }));
      source?.dispatchEvent(new Event("dragstart", { bubbles: true }));
    });
    expect(document.querySelector('[data-cumulus-reveal-group]')).toBeNull();
    act(() => root.unmount());
  });
});
