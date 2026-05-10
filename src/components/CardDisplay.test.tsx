// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import { CardDisplay } from "./CardDisplay";

function makeCard(overrides: Partial<CardData>): CardData {
  return {
    name: "Test Card",
    id: "test-card",
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    tides: ["tide_alpha"],
    renderedText: "Test text.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CardDisplay", () => {
  it("renders the energy cost badge with the boxicons flame icon", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: 4 })} />,
    );

    const flameIcon = container.querySelector("i.bx.bxs-flame");
    expect(flameIcon).not.toBeNull();
    expect(flameIcon?.getAttribute("aria-label")).toBe("energy cost");
    expect(container.textContent).toContain("4");
    expect(container.textContent).not.toContain("●");

    act(() => {
      root.unmount();
    });
  });

  it("renders inline energy symbols in rules text as flame icons", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({ renderedText: "Pay ●2: draw a card." })}
      />,
    );

    const inlineFlames = container.querySelectorAll(
      "i.bx.bxs-flame[aria-label=\"energy\"]",
    );
    expect(inlineFlames.length).toBe(1);
    expect(container.textContent).not.toContain("●");
    expect(container.textContent).toContain("Pay ");
    expect(container.textContent).toContain("2: draw a card.");

    act(() => {
      root.unmount();
    });
  });

  it("renders Event cards with distinctive purple border chrome", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          cardType: "Event",
          spark: null,
        })}
      />,
    );

    const cardRoot = container.firstElementChild as HTMLDivElement | null;
    if (!cardRoot) {
      throw new Error("Missing card root");
    }

    expect(cardRoot.style.border).toContain("rgb(192, 132, 252)");
    expect(cardRoot.style.boxShadow).toContain("#c084fc");

    act(() => {
      root.unmount();
    });
  });

  it("renders character cards with the rarity-driven character chrome accent", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character", tides: [] })} />,
    );

    const cardRoot = container.firstElementChild as HTMLDivElement | null;
    if (!cardRoot) {
      throw new Error("Missing card root");
    }

    expect(cardRoot.style.border).toContain("rgba(168, 85, 247");
    expect(cardRoot.style.boxShadow).toBe("");

    act(() => {
      root.unmount();
    });
  });
});
