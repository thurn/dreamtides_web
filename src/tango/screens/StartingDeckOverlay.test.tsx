// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { StartingDeckOverlay } from "./StartingDeckOverlay";
import type { StartingDeckView } from "./StartingDeckOverlay";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
  logEventOnce: vi.fn(),
}));

// GameCard pulls in the card-database art pipeline; the overlay's behavior does
// not depend on the card's pixels, so stub it to its name for the tests.
vi.mock("../components/card/CardView", () => ({
  GameCard: ({ card }: { card: CardData }) => <div>{card.name}</div>,
}));

function makeCard(cardNumber: number, name: string, text: string): CardData {
  return {
    name: asCardName(name),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: text,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeView(): StartingDeckView {
  return {
    cards: [
      {
        entryId: "entry-1",
        card: makeCard(1, "Archive Sentry", "Hold the line."),
        glossaryText: "Hold the line.",
        testId: "starting-deck-modal-card-entry-1",
      },
      {
        entryId: "entry-2",
        card: makeCard(2, "Glimpse of What Was", "Draw a card."),
        glossaryText: "Draw a card.",
        testId: "starting-deck-modal-card-entry-2",
      },
    ],
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

/** The glass panel is the header's parent; the scroll body is its next sibling. */
function panelOf(container: HTMLElement): HTMLElement | null {
  const header = container.querySelector("header");
  return (header?.parentElement as HTMLElement | null) ?? null;
}

function setDesktopViewport(isDesktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Narrow viewport by default so useIsDesktop() is false (full-bleed mobile).
  setDesktopViewport(false);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StartingDeckOverlay", () => {
  it("renders nothing when closed", () => {
    const { container, root } = mount(
      <StartingDeckOverlay isOpen={false} view={makeView()} onClose={vi.fn()} />,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector(
        "[data-testid='starting-deck-modal-card-entry-1']",
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders the starting cards in acquisition order with the intro copy", () => {
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={vi.fn()} />,
    );

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const title = container.querySelector("h2");
    expect(title?.textContent).toBe("Starting Deck");
    expect(dialog?.textContent).toContain(
      "These are the cards you begin the quest with.",
    );

    const cards = Array.from(
      container.querySelectorAll("[data-testid^='starting-deck-modal-card-']"),
    );
    expect(
      cards.map((c) => c.getAttribute("data-testid")),
    ).toEqual([
      "starting-deck-modal-card-entry-1",
      "starting-deck-modal-card-entry-2",
    ]);

    act(() => {
      root.unmount();
    });
  });

  it("renders a full-bleed panel on mobile with an internally scrolling body", () => {
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={vi.fn()} />,
    );

    const panel = panelOf(container);
    expect(panel).not.toBeNull();
    // Full-bleed: the panel fills the overlay rather than being capped.
    expect(panel?.style.width).toBe("100%");
    expect(panel?.style.height).toBe("100%");
    expect(panel?.style.maxWidth).toBe("");
    // The body scrolls internally.
    const scroll = container.querySelector("header")
      ?.nextElementSibling as HTMLElement | null;
    expect(scroll?.style.overflowY).toBe("auto");

    act(() => {
      root.unmount();
    });
  });

  it("renders a bounded, centered panel on desktop", () => {
    setDesktopViewport(true);
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={vi.fn()} />,
    );

    const panel = panelOf(container);
    expect(panel?.style.maxWidth).toContain("min(");
    expect(panel?.style.maxHeight).toBe("85vh");
    expect(panel?.style.height).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("exposes only a labeled close control (no Continue/sort/filter/summary chrome)", () => {
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={vi.fn()} />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Close starting deck");

    const text = container.textContent ?? "";
    expect(text).not.toContain("Continue");
    expect(text).not.toContain("Sort");
    expect(text).not.toContain("Filter");

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when the close disc is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={onClose} />,
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Close starting deck"]',
        )
        ?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    const { root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={onClose} />,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("does not dismiss on a click of the panel or backdrop (close disc or Escape only)", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={makeView()} onClose={onClose} />,
    );

    const panel = panelOf(container);
    const backdrop = container.querySelector('[role="dialog"]');
    act(() => {
      panel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("renders the empty-state placeholder when the deck is empty", () => {
    const { container, root } = mount(
      <StartingDeckOverlay isOpen view={{ cards: [] }} onClose={vi.fn()} />,
    );

    expect(container.textContent).toContain("No cards in starting deck.");
    expect(
      container.querySelector("[data-testid^='starting-deck-modal-card-']"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
