// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { MOBILE_CARD_PEEK_HOLD_MS } from "../components/card/MobileCardPeek";
import { MobileDeckViewer, type MobileDeckView } from "./MobileDeckViewer";

vi.mock("../components/card/CardView", () => ({
  GameCard: ({ card }: { card: CardData }) => (
    <div data-rendered-card-id={card.id} />
  ),
}));

function makeView(): MobileDeckView {
  return {
    cards: Array.from({ length: 5 }, (_, index) => {
      const id = asCardId(
        `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      );
      return {
        entryId: `entry-${String(index)}`,
        isBane: false,
        card: {
          id,
          name: asCardName(`Fixture ${String(index)}`),
          cardNumber: index + 1,
          cardType: "Character",
          subtype: "",
          isStarter: false,
          energyCost: 2,
          spark: 1,
          isFast: false,
          renderedText: index === 0 ? "Foresee 1." : "Draw a card.",
          imageNumber: index + 1,
          artOwned: true,
        },
      };
    }),
  };
}

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MobileDeckViewer view={makeView()} onClose={vi.fn()} />);
  });
  return { container, root };
}

function rectAt(top: number): DOMRect {
  return {
    left: 110,
    top,
    width: 80,
    height: 80,
    right: 190,
    bottom: top + 80,
    x: 110,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function press(tile: HTMLElement, pointerId: number, y: number): void {
  const event = new Event("pointerdown", { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    button: { value: 0 },
    clientX: { value: 150 },
    clientY: { value: y },
  });
  tile.dispatchEvent(event);
}

function move(tile: HTMLElement, pointerId: number, x: number, y: number): void {
  const event = new Event("pointermove", { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: x },
    clientY: { value: y },
  });
  tile.dispatchEvent(event);
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 393,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 852,
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("MobileDeckViewer mobile card gesture", () => {
  it("moves every UUID card upward by touch geometry without a first-row pin", () => {
    vi.useFakeTimers();
    const { container, root } = mount();
    const tango = container.querySelector<HTMLElement>(".tango");
    tango?.style.setProperty("--safe-top", "24px");
    tango?.style.setProperty("--safe-area-inset-top", "0px");
    tango?.style.setProperty("--safe-bottom", "20px");
    tango?.style.setProperty("--gutter", "16px");
    tango?.style.setProperty("--space-4", "16px");

    const firstId = asCardId("10000000-0000-4000-8000-000000000000");
    const first = container.querySelector<HTMLElement>(
      `[data-card-id="${firstId}"]`,
    );
    if (first === null) throw new Error("Missing first-row UUID fixture");
    first.getBoundingClientRect = () => rectAt(360);
    act(() => {
      press(first, 1, 400);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });

    const firstPreview = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-card]",
    );
    const definitions = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-definitions]",
    );
    const firstTop = Number.parseFloat(firstPreview?.style.top ?? "NaN");
    expect(firstTop).toBeGreaterThan(0);
    expect(firstTop).toBeLessThan(400);
    expect(Number.parseFloat(definitions?.style.top ?? "NaN")).toBeGreaterThan(
      firstTop,
    );

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    const laterId = asCardId("10000000-0000-4000-8000-000000000004");
    const later = container.querySelector<HTMLElement>(
      `[data-card-id="${laterId}"]`,
    );
    if (later === null) throw new Error("Missing later-row UUID fixture");
    later.getBoundingClientRect = () => rectAt(600);
    act(() => {
      press(later, 2, 640);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });

    const laterPreview = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-card]",
    );
    expect(Number.parseFloat(laterPreview?.style.top ?? "NaN")).toBeGreaterThan(
      24,
    );
    expect(Number.parseFloat(laterPreview?.style.top ?? "NaN")).toBeLessThan(
      640,
    );

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
      root.unmount();
    });
  });

  it("keeps a threshold-crossing scroll gesture from mounting a preview", () => {
    vi.useFakeTimers();
    const { container, root } = mount();
    const first = container.querySelector<HTMLElement>("[data-card-id]");
    if (first === null) throw new Error("Missing UUID fixture");
    first.getBoundingClientRect = () => rectAt(360);

    act(() => {
      press(first, 11, 400);
      move(first, 11, 150, 411);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });

    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("cancels a pending preview on pointer cancellation", () => {
    vi.useFakeTimers();
    const { container, root } = mount();
    const first = container.querySelector<HTMLElement>("[data-card-id]");
    if (first === null) throw new Error("Missing UUID fixture");
    first.getBoundingClientRect = () => rectAt(360);

    act(() => {
      press(first, 12, 400);
      window.dispatchEvent(new Event("pointercancel"));
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });

    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("dismisses a held preview when the deck container scrolls", () => {
    vi.useFakeTimers();
    const { container, root } = mount();
    const first = container.querySelector<HTMLElement>("[data-card-id]");
    const scrollRegion = Array.from(
      container.querySelectorAll<HTMLElement>("div"),
    ).find((element) => element.style.overflowY === "auto");
    if (first === null || scrollRegion === undefined) {
      throw new Error("Missing deck gesture fixtures");
    }
    first.getBoundingClientRect = () => rectAt(360);

    act(() => {
      press(first, 13, 400);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });
    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).not.toBeNull();

    act(() => {
      scrollRegion.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).toBeNull();
    expect(scrollRegion.style.touchAction).toBe("pan-y");
    expect(scrollRegion.style.overscrollBehaviorY).toBe("contain");

    act(() => root.unmount());
  });
});
