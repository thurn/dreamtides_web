// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import type { DeckCardView } from "./MobileDeckViewer";
import { DesktopDeckViewer } from "./DesktopDeckViewer";

function deckCard(index: number): DeckCardView {
  const card: CardData = {
    name: asCardName(`Deck Fixture ${String(index)}`),
    id: asCardId(`10000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: index,
    artOwned: false,
  };
  return {
    entryId: `entry-${String(index)}`,
    model: { cardId: card.id, displaySnapshot: card },
    isBane: false,
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
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DesktopDeckViewer", () => {
  it("uses the standard alpha scrim without blurring the scene", () => {
    const { container, root } = mount(
      <DesktopDeckViewer
        view={{ cards: [], dreamAvatar: null, dreamsigns: [], tides: [] }}
        onClose={vi.fn()}
      />,
    );

    const backdrop = container.querySelector<HTMLElement>(
      '[data-testid="deck-viewer-backdrop"]',
    );

    expect(backdrop?.style.background).toBe("var(--scrim-gallery)");
    expect(backdrop?.getAttribute("style")).not.toContain("backdrop-filter");

    act(() => {
      root.unmount();
    });
  });

  it("selects sort direction from a two-arrow segmented control", () => {
    const { container, root } = mount(
      <DesktopDeckViewer
        view={{ cards: [], dreamAvatar: null, dreamsigns: [], tides: [] }}
        onClose={vi.fn()}
      />,
    );

    const ascending = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort ascending"]',
    );
    const descending = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort descending"]',
    );

    expect(ascending?.textContent).toBe("↑");
    expect(descending?.textContent).toBe("↓");
    expect(ascending?.getAttribute("aria-selected")).toBe("true");
    expect(descending?.getAttribute("aria-selected")).toBe("false");

    act(() => {
      descending?.click();
    });

    expect(ascending?.getAttribute("aria-selected")).toBe("false");
    expect(descending?.getAttribute("aria-selected")).toBe("true");

    act(() => {
      root.unmount();
    });
  });

  it("centers up to three filtered cards at the reading-width floor", () => {
    const { container, root } = mount(
      <DesktopDeckViewer
        view={{
          cards: [deckCard(1), deckCard(2), deckCard(3)],
          dreamAvatar: null,
          dreamsigns: [],
          tides: [],
        }}
        onClose={vi.fn()}
      />,
    );

    const grid = container.querySelector<HTMLElement>("[data-deck-card-grid]");
    expect(grid?.dataset.deckCardGridLowCount).toBe("true");
    expect(grid?.style.gridTemplateColumns).toBe("repeat(3, 240px)");
    expect(grid?.style.justifyContent).toBe("center");

    act(() => root.unmount());
  });

  it("shows current journey tides two per row with the shared tide reveal", () => {
    const { container, root } = mount(
      <DesktopDeckViewer
        view={{
          cards: [],
          dreamAvatar: null,
          dreamsigns: [],
          tides: [
            {
              id: "tide-a",
              label: "First Tide",
              description: "First path.",
              tide: "ember",
            },
            {
              id: "tide-b",
              label: "Second Tide",
              description: "Second path.",
              tide: "vision",
            },
            {
              id: "tide-c",
              label: "Third Tide",
              description: "Third path.",
              tide: "wild",
            },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    const section = container.querySelector<HTMLElement>("[data-deck-tides]");
    const grid = section?.querySelector<HTMLElement>("[data-deck-tides-grid]");
    const discs = section?.querySelectorAll<HTMLElement>("[data-tide-disc]");

    expect(grid?.style.gridTemplateColumns).toBe("repeat(2, max-content)");
    expect(discs).toHaveLength(3);
    expect(discs?.[0]?.dataset.revealPrimaryVariant).toBe("tide");
    expect(discs?.[0]?.dataset.revealSecondaryTitles).toBe("Tides");
    expect(discs?.[0]?.getAttribute("aria-label")).not.toBe("");

    act(() => root.unmount());
  });

  it("omits the tide section when the run has no selected tides", () => {
    const { container, root } = mount(
      <DesktopDeckViewer
        view={{ cards: [], dreamAvatar: null, dreamsigns: [], tides: [] }}
        onClose={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-deck-tides]")).toBeNull();

    act(() => root.unmount());
  });
});
