// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { artRef } from "../primitives/art";
import { resolveColor } from "../primitives/color";
import { GLYPHS } from "../primitives/glyph";
import { CumulusRoot } from "../CumulusRoot";
import {
  DreamAugurySiteScreen,
  type DreamAugurySiteView,
} from "./DreamAugurySiteScreen";

vi.mock("../components/card/CardView", async () => {
  const { Pressable } = await import("../primitives/Pressable");
  return {
    CardView: ({ card }: { card: { id: string } }) => (
      <div data-card-view-id={card.id} />
    ),
    GameCard: ({
      model,
      onActivate,
      selected,
      selectionColor,
      testId,
    }: {
      model: { cardId: string };
      onActivate?: () => void;
      selected?: boolean;
      selectionColor?: string;
      testId?: string;
    }) => (
      <Pressable
        as="button"
        data-testid={testId}
        data-card-id={model.cardId}
        data-selected={selected ? "true" : "false"}
        data-selection-color={selectionColor}
        onClick={onActivate}
      />
    ),
  };
});

const roots: Root[] = [];

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = (query: string) => ({
    matches,
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
    id: asCardId(`81000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    name: asCardName(`Fixture ${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
}

function view(): DreamAugurySiteView {
  const choices = [card(1), card(2), card(3), card(4)];
  const direct = card(5);
  return {
    siteId: "augury-site",
    scene: null,
    encounterSignature: "encounter-fixture",
    guide: {
      id: "aldric_the_seer",
      name: "Aldric, the Seer",
      line: "Choose one path for your dream.",
      art: artRef.dreamGuide("aldric_the_seer"),
    },
    offers: [
      {
        id: "A",
        headline: "Choose a Card",
        subtitle: "Choose a card to add to your deck.",
        requiresSelection: true,
        tile: {
          id: "encounter-fixture:A",
          kind: "card-draft",
          cards: choices.map((choice) => ({ cardId: choice.id, displaySnapshot: choice })) as never,
        },
        visual: {
          kind: "cardChoices",
          doubled: false,
          choices: choices.map((choice, index) => ({
            id: `choice-${String(index + 1)}`,
            card: {
              id: choice.id,
              model: { cardId: choice.id, displaySnapshot: choice },
            },
          })),
        },
      },
      {
        id: "B",
        headline: "Gain Fixture 5",
        subtitle: "Add a card to your deck.",
        requiresSelection: false,
        tile: {
          id: "encounter-fixture:B",
          kind: "card-gift",
          card: { cardId: direct.id, displaySnapshot: direct },
        },
        visual: {
          kind: "cards",
          cards: [
            {
              id: direct.id,
              model: { cardId: direct.id, displaySnapshot: direct },
            },
          ],
        },
      },
    ],
    unavailableMessage: null,
  };
}

function mount(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return container;
}

function click(element: Element | null): void {
  if (!(element instanceof HTMLElement)) throw new Error("missing element");
  act(() => element.click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  stubMatchMedia(true);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("DreamAugurySiteScreen", () => {
  it("stages two offer tiles with Aldric's instruction and decline action", () => {
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    expect(
      container.querySelector<HTMLElement>("[data-augury-phase]")?.dataset.auguryPhase,
    ).toBe("comparison");
    expect(container.textContent).not.toContain("Dream Augury");
    expect(container.querySelectorAll("[data-offer-tile]")).toHaveLength(2);
    expect(
      container
        .querySelector("[data-guide-gallery-guide]")
        ?.getAttribute("data-guide-id"),
    ).toBe("aldric_the_seer");
    expect(container.textContent).toContain("Choose one path for your dream.");
    expect(container.querySelector('[data-testid="cumulus-dream-augury-decline"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(0);
    expect(
      container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-detail"]'),
    ).toBeNull();
  });

  it("keeps the 240px mobile offers in a centered horizontal snap row", () => {
    stubMatchMedia(false);
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    const offers = container.querySelectorAll<HTMLElement>("[data-offer-tile]");
    expect(offers).toHaveLength(2);
    expect([...offers].every((offer) => offer.style.width === "240px")).toBe(true);
    const row = container.querySelector<HTMLElement>(
      "[data-dream-augury-offer-row]",
    );
    expect(row?.style.overflowX).toBe("auto");
    expect(row?.style.scrollSnapType).toBe("x mandatory");
    expect(row?.style.paddingInline).toBe("calc(0.5 * (100% - 240px))");
  });

  it("opens one vision before exposing its detailed candidate pick", () => {
    const onInspectOffer = vi.fn();
    const container = mount(
      <DreamAugurySiteScreen
        view={view()}
        onInspectOffer={onInspectOffer}
        onChoose={() => ({ ok: true })}
        onClose={() => undefined}
      />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );

    expect(onInspectOffer).toHaveBeenCalledWith("A");
    expect(
      container.querySelector<HTMLElement>("[data-augury-phase]")?.dataset.auguryPhase,
    ).toBe("detail");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-dream-augury-detail"]',
      )?.dataset.offerId,
    ).toBe("A");
    expect(container.querySelectorAll("[data-offer-tile]")).toHaveLength(0);
    expect(container.querySelector('[data-testid="cumulus-dream-augury-speech"]')).toBeNull();
    expect(container.querySelector('[data-testid="cumulus-dream-augury-guide-art"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-offer-B"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-testid^="cumulus-augury-choice-"]'),
    ).toHaveLength(4);
    expect(
      container.querySelector("[data-guide-gallery-desktop-layout]")
        ?.getAttribute("data-guide-gallery-desktop-layout-mode"),
    ).toBe("showcase");
    const detailStage = container.querySelector<HTMLElement>(
      '[data-augury-desktop-placement="center"]',
    );
    expect(detailStage?.style.justifySelf).toBe("center");
    expect(container.querySelector("[data-glass-panel-header]")?.querySelector("h2")?.textContent).toBe(
      "Choose a Card",
    );
    expect(container.textContent).toContain("Choose a card to add to your deck.");
    expect(
      container.querySelector<HTMLElement>("[data-glass-panel-header]")?.style.textAlign,
    ).toBe("left");
    expect(
      container.querySelector<HTMLElement>("[data-augury-detail-visual]")?.style.overflow,
    ).toBe("hidden");
    expect(
      container.querySelector("[data-augury-card-grid-columns]")
        ?.getAttribute("data-augury-card-grid-columns"),
    ).toBe("4");
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-choose-again"]'),
    ).not.toBeNull();
  });

  it("requires an inner candidate pick in detail, then confirms the selected offer", () => {
    const onChoose = vi.fn(() => ({ ok: true } as const));
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={onChoose} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );
    const confirm = container.querySelector(
      '[data-testid="cumulus-dream-augury-confirm-A"]',
    );
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");

    click(container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'));
    expect(
      container
        .querySelector('[data-testid="cumulus-augury-choice-choice-1"]')
        ?.getAttribute("data-selection-color"),
    ).toBe("accent-bright");
    click(confirm);
    expect(onChoose).toHaveBeenCalledWith("A", "choice-1");
  });

  it("marks a doubled card choice with a bright-purple selection and 2x badge", () => {
    const doubledView = view();
    const first = doubledView.offers[0];
    if (first?.visual.kind !== "cardChoices") {
      throw new Error("missing card-choice fixture");
    }
    const container = mount(
      <DreamAugurySiteScreen
        view={{
          ...doubledView,
          offers: [
            { ...first, visual: { ...first.visual, doubled: true } },
            doubledView.offers[1],
          ],
        }}
        onChoose={() => ({ ok: true })}
        onClose={() => undefined}
      />,
    );

    click(container.querySelector('[data-testid="cumulus-dream-augury-offer-A"]'));
    click(container.querySelector('[data-testid="cumulus-augury-choice-choice-2"]'));

    expect(
      container
        .querySelector('[data-testid="cumulus-augury-choice-choice-2"]')
        ?.getAttribute("data-selection-color"),
    ).toBe("accent-bright");
    expect(
      container.querySelector("[data-augury-card-quantity-badge]")?.textContent,
    ).toBe("2x");
    expect(
      container.querySelector<HTMLElement>("[data-augury-card-quantity-badge]")
        ?.style.background,
    ).toBe("var(--accent-bright)");
  });

  it("previews a direct offer before enabling its separate confirmation", () => {
    const onChoose = vi.fn(() => ({ ok: true } as const));
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={onChoose} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-B"]',
      ),
    );
    expect(onChoose).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-guide-gallery-desktop-layout]")
        ?.getAttribute("data-guide-gallery-desktop-layout-mode"),
    ).toBe("showcase");
    expect(
      container.querySelector("[data-dream-augury-layout]")
        ?.getAttribute("data-augury-desktop-placement"),
    ).toBe("center");
    expect(
      container.querySelector<HTMLElement>("[data-dream-augury-layout]")
        ?.style.justifySelf,
    ).toBe("center");
    expect(
      container.querySelector('[data-testid="cumulus-dream-augury-guide-art"]'),
    ).not.toBeNull();
    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-confirm-B"]',
      ),
    );
    expect(onChoose).toHaveBeenCalledWith("B", null);
  });

  it("renders an added site through the canonical SiteNode", () => {
    const base = view();
    const first = base.offers[0];
    if (first === undefined) throw new Error("missing fixture offer");
    const siteView: DreamAugurySiteView = {
      ...base,
      offers: [
        {
          ...first,
          headline: "Add a Card Shop",
          subtitle: "Add a site to the current dreamscape.",
          requiresSelection: false,
          visual: {
            kind: "site",
            model: {
              site: {
                id: "dream-augury-preview:Shop",
                type: "Shop",
                isEnhanced: false,
                isVisited: false,
              },
              pos: { x: 50, y: 50 },
              index: 0,
              isBattle: false,
              isLocked: false,
              isInteractive: false,
              label: "Card Shop",
              blurb: "Spend essence to add cards to your deck.",
              icon: GLYPHS.gift,
            },
          },
        },
        base.offers[1],
      ],
    };
    const container = mount(
      <DreamAugurySiteScreen view={siteView} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    click(container.querySelector('[data-testid="cumulus-dream-augury-offer-A"]'));

    expect(
      container.querySelector('[data-augury-site-preview] [data-site-type="Shop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-augury-site-preview] [data-interactive="false"]'),
    ).not.toBeNull();
    const siteNode = container.querySelector<HTMLElement>(
      '[data-augury-site-preview] [data-site-node-presentation="reward"]',
    );
    expect(siteNode?.style.width).toBe("160px");
    expect(siteNode?.style.height).toBe("160px");
  });

  it("marks a selected Dreamsign with the bright-purple selection ring and check", () => {
    const base = view();
    const first = base.offers[0];
    if (first === undefined) throw new Error("missing fixture offer");
    const dreamsignView: DreamAugurySiteView = {
      ...base,
      offers: [
        {
          ...first,
          headline: "Choose a Dreamsign",
          subtitle: "Choose a dreamsign to gain.",
          requiresSelection: true,
          visual: {
            kind: "dreamsignChoices",
            choices: [
              {
                id: "sign-1",
                dreamsign: {
                  id: "00000000-0000-4000-8000-000000000091",
                  name: "Fixture Sign One",
                  effectDescription: "Fixture effect one.",
                  imageName: "fixture-one.png",
                  isBane: false,
                },
              },
              {
                id: "sign-2",
                dreamsign: {
                  id: "00000000-0000-4000-8000-000000000092",
                  name: "Fixture Sign Two",
                  effectDescription: "Fixture effect two.",
                  imageName: "fixture-two.png",
                  isBane: false,
                },
              },
            ],
          },
        },
        base.offers[1],
      ],
    };
    const container = mount(
      <DreamAugurySiteScreen view={dreamsignView} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    click(container.querySelector('[data-testid="cumulus-dream-augury-offer-A"]'));
    click(container.querySelector('[data-testid="cumulus-augury-choice-sign-1"]'));

    const selected = container.querySelector<HTMLElement>(
      '[data-augury-dreamsign-choice][data-selected="true"]',
    );
    expect(selected?.style.border).toBe("4px solid var(--accent-bright)");
    const marker = selected?.querySelector<HTMLElement>(
      "[data-augury-dreamsign-selection-marker]",
    );
    expect(marker).not.toBeNull();
    expect(marker?.style.background).toBe("var(--accent-bright)");
  });

  it("uses a white filled right arrow between distinct transfiguration states", () => {
    const base = view();
    const first = base.offers[0];
    if (first?.visual.kind !== "cardChoices") {
      throw new Error("missing card-choice fixture");
    }
    const before = first.visual.choices[0]?.card;
    const after = first.visual.choices[1]?.card;
    if (before === undefined || after === undefined) {
      throw new Error("missing card fixtures");
    }
    const transfigureView: DreamAugurySiteView = {
      ...base,
      offers: [
        {
          ...first,
          headline: "Transfigure a Card",
          subtitle: [
            { kind: "text", text: "Transfigure " },
            { kind: "entity", text: "Fixture 1" },
          ],
          requiresSelection: false,
          visual: {
            kind: "beforeAfter",
            pairs: [{ id: "entry-1", before, after }],
          },
        },
        base.offers[1],
      ],
    };
    const container = mount(
      <DreamAugurySiteScreen view={transfigureView} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    click(container.querySelector('[data-testid="cumulus-dream-augury-offer-A"]'));

    expect(container.querySelector("[data-glass-panel-header] h2")?.textContent).toBe(
      "Transfigure a Card",
    );
    expect(
      container.querySelector("[data-glass-panel-subtitle-entity]")?.textContent,
    ).toBe("Fixture 1");
    const arrow = container.querySelector<HTMLElement>(
      "[data-augury-transition-arrow] i",
    );
    expect(arrow?.className).toContain("bxf bx-arrow-right");
    const normalizedWhite = document.createElement("span");
    normalizedWhite.style.color = resolveColor("white");
    expect(arrow?.style.color).toBe(normalizedWhite.style.color);
  });

  it("returns to both previews and clears an abandoned inner choice", () => {
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );

    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );
    click(
      container.querySelector('[data-testid="cumulus-augury-choice-choice-1"]'),
    );
    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-choose-again"]',
      ),
    );
    click(
      container.querySelector(
        '[data-testid="cumulus-dream-augury-offer-A"]',
      ),
    );

    expect(
      container
        .querySelector('[data-testid="cumulus-augury-choice-choice-1"]')
        ?.getAttribute("data-selected"),
    ).toBe("false");
    expect(
      container
        .querySelector('[data-testid="cumulus-dream-augury-confirm-A"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("declines from the initial state", () => {
    const onClose = vi.fn();
    const container = mount(
      <DreamAugurySiteScreen view={view()} onChoose={() => ({ ok: true })} onClose={onClose} />,
    );
    click(container.querySelector('[data-testid="cumulus-dream-augury-decline"]'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps rejected-action feedback inside the selected detail panel", () => {
    const container = mount(
      <DreamAugurySiteScreen
        view={view()}
        onChoose={() => ({ ok: false, message: "The visions shifted. Choose again." })}
        onClose={() => undefined}
      />,
    );
    click(container.querySelector('[data-testid="cumulus-dream-augury-offer-B"]'));
    click(container.querySelector('[data-testid="cumulus-dream-augury-confirm-B"]'));
    expect(container.querySelector('[data-testid="cumulus-dream-augury-error"]')?.textContent).toBe(
      "The visions shifted. Choose again.",
    );
    expect(container.querySelectorAll("[data-glass-panel-frame]")).toHaveLength(1);
  });

  it("shows Aldric's unavailable explanation with one exit action", () => {
    const unavailable = {
      ...view(),
      encounterSignature: null,
      offers: [],
      unavailableMessage: "The visions are clouded. Walk on for now.",
    };
    const container = mount(
      <DreamAugurySiteScreen view={unavailable} onChoose={() => ({ ok: true })} onClose={() => undefined} />,
    );
    expect(container.textContent).toContain("The visions are clouded. Walk on for now.");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("[data-glass-panel-frame]")).toBeNull();
  });
});
