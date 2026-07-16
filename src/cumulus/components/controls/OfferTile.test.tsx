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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
  fixtureCard(
    "7be2e6d7-abff-4c44-a0c3-35460da1693c",
    287269511,
    1,
    { x: 0.5, y: -0.5, scale: 1.7 },
  ),
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
    expect(four.style.gridTemplateColumns).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
    expect(four.style.gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
    expect(four.style.gap).toBe("var(--space-1)");

    const focusedImage = container.querySelector<HTMLImageElement>(
      `[data-offer-tile-card-art="${CARDS[0].cardId}"] img`,
    )!;
    expect(focusedImage.src).toContain("/cards/287269511.webp");
    expect(focusedImage.style.objectFit).toBe("cover");
    expect(focusedImage.style.objectPosition).toBe("75% 25%");
    expect(Number.parseFloat(focusedImage.style.height)).toBeCloseTo(
      (280 / 259) * 100,
      5,
    );
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
      tile.querySelector("[data-offer-tile-card-art-layout]")?.getAttribute(
        "data-offer-tile-card-art-layout",
      ),
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

  it("centers every required icon in the compact operation disc", () => {
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
        { id: "starters", kind: "transfigure-starters", cards: [CARDS[0], CARDS[1]] },
      ],
      [
        "three",
        { id: "duplicate", kind: "duplicate-card", cards: [CARDS[0], CARDS[1], CARDS[2]] },
      ],
      [
        "four",
        { id: "category", kind: "category-draft", cards: CARDS, categoryName: "Character" },
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
      expect(mark.style.top).toBe(testId === "one" ? "65%" : "50%");
      expect(mark.dataset.offerTileOperationPosition).toBe(
        testId === "one" ? "lower" : "center",
      );
      expect(mark.style.translate).toBe("-50% -50%");
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

    const source = container.querySelector<HTMLButtonElement>(
      "[data-offer-tile]",
    )!;
    expect(source.tagName).toBe("BUTTON");
    expect(source.querySelectorAll("[data-offer-tile-card-art]")).toHaveLength(4);
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(0);
    expect(source.dataset.revealEntityType).toBe("offer");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("text");
    expect(source.getAttribute("aria-label")).toBe(
      "Choose a card to add to your deck.",
    );

    act(() => source.click());
    expect(activate).toHaveBeenCalledWith(MODEL.id);

    act(() => root.unmount());
    container.remove();
  });

  it("renders dreamsigns and added sites at the reduced scale", () => {
    const gift: OfferTileModel = {
      id: "dreamsign-gift",
      kind: "dreamsign-gift",
      dreamsign: {
        id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
        name: "Amplified Acorn",
        art: { kind: "dreamsign", imageName: "acorn_gold.png" },
      },
    };
    const draft: OfferTileModel = {
      id: "dreamsign-draft",
      kind: "dreamsign-draft",
      dreamsigns: [
        gift.dreamsign,
        { ...gift.dreamsign, id: "278EC1AB-F532-4862-84AE-63DF5E49548C" },
      ],
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
          <OfferTile model={draft} onPress={() => {}} testId="draft" />
          <OfferTile model={addSite} onPress={() => {}} testId="site" />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="gift"] [data-offer-tile-dreamsign-id]',
      )?.style.width,
    ).toBe("134px");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="draft"] [data-offer-tile-dreamsign-id]',
      )?.style.width,
    ).toBe("68px");
    const site = container.querySelector<HTMLElement>(
      '[data-testid="site"] [data-offer-tile-site-id]',
    )!;
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
