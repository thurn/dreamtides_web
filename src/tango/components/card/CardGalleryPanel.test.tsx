// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { CardGalleryPanel } from "./CardGalleryPanel";

vi.mock("./CardView", () => ({
  GameCard: ({ card }: { card: CardData }) => <div>{card.name}</div>,
}));

function makeCard(name: string): CardData {
  return {
    name: asCardName(name),
    id: asCardId(name.toLowerCase().replace(/ /g, "-")),
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 1,
    artOwned: true,
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
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CardGalleryPanel", () => {
  it("renders a left-aligned title, subtitle, accessory, and card grid", () => {
    const { container, root } = mount(
      <CardGalleryPanel
        title="Purge Cards"
        subtitle="Choose cards to remove from your deck"
        rightAccessory={{
          kind: "glassButton",
          label: "Purge 1:",
          cost: 40,
          onPress: () => {},
          testId: "gallery-action",
        }}
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
            testId: "gallery-card-a",
          },
        ]}
      />,
    );

    expect(container.querySelector("h2")?.textContent).toBe("Purge Cards");
    expect(container.textContent).toContain(
      "Choose cards to remove from your deck",
    );
    expect(
      container.querySelector('[data-testid="gallery-action"]')?.textContent,
    ).toContain("Purge 1:");
    expect(
      container.querySelector('[data-testid="gallery-action"]')?.textContent,
    ).toContain("40");
    expect(
      container.querySelector('[data-testid="gallery-card-a"]')?.textContent,
    ).toContain("Archive Sentry");

    act(() => {
      root.unmount();
    });
  });

  it("fires card press callbacks by entry id and supports icon accessories", () => {
    const onCardPress = vi.fn();
    const onClose = vi.fn();
    const { container, root } = mount(
      <CardGalleryPanel
        title="Starting Deck"
        rightAccessory={{
          kind: "iconButton",
          glyph: GLYPHS.close,
          label: "Close starting deck",
          onPress: onClose,
          testId: "gallery-close",
        }}
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
            testId: "gallery-card-a",
          },
        ]}
        onCardPress={onCardPress}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="gallery-card-a"]')
        ?.click();
    });
    expect(onCardPress).toHaveBeenCalledWith("entry-a");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="gallery-close"]')
        ?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
