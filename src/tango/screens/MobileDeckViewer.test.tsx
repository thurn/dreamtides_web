// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
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
    clientX: { value: 150 },
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
  document.body.innerHTML = "";
});

describe("MobileDeckViewer top-row card peek", () => {
  it("pins the first UUID row to the safe top while later rows keep upward proximity", () => {
    const { container, root } = mount();
    const tango = container.querySelector<HTMLElement>(".tango");
    tango?.style.setProperty("--safe-top", "24px");
    tango?.style.setProperty("--safe-bottom", "20px");
    tango?.style.setProperty("--gutter", "16px");
    tango?.style.setProperty("--space-4", "16px");

    const firstId = asCardId("10000000-0000-4000-8000-000000000000");
    const first = container.querySelector<HTMLElement>(
      `[data-card-id="${firstId}"]`,
    );
    if (first === null) throw new Error("Missing first-row UUID fixture");
    first.getBoundingClientRect = () => rectAt(360);
    act(() => press(first, 1, 400));

    const firstPreview = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-card]",
    );
    const definitions = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-definitions]",
    );
    expect(firstPreview?.style.top).toBe("24px");
    expect(definitions?.style.top).toBe("24px");

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    const laterId = asCardId("10000000-0000-4000-8000-000000000004");
    const later = container.querySelector<HTMLElement>(
      `[data-card-id="${laterId}"]`,
    );
    if (later === null) throw new Error("Missing later-row UUID fixture");
    later.getBoundingClientRect = () => rectAt(600);
    act(() => press(later, 2, 640));

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
});
