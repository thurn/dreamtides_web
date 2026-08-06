// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { CumulusRoot } from "../../CumulusRoot";
import { GLYPHS } from "../../primitives/glyph";
import {
  OfferTile,
  OFFER_TILE_COMPACT_SIZE,
  OFFER_TILE_STANDARD_SIZE,
  type OfferTileCard,
  type OfferTileFourCards,
  type OfferTileModel,
} from "./OfferTile";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixtureCard(
  cardId: string,
  imageNumber: number,
  cardNumber: number,
  art?: { readonly x: number; readonly y: number; readonly scale: number },
): OfferTileCard {
  const id = asCardId(cardId);
  return {
    cardId: id,
    displaySnapshot: {
      id,
      name: asCardName(`Test Card ${String(cardNumber)}`),
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
    },
  };
}

const CARDS = [
  fixtureCard("7be2e6d7-abff-4c44-a0c3-35460da1693c", 287269511, 1, {
    x: 0.5,
    y: -0.5,
    scale: 1.7,
  }),
  fixtureCard("161482b6-af07-4d9e-822d-8c738672beb9", 2022594419, 2),
  fixtureCard("b56ef7e8-c634-4d40-ac08-fab591dfbc4a", 618071684, 3),
  fixtureCard("9b9c2743-75b3-499d-b5fb-c3429c92d420", 1196004046, 4),
] as const satisfies OfferTileFourCards;

const MODEL: OfferTileModel = {
  id: "debug-fit-card-draft",
  kind: "card-draft",
  cards: CARDS,
};

