// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import {
  CardHoverPreview,
  definitionSideForCardHover,
} from "./CardHoverPreview";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: "Preview Card",
    id: "preview-card",
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    tides: ["alpha"],
    renderedText: "Gain a Bane. Reclaim that bane.",
    imageNumber: 1,
    artOwned: false,
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

describe("CardHoverPreview", () => {
  it("renders deduplicated glossary definitions in card text order", () => {
    const { container, root } = mount(
      <CardHoverPreview
        card={makeCard({
          renderedText: "Gain a Bane. Reclaim that bane. Materialize it.",
        })}
        testId="preview-card"
        widthPx={240}
        popoverSide="left"
        anchorRect={{ left: 1000, right: 1040 } as DOMRect}
      />,
    );

    const stack = container.querySelector(
      "[data-testid='preview-card-definition-stack']",
    );
    expect(stack).not.toBeNull();
    expect(stack?.getAttribute("data-definition-side")).toBe("left");
    const terms = Array.from(
      stack?.querySelectorAll("p:first-child") ?? [],
    ).map((term) => term.textContent);
    expect(terms).toEqual(["Bane", "Reclaim", "Materialize"]);

    act(() => {
      root.unmount();
    });
  });

  it("does not render an empty definition stack for cards without terms", () => {
    const { container, root } = mount(
      <CardHoverPreview
        card={makeCard({ renderedText: "Draw a card." })}
        testId="preview-card"
        widthPx={240}
        popoverSide="left"
        anchorRect={{ left: 1000, right: 1040 } as DOMRect}
      />,
    );

    expect(
      container.querySelector("[data-testid='preview-card-definition-stack']"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});

describe("definitionSideForCardHover", () => {
  it("uses the opposite horizontal side from edge-flipped card popovers", () => {
    expect(
      definitionSideForCardHover({
        anchorRect: { left: 1000, right: 1040 },
        popoverSide: "left",
        viewportWidth: 1280,
      }),
    ).toBe("left");
    expect(
      definitionSideForCardHover({
        anchorRect: { left: 16, right: 56 },
        popoverSide: "right",
        viewportWidth: 1280,
      }),
    ).toBe("right");
  });

  it("chooses the side away from the nearest viewport edge for vertical popovers", () => {
    expect(
      definitionSideForCardHover({
        anchorRect: { left: 1100, right: 1140 },
        popoverSide: "top",
        viewportWidth: 1280,
      }),
    ).toBe("left");
    expect(
      definitionSideForCardHover({
        anchorRect: { left: 120, right: 160 },
        popoverSide: "bottom",
        viewportWidth: 1280,
      }),
    ).toBe("right");
  });
});
