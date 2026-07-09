// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { CardGalleryPanel } from "./CardGalleryPanel";
import { MOBILE_CARD_PEEK_HOLD_MS } from "./MobileCardPeek";

vi.mock("./CardView", () => ({
  GameCard: ({
    card,
    large,
    termDefinitions,
  }: {
    card: CardData;
    large?: boolean;
    termDefinitions?: "card" | "none";
  }) => (
    <div
      data-game-card-large={large ? "true" : "false"}
      data-game-card-terms={termDefinitions ?? "card"}
    >
      {card.name}
    </div>
  ),
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
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 393,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 852,
  });
  document.documentElement.style.setProperty("--safe-top", "24px");
  document.documentElement.style.setProperty("--safe-area-inset-top", "0px");
  document.documentElement.style.setProperty("--safe-bottom", "20px");
  document.documentElement.style.setProperty("--gutter", "16px");
  document.documentElement.style.setProperty("--space-3", "12px");
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
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
    expect(container.querySelector("h2")?.style.textShadow).toBe("");
    expect(container.querySelector("p")?.style.textShadow).toBe("");
    expect(container.querySelector("header")?.style.alignItems).toBe("center");
    expect(container.querySelector("section")?.style.borderRadius).toBe(
      "var(--radius-popover)",
    );
    expect(container.querySelector("section")?.dataset.galleryFrame).toBe(
      "floating",
    );
    expect(container.querySelector("section")?.dataset.galleryColumns).toBe(
      "5",
    );
    expect(container.querySelector("header")?.style.padding).toBe(
      "var(--space-8)",
    );
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
      container.querySelector('[data-testid="gallery-action"]')?.getAttribute(
        "data-glass-placement",
      ),
    ).toBe("onGlass");
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
        columns="two"
        frame="fullBleed"
        spacing="compact"
        onCardPress={onCardPress}
      />,
    );

    expect(container.querySelector("section")?.dataset.galleryFrame).toBe(
      "fullBleed",
    );
    expect(container.querySelector("section")?.dataset.galleryColumns).toBe(
      "2",
    );
    expect(container.querySelector("section")?.style.borderRadius).toBe("0px");
    expect(container.querySelector("section")?.style.background).toBe(
      "var(--scrim-gallery)",
    );
    expect(
      container.querySelector("section")?.getAttribute("style"),
    ).not.toContain("backdrop-filter");
    expect(container.querySelector("section")?.style.borderStyle).toBe("none");
    expect(container.querySelector("section")?.style.boxShadow).toBe("none");
    expect(container.querySelector("header")?.style.padding).toBe(
      "var(--space-5)",
    );
    expect(
      container
        .querySelector("[data-game-card-terms]")
        ?.getAttribute("data-game-card-terms"),
    ).toBe("card");
    expect(
      container.querySelector('[data-testid="gallery-close"]')?.getAttribute(
        "data-glass-placement",
      ),
    ).toBe("onMedia");

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

  it("can render readable large cards and delegate terms to the mobile press preview", () => {
    const { container, root } = mount(
      <CardGalleryPanel
        title="Starting Deck"
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
            testId: "gallery-card-a",
          },
        ]}
        columns="four"
        largeCards
        mobilePressPreview
      />,
    );

    const card = container.querySelector("[data-game-card-large]");
    expect(card?.getAttribute("data-game-card-large")).toBe("true");
    expect(card?.getAttribute("data-game-card-terms")).toBe("none");
    expect(container.querySelector("section")?.dataset.galleryColumns).toBe(
      "4",
    );

    act(() => {
      root.unmount();
    });
  });
  it("provides an intermediate spacing scale for narrow four-column galleries", () => {
    const { container, root } = mount(
      <CardGalleryPanel
        title="Purge Cards"
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
          },
        ]}
        columns="four"
        spacing="medium"
      />,
    );

    const gallery = container.querySelector<HTMLElement>("section");
    const header = gallery?.querySelector<HTMLElement>("header");
    const body = header?.nextElementSibling as HTMLElement | null;
    expect(gallery?.dataset.gallerySpacing).toBe("medium");
    expect(header?.style.padding).toBe("var(--space-6)");
    expect(body?.style.padding).toBe("var(--space-5)");
    expect(body?.firstElementChild?.getAttribute("style")).toContain(
      "gap: var(--space-4)",
    );

    act(() => {
      root.unmount();
    });
  });

  it("pins a UUID-identified first-row card preview to the viewport edge", () => {
    vi.useFakeTimers();
    const cards = Array.from({ length: 5 }, (_, index) => ({
      entryId: `entry-${String(index)}`,
      card: {
        ...makeCard(`Fixture ${String(index)}`),
        id: asCardId(
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
        renderedText: index === 0 ? "Foresee 1." : "Draw a card.",
      },
      testId: `gallery-card-${String(index)}`,
    }));
    const { container, root } = mount(
      <CardGalleryPanel
        title="Starting Deck"
        cards={cards}
        columns="four"
        spacing="compact"
        mobilePressPreview
      />,
    );
    const firstTile = container.querySelector<HTMLElement>(
      '[data-testid="gallery-card-0"]',
    );
    if (firstTile === null) throw new Error("Missing first-row UUID fixture");
    firstTile.getBoundingClientRect = () =>
      ({
        left: 110,
        top: 360,
        width: 80,
        height: 80,
        right: 190,
        bottom: 440,
        x: 110,
        y: 360,
        toJSON: () => ({}),
      }) as DOMRect;
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperties(pointerDown, {
      pointerId: { value: 7 },
      button: { value: 0 },
      clientX: { value: 150 },
      clientY: { value: 400 },
    });

    act(() => {
      firstTile.dispatchEvent(pointerDown);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });

    const preview = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-card]",
    );
    const definitions = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-definitions]",
    );
    expect(preview?.style.top).toBe("0px");
    expect(definitions?.style.top).toBe("0px");
    const previewLeft = Number.parseFloat(preview?.style.left ?? "NaN");
    const previewRight =
      previewLeft + Number.parseFloat(preview?.style.width ?? "NaN");
    const definitionsLeft = Number.parseFloat(
      definitions?.style.left ?? "NaN",
    );
    const definitionsRight =
      definitionsLeft + Number.parseFloat(definitions?.style.width ?? "NaN");
    expect(
      definitionsRight <= previewLeft || definitionsLeft >= previewRight,
    ).toBe(true);
    expect(definitionsLeft).toBeGreaterThanOrEqual(150 + 44 + 8);

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
      root.unmount();
    });
  });

  it("cancels preview and card activation when movement becomes a scroll gesture", () => {
    vi.useFakeTimers();
    const onCardPress = vi.fn();
    const { container, root } = mount(
      <CardGalleryPanel
        title="Purge Cards"
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
            testId: "gallery-card-a",
          },
        ]}
        columns="four"
        mobilePressPreview
        onCardPress={onCardPress}
      />,
    );
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="gallery-card-a"]',
    );
    if (tile === null) throw new Error("Missing gallery card fixture");
    tile.getBoundingClientRect = () =>
      ({
        left: 110,
        top: 360,
        width: 80,
        height: 80,
        right: 190,
        bottom: 440,
        x: 110,
        y: 360,
        toJSON: () => ({}),
      }) as DOMRect;
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperties(pointerDown, {
      pointerId: { value: 21 },
      button: { value: 0 },
      clientX: { value: 150 },
      clientY: { value: 400 },
    });
    const pointerMove = new Event("pointermove", { bubbles: true });
    Object.defineProperties(pointerMove, {
      pointerId: { value: 21 },
      clientX: { value: 150 },
      clientY: { value: 411 },
    });

    act(() => {
      tile.dispatchEvent(pointerDown);
      tile.dispatchEvent(pointerMove);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
      tile.click();
    });

    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).toBeNull();
    expect(onCardPress).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("keeps a short stationary tap selectable without opening the hold preview", () => {
    vi.useFakeTimers();
    const onCardPress = vi.fn();
    const { container, root } = mount(
      <CardGalleryPanel
        title="Purge Cards"
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
            testId: "gallery-card-a",
          },
        ]}
        columns="four"
        mobilePressPreview
        onCardPress={onCardPress}
      />,
    );
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="gallery-card-a"]',
    );
    if (tile === null) throw new Error("Missing gallery card fixture");
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperties(pointerDown, {
      pointerId: { value: 22 },
      button: { value: 0 },
      clientX: { value: 150 },
      clientY: { value: 400 },
    });

    act(() => {
      tile.dispatchEvent(pointerDown);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS - 1);
      window.dispatchEvent(new Event("pointerup"));
      tile.click();
    });

    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).toBeNull();
    expect(onCardPress).toHaveBeenCalledWith("entry-a");

    act(() => root.unmount());
  });

  it("previews a true hold without activating the card on release", () => {
    vi.useFakeTimers();
    const onCardPress = vi.fn();
    const { container, root } = mount(
      <CardGalleryPanel
        title="Purge Cards"
        cards={[
          {
            entryId: "entry-a",
            card: makeCard("Archive Sentry"),
            testId: "gallery-card-a",
          },
        ]}
        columns="four"
        mobilePressPreview
        onCardPress={onCardPress}
      />,
    );
    const tile = container.querySelector<HTMLElement>(
      '[data-testid="gallery-card-a"]',
    );
    if (tile === null) throw new Error("Missing gallery card fixture");
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperties(pointerDown, {
      pointerId: { value: 23 },
      button: { value: 0 },
      clientX: { value: 150 },
      clientY: { value: 400 },
    });

    act(() => {
      tile.dispatchEvent(pointerDown);
      vi.advanceTimersByTime(MOBILE_CARD_PEEK_HOLD_MS);
    });
    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).not.toBeNull();

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
      tile.click();
    });

    expect(
      document.body.querySelector("[data-mobile-card-peek-card]"),
    ).toBeNull();
    expect(onCardPress).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
