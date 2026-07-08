// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GameCard, HOVER_TARGET_WIDTH_PX, MAX_HOVER_SCALE } from "./CardView";

vi.mock("../../../logging", () => ({
  logEventOnce: vi.fn(),
}));

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    cardNumber: 1,
    cardType: "Character",
    subtype: "Synth",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "Discard a bane.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
    id: asCardId(overrides.id ?? "test-card"),
    name: asCardName(overrides.name ?? "Test Card"),
  };
}

function readScale(transform: string | undefined): number {
  const match = /scale\(([\d.]+)\)/.exec(transform ?? "");
  return match ? Number(match[1]) : Number.NaN;
}

function mockRect(rect: Partial<DOMRect>): void {
  const full: DOMRect = {
    width: 100,
    height: 140,
    left: 50,
    top: 50,
    right: 150,
    bottom: 190,
    x: 50,
    y: 50,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(full);
}

function mountGameCard(card: CardData = makeCard()): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<GameCard card={card} />);
  });
  return { container, root };
}

function hoverCard(container: HTMLDivElement): void {
  const card = container.querySelector(".card-view");
  act(() => {
    card?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function overlay(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>("[data-hover-zoom-overlay]");
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("GameCard hover zoom", () => {
  it("automatically grows into a portaled, pointer-events-none copy on hover", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mountGameCard();

    expect(overlay()).toBeNull();

    hoverCard(container);

    const node = overlay();
    expect(node).not.toBeNull();
    expect(node?.textContent).toContain("Test Card");
    expect(node?.classList.contains("pointer-events-none")).toBe(true);
    const scale = readScale(node?.style.transform);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(MAX_HOVER_SCALE + 1e-9);
    expect(scale).toBeLessThanOrEqual(HOVER_TARGET_WIDTH_PX / 100 + 1e-9);

    act(() => {
      root.unmount();
    });
  });

  it("shows the card's glossary definition stack beside the zoomed copy", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mountGameCard();

    hoverCard(container);

    const stack = document.body.querySelector("[data-hover-zoom-glossary]");
    expect(stack).not.toBeNull();
    expect(stack?.textContent).toContain("Bane");

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, clientY: 600 }),
      );
    });
    expect(document.body.querySelector("[data-hover-zoom-glossary]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders no glossary stack when the card has no gameplay terms", () => {
    mockRect({ width: 100, height: 140, left: 50, top: 50, right: 150, bottom: 190 });
    const { container, root } = mountGameCard(
      makeCard({ renderedText: "Just some plain words." }),
    );

    hoverCard(container);

    expect(overlay()).not.toBeNull();
    expect(document.body.querySelector("[data-hover-zoom-glossary]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not zoom a card already wider than the target reading width", () => {
    const wide = HOVER_TARGET_WIDTH_PX + 60;
    mockRect({
      width: wide,
      height: Math.round(wide * 1.4),
      left: 20,
      top: 20,
      right: 20 + wide,
      bottom: 20 + Math.round(wide * 1.4),
    });
    const { container, root } = mountGameCard();

    hoverCard(container);

    expect(overlay()).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
