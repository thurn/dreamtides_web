// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStableDigest } from "../../types/stable-digest";
import { parseCardName, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { AugurySiteScreen, type AugurySiteView } from "./AugurySiteScreen";
import {
  StartingDeckOverlay,
  type StartingDeckView,
} from "./StartingDeckOverlay";
import {
  parseAuguryCardViewId,
  parseChoiceId,
  parseDeckEntryId,
  parseOfferId,
  parseSiteId,
} from "../../types/identifiers";
import {
  testCardId,
  testGuideId,
  testOfferTileId,
} from "../../types/test-identities";
import type { CardViewProps } from "../components/card/CardView";
import type { DomTestId } from "../types/dom";
import { renderInCumulus } from "../testing/render";

// GameCard does not expose its selection state in the DOM; this stub surfaces
// it as `data-selection` and keeps the card-art pipeline out of these tests.
vi.mock("../components/card/CardView", async () => {
  const { Pressable } = await import("../primitives/Pressable");
  return {
    CardView: ({ card }: Pick<CardViewProps, "card">) => (
      <div data-card-view-id={card.id} />
    ),
    GameCard: ({
      model,
      onPress,
      selection,
      testId,
    }: {
      model: { cardId: CardId };
      onPress?: () => void;
      selection?: string;
      testId?: DomTestId;
    }) => (
      <Pressable
        as={onPress === undefined ? "div" : "button"}
        data-testid={testId}
        data-card-id={model.cardId}
        data-selection={selection}
        onClick={onPress}
      />
    ),
  };
});

function stubMatchMedia(matches: (query: string) => boolean): void {
  window.matchMedia = (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function card(index: number): CardData {
  return {
    id: testCardId(
      `81000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    name: parseCardName(`Fixture ${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
}

function q(container: ParentNode, marker: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${marker}"]`);
}

function click(element: Element | null): void {
  if (!(element instanceof HTMLElement)) throw new Error("missing element");
  act(() => element.click());
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("AugurySiteScreen", () => {
  const PRESENTATION = {
    headline: { kind: "text", text: "Fixture headline" },
    subtitle: { kind: "text", text: "Fixture subtitle" },
  } as const;

  function view(): AugurySiteView {
    const choices = [card(1), card(2), card(3), card(4)];
    const direct = card(5);
    return {
      siteId: parseSiteId("augury-site"),
      scene: null,
      encounterSignature: parseStableDigest(
        "4c5aecf36130bcce907ec76f5ed298eb2f19cc3c48a12668a0d08126daef56df",
      ),
      guide: {
        id: testGuideId("aldric_the_seer"),
        name: "Aldric, the Seer",
        line: "Choose one path for your dream.",
        art: artRef.dreamGuide(testGuideId("aldric_the_seer")),
      },
      offers: [
        {
          id: parseOfferId("A"),
          requiresSelection: true,
          presentation: PRESENTATION,
          tile: {
            id: testOfferTileId("encounter-fixture:A"),
            kind: "card-draft",
            cards: choices.map((choice) => ({
              cardId: choice.id,
              displaySnapshot: choice,
            })) as never,
          },
          visual: {
            kind: "cardChoices",
            doubled: false,
            choices: choices.map((choice, index) => ({
              id: parseChoiceId(`choice-${String(index + 1)}`),
              card: {
                id: parseAuguryCardViewId(choice.id),
                model: { cardId: choice.id, displaySnapshot: choice },
              },
            })),
          },
        },
        {
          id: parseOfferId("B"),
          requiresSelection: false,
          presentation: PRESENTATION,
          tile: {
            id: testOfferTileId("encounter-fixture:B"),
            kind: "card-gift",
            card: direct,
          },
          visual: {
            kind: "cards",
            cards: [
              {
                id: parseAuguryCardViewId(direct.id),
                model: { cardId: direct.id, displaySnapshot: direct },
              },
            ],
          },
        },
      ],
      unavailableMessage: null,
    };
  }

  function mount(
    siteView: AugurySiteView,
    props: Partial<Parameters<typeof AugurySiteScreen>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <AugurySiteScreen
        view={siteView}
        onChoose={() => ({ ok: true })}
        onClose={() => undefined}
        {...props}
      />,
    ).container;
  }

  const phase = (container: HTMLElement): string | undefined =>
    container.querySelector<HTMLElement>("[data-augury-phase]")?.dataset
      .auguryPhase;
  const composition = (container: HTMLElement): string | null | undefined =>
    container
      .querySelector("[data-site-layout]")
      ?.getAttribute("data-site-layout-composition");
  const selection = (container: HTMLElement, choice: string): string | null =>
    q(container, `cumulus-augury-choice-${choice}`)?.getAttribute(
      "data-selection",
    ) ?? null;

  beforeEach(() => stubMatchMedia(() => true));

  it("stages two offer tiles with the guide and decline action", () => {
    const onClose = vi.fn();
    const container = mount(view(), { onClose });

    expect(phase(container)).toBe("comparison");
    expect(container.querySelectorAll("[data-offer-tile]")).toHaveLength(2);
    expect(
      container
        .querySelector("[data-site-layout-guide]")
        ?.getAttribute("data-guide-id"),
    ).toBe("aldric_the_seer");
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(
      0,
    );
    expect(q(container, "cumulus-augury-choice-choice-1")).toBeNull();
    expect(q(container, "cumulus-augury-detail")).toBeNull();

    click(q(container, "cumulus-augury-decline"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports rerolls from the debug control", () => {
    const onReroll = vi.fn();
    const container = mount(view(), { onReroll });
    click(q(container, "reroll-augury-offers"));
    expect(onReroll).toHaveBeenCalledOnce();
  });

  it("opens one vision before exposing its detailed candidate pick", () => {
    const onInspectOffer = vi.fn();
    const container = mount(view(), { onInspectOffer });

    click(q(container, "cumulus-augury-offer-A"));

    expect(onInspectOffer).toHaveBeenCalledWith("A");
    expect(phase(container)).toBe("detail");
    expect(q(container, "cumulus-augury-detail")?.dataset.offerId).toBe("A");
    expect(container.querySelectorAll("[data-offer-tile]")).toHaveLength(0);
    expect(q(container, "cumulus-augury-offer-B")).toBeNull();
    expect(
      container.querySelectorAll('[data-testid^="cumulus-augury-choice-"]'),
    ).toHaveLength(4);
    expect(composition(container)).toBe("content-led-expanded-revelation");
    expect(
      container
        .querySelector("[data-card-choice-grid-columns]")
        ?.getAttribute("data-card-choice-grid-columns"),
    ).toBe("4");
    expect(q(container, "cumulus-augury-choose-again")).not.toBeNull();
  });

  it("requires an inner candidate pick in detail, then confirms the selected offer", () => {
    const onChoose = vi.fn(() => ({ ok: true }) as const);
    const container = mount(view(), { onChoose });

    click(q(container, "cumulus-augury-offer-A"));
    const confirm = q(container, "cumulus-augury-confirm-A");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");

    click(q(container, "cumulus-augury-choice-choice-1"));
    expect(selection(container, "choice-1")).toBe("highlighted");
    click(confirm);
    expect(onChoose).toHaveBeenCalledWith("A", "choice-1");
  });

  it("marks a doubled card choice with a quantity badge", () => {
    const doubledView = view();
    const first = doubledView.offers[0];
    if (first?.visual.kind !== "cardChoices") {
      throw new Error("missing card-choice fixture");
    }
    const container = mount({
      ...doubledView,
      offers: [
        { ...first, visual: { ...first.visual, doubled: true } },
        doubledView.offers[1],
      ],
    });

    click(q(container, "cumulus-augury-offer-A"));
    click(q(container, "cumulus-augury-choice-choice-2"));

    expect(selection(container, "choice-2")).toBe("highlighted");
    expect(
      container.querySelector("[data-card-choice-quantity-badge]"),
    ).not.toBeNull();
  });

  it("previews a direct offer before enabling its separate confirmation", () => {
    const onChoose = vi.fn(() => ({ ok: true }) as const);
    const container = mount(view(), { onChoose });

    click(q(container, "cumulus-augury-offer-B"));
    expect(onChoose).not.toHaveBeenCalled();
    expect(composition(container)).toBe("content-led-expanded-revelation");
    click(q(container, "cumulus-augury-confirm-B"));
    expect(onChoose).toHaveBeenCalledWith("B", null);
  });

  it("renders an added site through the canonical non-interactive SiteNode", () => {
    const base = view();
    const first = base.offers[0];
    if (first === undefined) throw new Error("missing fixture offer");
    const container = mount({
      ...base,
      offers: [
        {
          ...first,
          requiresSelection: false,
          visual: {
            kind: "site",
            model: {
              id: parseSiteId("augury-preview:Shop"),
              type: "Shop",
              isVisited: false,
              pos: { x: 50, y: 50 },
              index: 0,
              isBattle: false,
              isLocked: false,
              isInteractive: false,
              label: "Fixture site",
              blurb: "Fixture blurb.",
              icon: GLYPHS.gift,
            },
          },
        },
        base.offers[1],
      ],
    });

    click(q(container, "cumulus-augury-offer-A"));

    expect(
      container.querySelector(
        '[data-augury-site-preview] [data-site-type="Shop"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-augury-site-preview] [data-interactive="false"]',
      ),
    ).not.toBeNull();
  });

  it("returns to both previews and clears an abandoned inner choice", () => {
    const container = mount(view());

    click(q(container, "cumulus-augury-offer-A"));
    click(q(container, "cumulus-augury-choice-choice-1"));
    click(q(container, "cumulus-augury-choose-again"));
    expect(phase(container)).toBe("comparison");
    click(q(container, "cumulus-augury-offer-A"));

    expect(selection(container, "choice-1")).toBeNull();
    expect(
      q(container, "cumulus-augury-confirm-A")?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("keeps rejected-action feedback inside the selected detail panel", () => {
    const container = mount(view(), {
      onChoose: () => ({ ok: false, message: "Fixture rejection" }),
    });
    click(q(container, "cumulus-augury-offer-B"));
    click(q(container, "cumulus-augury-confirm-B"));
    expect(q(container, "cumulus-augury-error")?.textContent).toBe(
      "Fixture rejection",
    );
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(
      1,
    );
  });

  it("shows the unavailable explanation with one exit action", () => {
    const container = mount({
      ...view(),
      encounterSignature: null,
      offers: [],
      unavailableMessage: "Fixture unavailable",
    });
    expect(container.textContent).toContain("Fixture unavailable");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("[data-glass-panel-frame]")).toBeNull();
  });
});

describe("StartingDeckOverlay", () => {
  function makeView(cardCount = 2): StartingDeckView {
    return {
      cards: Array.from({ length: cardCount }, (_, index) => {
        const displaySnapshot = card(index + 1);
        return {
          entryId: parseDeckEntryId(`entry-${String(index + 1)}`),
          model: { cardId: displaySnapshot.id, displaySnapshot },
          testId: `starting-deck-modal-card-entry-${String(index + 1)}`,
        };
      }),
    };
  }

  function mount(
    props: Partial<Parameters<typeof StartingDeckOverlay>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <StartingDeckOverlay
        isOpen
        view={makeView()}
        onClose={vi.fn()}
        {...props}
      />,
    ).container;
  }

  const gallery = (container: HTMLElement): HTMLElement | null =>
    container.querySelector("[data-gallery-frame]");
  const cards = (container: HTMLElement): Element[] =>
    Array.from(
      container.querySelectorAll("[data-testid^='starting-deck-modal-card-']"),
    );

  beforeEach(() => stubMatchMedia(() => false));

  it("renders nothing when closed", () => {
    const container = mount({ isOpen: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(cards(container)).toHaveLength(0);
  });

  it("renders the starting cards in acquisition order in a full-bleed scrolling mobile gallery", () => {
    const container = mount();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(cards(container).map((c) => c.getAttribute("data-testid"))).toEqual([
      "starting-deck-modal-card-entry-1",
      "starting-deck-modal-card-entry-2",
    ]);
    expect(gallery(container)?.dataset.galleryFrame).toBe("fullBleed");
    expect(gallery(container)?.dataset.galleryColumns).toBe("4");
    expect(
      container.querySelector<HTMLElement>("[data-glass-panel-content] > div")
        ?.style.overflowY,
    ).toBe("auto");
  });

  it("bounds a large deck in a floating desktop panel with a scrolling peek", () => {
    stubMatchMedia(
      (query) => query.includes("min-width") && !query.includes("min-height"),
    );
    const container = mount({ view: makeView(20) });

    expect(gallery(container)?.parentElement?.style.maxHeight).toContain(
      "100vh",
    );
    expect(gallery(container)?.dataset.galleryFrame).toBe("floating");
    expect(gallery(container)?.dataset.galleryColumns).toBe("5");
    expect(gallery(container)?.dataset.galleryVisibleRows).toBe("2.5");
    expect(cards(container)).toHaveLength(20);
  });

  it("closes from its single action or Escape, never from a panel or backdrop click", () => {
    const onClose = vi.fn();
    const container = mount({ onClose });

    const backdrop = container.querySelector('[role="dialog"]');
    act(() => {
      gallery(container)?.parentElement?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    act(() => buttons[0]?.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders the empty-state placeholder when the deck is empty", () => {
    const container = mount({ view: { cards: [] } });
    expect(
      container.querySelector('[role="dialog"] [data-card-gallery-empty]'),
    ).not.toBeNull();
    expect(cards(container)).toHaveLength(0);
  });
});