describe("OfferTile", () => {
  it("preserves standard geometry and uniformly scales the compact composition", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={MODEL} onPress={() => {}} testId="standard" />
          <OfferTile
            model={{ ...MODEL, id: "compact" }}
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
      ["one", { id: "one", kind: "card-gift", card: CARDS[0] }, "single"],
      [
        "two",
        { id: "two", kind: "card-bundle", cards: [CARDS[0], CARDS[1]] },
        "split-2",
      ],
      [
        "three",
        {
          id: "three",
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
      `[data-testid="one"] [data-offer-tile-card-art="${CARDS[0].cardId}"] img`,
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
    expect(Number.parseFloat(focusedSingleImage.style.width)).toBeCloseTo(280.5, 5);
    expect(Number.parseFloat(focusedSingleImage.style.height)).toBeCloseTo(170, 5);
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
        `[data-testid="${testId}"] [data-offer-tile-card-art="${CARDS[0].cardId}"] img`,
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

  it("centers a fifth card over the four-panel trade art", () => {
    const trade: OfferTileModel = {
      id: "trade",
      kind: "trade-card",
      outgoing: CARDS[0],
      incoming: CARDS,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={trade} onPress={() => {}} testId="trade" />
        </CumulusRoot>,
      );
    });

    const tile = container.querySelector<HTMLElement>('[data-testid="trade"]')!;
    expect(tile.querySelectorAll("[data-offer-tile-card-art]")).toHaveLength(5);
    expect(
      tile
        .querySelector("[data-offer-tile-card-art-layout]")
        ?.getAttribute("data-offer-tile-card-art-layout"),
    ).toBe("grid-4");
    const fifth = tile.querySelector<HTMLElement>(
      "[data-offer-tile-fifth-card]",
    )!;
    expect(fifth.style.left).toBe("50%");
    expect(fifth.style.top).toBe("50%");
    expect(fifth.style.translate).toBe("-50% -50%");
    const fifthArt = fifth.querySelector<HTMLElement>(
      "[data-offer-tile-card-art]",
    )!;
    expect(fifthArt.style.width).toBe("84px");
    expect(fifthArt.style.height).toBe("84px");
    expect(fifthArt.style.borderRadius).toBe("var(--radius-panel)");
    expect(fifthArt.dataset.offerTileCardArtTreatment).toBe("purged");

    act(() => root.unmount());
    container.remove();
  });

  it("places every required icon sixteen pixels above the inner border", () => {
    const models: readonly [string, OfferTileModel][] = [
      [
        "one",
        {
          id: "transfigure",
          kind: "transfigure-card",
          card: CARDS[0],
          transfiguration: "Empowered",
        },
      ],
      [
        "two",
        {
          id: "starters",
          kind: "transfigure-starters",
          cards: [CARDS[0], CARDS[1]],
        },
      ],
      [
        "three",
        {
          id: "duplicate",
          kind: "duplicate-card",
          cards: [CARDS[0], CARDS[1], CARDS[2]],
        },
      ],
      [
        "four",
        {
          id: "category",
          kind: "category-draft",
          cards: CARDS,
          categoryName: "Character",
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
          <OfferTile model={MODEL} onPress={activate} />
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
      "Choose a card to add to your deck.",
    );

    act(() => source.click());
    expect(activate).toHaveBeenCalledWith(MODEL.id);

    act(() => root.unmount());
    container.remove();
  });

  it("renders Dreamsign offers over their authored full-art backgrounds", () => {
    const gift: OfferTileModel = {
      id: "dreamsign-gift",
      kind: "dreamsign-gift",
      dreamsign: {
        id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
        name: "Amplified Acorn",
        art: { kind: "dreamsign", imageName: "acorn_gold.png" },
      },
    };
    const dreamsigns = [
      gift.dreamsign,
      { ...gift.dreamsign, id: "278EC1AB-F532-4862-84AE-63DF5E49548C" },
      { ...gift.dreamsign, id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9" },
      { ...gift.dreamsign, id: "49990864-1DB0-4C08-91AE-40A1F04223E4" },
    ] as const;
    const draftTwo: OfferTileModel = {
      id: "dreamsign-draft-two",
      kind: "dreamsign-draft",
      dreamsigns: [dreamsigns[0], dreamsigns[1]],
    };
    const draftThree: OfferTileModel = {
      id: "dreamsign-draft-three",
      kind: "dreamsign-draft",
      dreamsigns: [dreamsigns[0], dreamsigns[1], dreamsigns[2]],
    };
    const draftFour: OfferTileModel = {
      id: "dreamsign-draft-four",
      kind: "dreamsign-draft",
      dreamsigns,
    };
    const addSite: OfferTileModel = {
      id: "add-site",
      kind: "add-site",
      site: { id: "Duplication", name: "Duplication", glyph: GLYPHS.copy },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={gift} onPress={() => {}} testId="gift" />
          <OfferTile model={draftTwo} onPress={() => {}} testId="draft-two" />
          <OfferTile
            model={draftThree}
            onPress={() => {}}
            testId="draft-three"
          />
          <OfferTile model={draftFour} onPress={() => {}} testId="draft-four" />
          <OfferTile model={addSite} onPress={() => {}} testId="site" />
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
      "386654065",
    );
    expect(giftBackground.style.overflow).toBe("hidden");
    expect(
      giftBackground.querySelector<HTMLImageElement>("img")?.src,
    ).toContain("/cards/386654065.webp");
    expect(
      giftLayout.querySelector<HTMLElement>("[data-offer-tile-dreamsign-id]")
        ?.style.width,
    ).toBe("112.32px");

    const presets = [
      ["draft-two", "draft-2", "20", "35", "72.8px", 2],
      ["draft-three", "draft-3", "25", "35", "72.8px", 3],
      ["draft-four", "draft-4", "18", "30", "62.4px", 4],
    ] as const;
    for (const [testId, layoutName, spread, scale, edge, count] of presets) {
      const layout = container.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-offer-tile-dreamsign-layout]`,
      )!;
      const background = layout.querySelector<HTMLElement>(
        '[data-offer-tile-full-art-background="dreamsign-draft"]',
      )!;
      const backgroundImage =
        background.querySelector<HTMLImageElement>("img")!;
      expect(layout.dataset.offerTileDreamsignLayout).toBe(layoutName);
      expect(layout.dataset.offerTileDreamsignSpread).toBe(spread);
      expect(layout.dataset.offerTileDreamsignScale).toBe(scale);
      expect(layout.style.overflow).toBe("visible");
      expect(background.dataset.offerTileFullArtBackgroundImage).toBe(
        "420863587",
      );
      expect(background.style.overflow).toBe("hidden");
      expect(backgroundImage.src).toContain("/cards/420863587.webp");
      expect(backgroundImage.style.left).toBe("-10%");
      expect(backgroundImage.style.top).toBe("-10%");
      expect(backgroundImage.style.right).toBe("");
      expect(backgroundImage.style.bottom).toBe("");
      expect(backgroundImage.style.width).toBe("120%");
      expect(backgroundImage.style.maxWidth).toBe("none");
      expect(backgroundImage.style.height).toBe("120%");
      expect(backgroundImage.style.objectFit).toBe("cover");
      const pieces = layout.querySelectorAll<HTMLElement>(
        "[data-offer-tile-dreamsign-id]",
      );
      expect(pieces).toHaveLength(count);
      for (const piece of pieces) {
        expect(piece.style.width).toBe(edge);
        expect(piece.style.height).toBe(edge);
      }
    }

    const triangle = container.querySelectorAll<HTMLElement>(
      '[data-testid="draft-three"] [data-offer-tile-dreamsign-id]',
    );
    expect(Number.parseFloat(triangle[0].style.top)).toBeLessThan(
      Number.parseFloat(triangle[1].style.top),
    );
    expect(Number.parseFloat(triangle[1].style.left)).toBeLessThan(
      Number.parseFloat(triangle[0].style.left),
    );
    expect(Number.parseFloat(triangle[0].style.left)).toBeLessThan(
      Number.parseFloat(triangle[2].style.left),
    );

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
      "334049261",
    );
    expect(siteBackground.style.overflow).toBe("hidden");
    const siteBackgroundImage =
      siteBackground.querySelector<HTMLImageElement>("img")!;
    expect(siteBackgroundImage.src).toContain("/cards/334049261.webp");
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

  it("uses the requested marks for keyword and character-type changes", () => {
    const keyword: OfferTileModel = {
      id: "keyword",
      kind: "keyword-modification",
      card: CARDS[0],
      reclaimReduction: 1,
    };
    const characterType: OfferTileModel = {
      id: "character-type",
      kind: "tribal-change",
      card: CARDS[1],
      newCharacterSubtype: "Warrior",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={keyword} onPress={() => {}} testId="keyword" />
          <OfferTile
            model={characterType}
            onPress={() => {}}
            testId="character-type"
          />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="keyword"] [data-offer-tile-operation] i',
      )?.className,
    ).toBe(GLYPHS.pencilSquare);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="character-type"] [data-offer-tile-operation] i',
      )?.className,
    ).toBe(GLYPHS.refreshCcw);

    act(() => root.unmount());
    container.remove();
  });
});
