// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { DraftScreen, type DraftView } from "./DraftScreen";

function card(cardNumber: number): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: (cardNumber % 4) + 1,
    spark: 1,
    isFast: false,
    renderedText: "Text.",
    imageNumber: cardNumber,
    artOwned: false,
  };
}

function view(offer: number[]): DraftView {
  return {
    scene: null,
    offer: offer.map(card),
    offerKey: offer.join(","),
    pickNumber: 1,
    pickTotal: 5,
    hud: { essence: 100, deck: 12, dreamsigns: [] },
  };
}

/** Stub matchMedia (jsdom lacks it; Pressable reads the reduced-motion query). */
function stubMatchMedia({ desktop = false }: { desktop?: boolean } = {}): void {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes("min-width: 900px"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("Tango DraftScreen", () => {
  it("renders the mobile offer as the shipped 2x2 grid", () => {
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const grid = container.querySelector<HTMLElement>("[data-draft-offer-grid]");
    expect(grid?.style.gridTemplateColumns).toBe("repeat(2, auto)");
    expect(grid?.style.gridTemplateRows).toBe("repeat(2, auto)");
    const stage = container.querySelector<HTMLElement>("[data-draft-offer-stage]");
    expect(stage?.style.justifyContent).toBe("flex-start");
    expect(stage?.style.paddingLeft).toBe("var(--space-2)");
    expect(stage?.style.paddingRight).toBe("var(--space-2)");
    expect(grid?.style.gap).toBe("var(--space-2)");
    const firstCard = container.querySelector<HTMLElement>(
      '[data-draft-offer-card="101"]',
    );
    expect(firstCard?.style.width).toContain("var(--space-2)");

    act(() => {
      root.unmount();
    });
  });

  it("renders the desktop offer as one row of four cards", () => {
    stubMatchMedia({ desktop: true });
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const grid = container.querySelector<HTMLElement>("[data-draft-offer-grid]");
    expect(grid?.style.gridTemplateColumns).toBe("repeat(4, auto)");
    expect(grid?.style.gridTemplateRows).toBe("repeat(1, auto)");
    const firstCard = container.querySelector<HTMLElement>(
      '[data-draft-offer-card="101"]',
    );
    expect(firstCard?.style.width).toContain("260px");
    const stage = container.querySelector<HTMLElement>("[data-draft-offer-stage]");
    expect(stage?.style.justifyContent).toBe("center");
    expect(stage?.style.paddingLeft).toBe("var(--space-5)");
    expect(grid?.style.gap).toBe("var(--space-5)");

    act(() => {
      root.unmount();
    });
  });

  it("renders one offer cell per card in the pack and nothing else", () => {
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const cells = container.querySelectorAll("[data-draft-offer-card]");
    expect(cells).toHaveLength(4);
    for (const cardNumber of [101, 102, 103, 104]) {
      expect(
        container.querySelector(`[data-draft-offer-card="${String(cardNumber)}"]`),
      ).not.toBeNull();
    }
    // The one label: a floating "Draft (n/total)" pick counter.
    const counter = container.querySelector("[data-draft-pick-counter]");
    expect(counter?.textContent).toBe("Draft (1/5)");

    act(() => {
      root.unmount();
    });
  });

  it("calls onPick with the card's number when a card is pressed", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={onPick} />,
    );

    const target = container.querySelector<HTMLElement>(
      `[data-draft-offer-card="102"] [role="button"]`,
    );
    if (target === null) {
      throw new Error("Missing pressable card");
    }
    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledWith(102);

    act(() => {
      root.unmount();
    });
  });

  it("latches the first pick so a second card cannot be picked in the same pack", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={onPick} />,
    );

    const first = container.querySelector<HTMLElement>(
      `[data-draft-offer-card="101"] [role="button"]`,
    );
    const second = container.querySelector<HTMLElement>(
      `[data-draft-offer-card="102"] [role="button"]`,
    );
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      second?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(101);

    act(() => {
      root.unmount();
    });
  });
});
