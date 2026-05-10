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
  it("renders the energy cost badge as a teal/cyan circular pip with no flame icon", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: 4 })} />,
    );

    const energyBadge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"energy\"]",
    );
    expect(energyBadge).not.toBeNull();
    expect(energyBadge?.textContent).toBe("4");
    expect(energyBadge?.getAttribute("aria-label")).toBe("energy cost");
    // The corner badge has no flame icon — only inline rules-text references do.
    const cornerFlame = container.querySelector(
      "i.bx.bxs-flame[aria-label=\"energy cost\"]",
    );
    expect(cornerFlame).toBeNull();
    // Teal/cyan fill, white text, black outline.
    const style = energyBadge?.getAttribute("style") ?? "";
    expect(style.toLowerCase()).toContain("rgb(14, 165, 233)");
    expect(style.toLowerCase()).toContain("color: rgb(255, 255, 255)");
    expect(style.toLowerCase()).toContain("text-shadow");
    // No bare ● glyph.
    expect(container.textContent).not.toContain("●");

    act(() => {
      root.unmount();
    });
  });

  it("renders the energy cost badge as 'X' for variable-cost (null) cards", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: null })} />,
    );

    const energyBadge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"energy\"]",
    );
    expect(energyBadge?.textContent).toBe("X");

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

  it("renders Event cards with a distinctive purple border chrome", () => {
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

  it("renders Character cards with a distinctive yellow border chrome", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character", tides: [] })} />,
    );

    const cardRoot = container.firstElementChild as HTMLDivElement | null;
    if (!cardRoot) {
      throw new Error("Missing card root");
    }

    expect(cardRoot.style.border).toContain("rgb(250, 204, 21)");
    expect(cardRoot.style.boxShadow).toContain("#facc15");

    act(() => {
      root.unmount();
    });
  });

  it("renders the spark badge as a gold circular pip with no ⍏ glyph", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character", spark: 4 })} />,
    );

    const sparkBadge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"spark\"]",
    );
    expect(sparkBadge).not.toBeNull();
    expect(sparkBadge?.textContent).toBe("4");
    // No bare spark glyph anywhere on the card.
    expect(container.textContent).not.toContain("⍏");
    // Gold fill on the badge.
    const style = sparkBadge?.getAttribute("style") ?? "";
    expect(style.toLowerCase()).toContain("rgb(250, 204, 21)");
    // White text with a black text-shadow outline.
    expect(style.toLowerCase()).toContain("color: rgb(255, 255, 255)");
    expect(style.toLowerCase()).toContain("text-shadow");

    act(() => {
      root.unmount();
    });
  });

  it("renders inline ⍏N spark references in rules text as a gold pip badge", () => {
    const { container, root } = mount(
      <CardDisplay
        card={makeCard({
          cardType: "Character",
          spark: 1,
          renderedText: "An ally gains ⍏3 this turn.",
        })}
      />,
    );

    // The inline reference is its own pip badge in addition to the stat
    // badge in the corner.
    const sparkBadges = container.querySelectorAll(
      "[data-pip-variant=\"spark\"]",
    );
    expect(sparkBadges.length).toBe(2);
    // No bare ⍏ glyph anywhere — including inside the rules text.
    expect(container.textContent).not.toContain("⍏");
    // The inline pip displays the value from the rules text.
    const inlineValues = Array.from(sparkBadges).map((b) => b.textContent);
    expect(inlineValues).toContain("3");

    act(() => {
      root.unmount();
    });
  });

  it("wraps the energy badge in a HoverPopover tooltip anchor", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ energyCost: 4 })} />,
    );

    const energyBadge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"energy\"]",
    );
    expect(energyBadge).not.toBeNull();
    // PipBadge wraps the badge in a span when a tooltip is set; without a
    // tooltip the badge would be the direct child of the positioning div.
    const wrapper = energyBadge?.parentElement;
    expect(wrapper?.tagName.toLowerCase()).toBe("span");

    act(() => {
      root.unmount();
    });
  });

  it("wraps the spark badge in a HoverPopover tooltip anchor", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Character", spark: 3 })} />,
    );

    const sparkBadge = container.querySelector<HTMLElement>(
      "[data-pip-variant=\"spark\"]",
    );
    expect(sparkBadge).not.toBeNull();
    const wrapper = sparkBadge?.parentElement;
    expect(wrapper?.tagName.toLowerCase()).toBe("span");

    act(() => {
      root.unmount();
    });
  });

  it("does not render a spark badge for Event cards", () => {
    const { container, root } = mount(
      <CardDisplay card={makeCard({ cardType: "Event", spark: null })} />,
    );

    expect(
      container.querySelector("[data-pip-variant=\"spark\"]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("uses parallel outline treatment so Character and Event chrome share width and softness", () => {
    const characterMount = mount(
      <CardDisplay card={makeCard({ cardType: "Character", tides: [] })} />,
    );
    const eventMount = mount(
      <CardDisplay
        card={makeCard({ cardType: "Event", spark: null })}
      />,
    );

    const characterRoot =
      characterMount.container.firstElementChild as HTMLDivElement | null;
    const eventRoot =
      eventMount.container.firstElementChild as HTMLDivElement | null;
    if (!characterRoot || !eventRoot) {
      throw new Error("Missing card root");
    }

    // Same border width (both render a 1px solid border).
    expect(characterRoot.style.borderWidth).toBe(eventRoot.style.borderWidth);
    expect(characterRoot.style.borderStyle).toBe(eventRoot.style.borderStyle);

    // Same softness: identical box-shadow expression except for the color token.
    const normalize = (shadow: string) =>
      shadow.replace(/#[0-9a-f]{6}/gi, "<color>");
    expect(normalize(characterRoot.style.boxShadow)).toBe(
      normalize(eventRoot.style.boxShadow),
    );

    act(() => {
      characterMount.root.unmount();
      eventMount.root.unmount();
    });
  });
});
