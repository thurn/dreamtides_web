import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { parseCardName, type CardId } from "../../../types/card-identity";
import { CumulusRoot } from "../../CumulusRoot";
import { GLYPHS } from "../../primitives/glyph";
import {
  OfferTile,
  OFFER_TILE_COMPACT_SIZE,
  OFFER_TILE_STANDARD_SIZE,
  type OfferTileFourCards,
  type OfferTileModel,
} from "./OfferTile";
import { auguryOfferHeadline } from "./offer-tile-descriptions";
import { resolveSource } from "../../../runtime/localization/runtime";
import type { CardData } from "../../../types/cards";
import {
  testCardId,
  testDreamsignId,
  testOfferTileId,
} from "../../../types/test-identities";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixtureCard(
  cardId: CardId,
  imageNumber: number,
  cardNumber: number,
  art?: { readonly x: number; readonly y: number; readonly scale: number },
): Readonly<CardData> {
  const id = cardId;
  return {
    id,
    name: parseCardName(`Test Card ${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "Spirit Animal",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "▸ Dawn: Draw a card.",
    imageNumber,
    artOwned: true,
    ...(art === undefined ? {} : { art }),
  };
}

const CARDS = [
  fixtureCard(
    testCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"),
    287269511,
    1,
    {
      x: 0.5,
      y: -0.5,
      scale: 1.7,
    },
  ),
  fixtureCard(
    testCardId("161482b6-af07-4d9e-822d-8c738672beb9"),
    2022594419,
    2,
  ),
  fixtureCard(testCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"), 618071684, 3),
  fixtureCard(
    testCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
    1196004046,
    4,
  ),
] as const satisfies OfferTileFourCards;

const MODEL: OfferTileModel = {
  id: testOfferTileId("debug-fit-card-draft"),
  kind: "card-draft",
  cards: CARDS,
};

const PRESENTATION = {
  headline: { kind: "text", text: "Choose a Card" },
  subtitle: { kind: "text", text: "Choose a card to add to your deck." },
} as const;

describe("OfferTile", () => {
  it("preserves standard geometry and uniformly scales the compact composition", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile
            presentation={PRESENTATION}
            model={MODEL}
            onPress={() => {}}
            testId="standard"
          />
          <OfferTile
            presentation={PRESENTATION}
            model={{ ...MODEL, id: testOfferTileId("compact") }}
            size="compact"
            onPress={() => {}}
            testId="compact"
          />
        </CumulusRoot>,
      );
    });

    const standard = container.querySelector<HTMLElement>(
      '[data-testid="standard"]',
    )!;
    const compact = container.querySelector<HTMLElement>(
      '[data-testid="compact"]',
    )!;
    const compactFrame = compact.querySelector<HTMLElement>(
      "[data-offer-tile-floating-frame]",
    )!;
    expect(OFFER_TILE_STANDARD_SIZE).toBe(300);
    expect(OFFER_TILE_COMPACT_SIZE).toBe(240);
    expect(standard.style.width).toBe("300px");
    expect(compact.style.width).toBe("240px");
    expect(compact.style.height).toBe("240px");
    expect(compactFrame.style.width).toBe("300px");
    expect(compactFrame.style.height).toBe("300px");
    expect(compactFrame.style.scale).toBe("0.8");

    act(() => root.unmount());
    container.remove();
  });

  it("fills the circle with one, two, three, and four original-art panels", () => {
    const models: readonly [string, OfferTileModel, string][] = [
      [
        "one",
        { id: testOfferTileId("one"), kind: "card-gift", card: CARDS[0] },
        "single",
      ],
      [
        "two",
        {
          id: testOfferTileId("two"),
          kind: "card-bundle",
          cards: [CARDS[0], CARDS[1]],
        },
        "split-2",
      ],
      [
        "three",
        {
          id: testOfferTileId("three"),
          kind: "card-bundle",
          cards: [CARDS[0], CARDS[1], CARDS[2]],
        },
        "split-3",
      ],
      ["four", MODEL, "grid-4"],
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          {models.map(([testId, model]) => (
            <OfferTile
              presentation={PRESENTATION}
              key={testId}
              model={model}
              onPress={() => {}}
              testId={testId}
            />
          ))}
        </CumulusRoot>,
      );
    });

    for (const [testId, , layout] of models) {
      const tile = container.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      )!;
      const mosaic = tile.querySelector<HTMLElement>(
        "[data-offer-tile-card-art-layout]",
      )!;
      expect(mosaic.dataset.offerTileCardArtLayout).toBe(layout);
      expect(mosaic.style.width).toBe("208px");
      expect(mosaic.style.height).toBe("208px");
    }

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="one"] [data-offer-tile-card-art-layout]',
      )?.style.gridTemplateColumns,
    ).toBe("repeat(1, minmax(0, 1fr))");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="two"] [data-offer-tile-card-art-layout]',
      )?.style.gridTemplateColumns,
    ).toBe("repeat(2, minmax(0, 1fr))");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="three"] [data-offer-tile-card-art-layout]',
      )?.style.gridTemplateColumns,
    ).toBe("repeat(3, minmax(0, 1fr))");
    const four = container.querySelector<HTMLElement>(
      '[data-testid="four"] [data-offer-tile-card-art-layout]',
    )!;
    expect(four.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(four.style.gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
    expect(four.style.gap).toBe("var(--space-xxs)");

    const focusedSingleImage = container.querySelector<HTMLImageElement>(
      `[data-testid="one"] [data-offer-tile-card-art="${CARDS[0].id}"] img`,
    )!;
    Object.defineProperties(focusedSingleImage, {
      naturalWidth: { configurable: true, value: 462 },
      naturalHeight: { configurable: true, value: 280 },
    });
    act(() => {
      focusedSingleImage.dispatchEvent(new Event("load", { bubbles: true }));
    });
    expect(focusedSingleImage.src).toContain("/cards/287269511.webp");
    expect(focusedSingleImage.style.objectFit).toBe("cover");
    expect(focusedSingleImage.style.objectPosition).toBe("");
    expect(focusedSingleImage.style.left).toBe("50%");
    expect(focusedSingleImage.style.top).toBe("50%");
    expect(Number.parseFloat(focusedSingleImage.style.width)).toBeCloseTo(
      280.5,
      5,
    );
    expect(Number.parseFloat(focusedSingleImage.style.height)).toBeCloseTo(
      170,
      5,
    );
    const authoredTranslation = /translate\(([-\d.]+)%, ([-\d.]+)%\)$/.exec(
      focusedSingleImage.style.transform,
    );
    expect(authoredTranslation).not.toBeNull();
    expect(Number(authoredTranslation?.[1])).toBeGreaterThan(0);
    expect(Number(authoredTranslation?.[2])).toBeLessThan(0);

    const authoredPanelWidths = {
      two: 561,
      three: 841.5,
      four: 280.5,
    } as const;
    for (const testId of ["two", "three", "four"] as const) {
      const images = container.querySelectorAll<HTMLImageElement>(
        `[data-testid="${testId}"] [data-offer-tile-card-art] img`,
      );
      expect(images.length).toBeGreaterThan(1);
      act(() => {
        for (const image of images) {
          Object.defineProperties(image, {
            naturalWidth: { configurable: true, value: 462 },
            naturalHeight: { configurable: true, value: 280 },
          });
          image.dispatchEvent(new Event("load", { bubbles: true }));
        }
      });
      for (const image of images) {
        expect(image.style.objectPosition).toBe("");
        expect(image.style.left).toBe("50%");
        expect(image.style.top).toBe("50%");
        expect(Number.parseFloat(image.style.width)).toBeGreaterThan(100);
      }
      const authoredPanelImage = container.querySelector<HTMLImageElement>(
        `[data-testid="${testId}"] [data-offer-tile-card-art="${CARDS[0].id}"] img`,
      )!;
      const panelTranslation = /translate\(([-\d.]+)%, ([-\d.]+)%\)$/.exec(
        authoredPanelImage.style.transform,
      );
      expect(panelTranslation).not.toBeNull();
      expect(Number(panelTranslation?.[1])).toBeGreaterThan(0);
      expect(Number(panelTranslation?.[2])).toBeLessThan(0);
      expect(Number.parseFloat(authoredPanelImage.style.width)).toBeCloseTo(
        authoredPanelWidths[testId],
        5,
      );
    }
    expect(container.querySelector("[data-card-presentation]")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("places every required icon sixteen pixels above the inner border", () => {
    const models: readonly [string, OfferTileModel][] = [
      [
        "one",
        {
          id: testOfferTileId("transfigure"),
          kind: "transfigure-card",
          card: CARDS[0],
        },
      ],
      [
        "two",
        {
          id: testOfferTileId("starters"),
          kind: "transfigure-starters",
          cards: [CARDS[0], CARDS[1]],
        },
      ],
      [
        "three",
        {
          id: testOfferTileId("duplicate"),
          kind: "duplicate-card",
          cards: [CARDS[0], CARDS[1], CARDS[2]],
        },
      ],
      [
        "four",
        {
          id: testOfferTileId("category"),
          kind: "category-draft",
          cards: CARDS,
          category: { kind: "character" },
        },
      ],
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          {models.map(([testId, model]) => (
            <OfferTile
              presentation={PRESENTATION}
              key={testId}
              model={model}
              onPress={() => {}}
              testId={testId}
            />
          ))}
        </CumulusRoot>,
      );
    });

    for (const [testId] of models) {
      const mark = container.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-offer-tile-operation]`,
      )!;
      expect(mark.dataset.offerTileOperationLayout).toBe("overlay");
      expect(mark.style.left).toBe("50%");
      expect(mark.style.bottom).toBe("16px");
      expect(mark.style.top).toBe("");
      expect(mark.style.translate).toBe("-50% 0");
      expect(mark.style.width).toBe("58px");
      expect(mark.style.height).toBe("58px");
      expect(mark.querySelector<HTMLElement>("i")?.style.fontSize).toBe("32px");
    }

    act(() => root.unmount());
    container.remove();
  });

  it("keeps the tile as the single interaction and reveal source", () => {
    const activate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile
            presentation={PRESENTATION}
            model={MODEL}
            onPress={activate}
          />
        </CumulusRoot>,
      );
    });

    const source =
      container.querySelector<HTMLButtonElement>("[data-offer-tile]")!;
    expect(source.tagName).toBe("BUTTON");
    expect(source.querySelectorAll("[data-offer-tile-card-art]")).toHaveLength(
      4,
    );
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(
      0,
    );
    expect(source.dataset.revealEntityType).toBe("offer");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("text");
    expect(source.dataset.revealPlacementException).toBe(
      "augury-offer-above-source",
    );
    expect(source.getAttribute("aria-label")).toBe(
      resolveSource(auguryOfferHeadline(MODEL, PRESENTATION)),
    );

    act(() => source.click());
    expect(activate).toHaveBeenCalledWith(MODEL.id);

    act(() => root.unmount());
    container.remove();
  });

  it("renders Dreamsign offers over their authored full-art backgrounds", () => {
    const dreamsignPresentation = {
      ...PRESENTATION,
      backgroundArt: { source: "card", imageNumber: 123456 },
    } as const;
    const sitePresentation = {
      ...PRESENTATION,
      backgroundArt: { source: "card", imageNumber: 654321 },
    } as const;
    const gift: OfferTileModel = {
      id: testOfferTileId("dreamsign-gift"),
      kind: "dreamsign-gift",
      dreamsign: {
        id: testDreamsignId("c706d0ba-2f41-4b14-95d8-db168ac6246c"),
        name: assertLocalized("Amplified Acorn"),
        art: { kind: "dreamsign", imageName: "acorn_gold.png" },
      },
    };
    const addSite: OfferTileModel = {
      id: testOfferTileId("add-site"),
      kind: "add-site",
      site: {
        id: "Duplication",
        name: assertLocalized("Duplication"),
        glyph: GLYPHS.copy,
      },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile
            presentation={dreamsignPresentation}
            model={gift}
            onPress={() => {}}
            testId="gift"
          />
          <OfferTile
            presentation={sitePresentation}
            model={addSite}
            onPress={() => {}}
            testId="site"
          />
        </CumulusRoot>,
      );
    });

    const giftLayout = container.querySelector<HTMLElement>(
      '[data-testid="gift"] [data-offer-tile-dreamsign-layout]',
    )!;
    const giftBackground = giftLayout.querySelector<HTMLElement>(
      '[data-offer-tile-full-art-background="dreamsign-gift"]',
    )!;
    expect(giftLayout.dataset.offerTileDreamsignLayout).toBe("single");
    expect(giftBackground.dataset.offerTileFullArtBackgroundImage).toBe(
      "123456",
    );
    expect(giftBackground.style.overflow).toBe("hidden");
    expect(
      giftBackground.querySelector<HTMLImageElement>("img")?.src,
    ).toContain("/cards/123456.webp");
    expect(
      giftLayout.querySelector<HTMLElement>("[data-offer-tile-dreamsign-id]")
        ?.style.width,
    ).toBe("112.32px");

    const site = container.querySelector<HTMLElement>(
      '[data-testid="site"] [data-offer-tile-site-id]',
    )!;
    const siteLayout = container.querySelector<HTMLElement>(
      '[data-testid="site"] [data-offer-tile-site-layout]',
    )!;
    const siteBackground = siteLayout.querySelector<HTMLElement>(
      '[data-offer-tile-full-art-background="add-site"]',
    )!;
    expect(siteLayout.style.width).toBe("208px");
    expect(siteLayout.style.height).toBe("208px");
    expect(siteBackground.dataset.offerTileFullArtBackgroundImage).toBe(
      "654321",
    );
    expect(siteBackground.style.overflow).toBe("hidden");
    const siteBackgroundImage =
      siteBackground.querySelector<HTMLImageElement>("img")!;
    expect(siteBackgroundImage.src).toContain("/cards/654321.webp");
    expect(siteBackgroundImage.style.width).toBe("120%");
    expect(siteBackgroundImage.style.maxWidth).toBe("none");
    expect(siteBackgroundImage.style.height).toBe("120%");
    expect(siteBackgroundImage.style.objectFit).toBe("cover");
    expect(site.style.width).toBe("116px");
    expect(site.style.height).toBe("116px");
    expect(
      site.querySelector<HTMLElement>("[data-offer-tile-site-glyph]")?.style
        .fontSize,
    ).toBe("60px");

    act(() => root.unmount());
    container.remove();
  });
});
