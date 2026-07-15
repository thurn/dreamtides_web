// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { GLYPHS } from "../../primitives/glyph";
import {
  OfferTile,
  OFFER_TILE_COMPACT_SIZE,
  OFFER_TILE_STANDARD_SIZE,
  type OfferTileCard,
  type OfferTileFourCards,
  type OfferTileModel,
} from "./OfferTile";

function fixtureCard(
  cardId: string,
  imageNumber: number,
  cardNumber: number,
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
    },
  };
}

const MODEL: OfferTileModel = {
  id: "debug-fit-card-draft",
  kind: "card-draft",
  cards: [
    fixtureCard("7be2e6d7-abff-4c44-a0c3-35460da1693c", 287269511, 1),
    fixtureCard("161482b6-af07-4d9e-822d-8c738672beb9", 2022594419, 2),
    fixtureCard("b56ef7e8-c634-4d40-ac08-fab591dfbc4a", 618071684, 3),
    fixtureCard("9b9c2743-75b3-499d-b5fb-c3429c92d420", 1196004046, 4),
  ],
};

const FULL_CARD: CardData = {
  ...MODEL.cards[0].displaySnapshot,
  name: asCardName("Test Card"),
};

function withFullCard(
  card: OfferTileCard,
  cardNumber: number,
) {
  return {
    ...card,
    displaySnapshot: {
      ...FULL_CARD,
      id: card.cardId,
      cardNumber,
      imageNumber: card.displaySnapshot.imageNumber,
    },
  };
}

const FULL_CARDS = MODEL.cards.map((card, index) =>
  withFullCard(card, index + 1),
) as unknown as OfferTileFourCards;

describe("OfferTile", () => {
  it("preserves standard geometry and uniformly scales the compact composition", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={MODEL} onPress={() => {}} testId="standard" />
          <OfferTile model={{ ...MODEL, id: "compact" }} size="compact" onPress={() => {}} testId="compact" />
        </CumulusRoot>,
      );
    });
    const standard = container.querySelector<HTMLElement>('[data-testid="standard"]')!;
    const compact = container.querySelector<HTMLElement>('[data-testid="compact"]')!;
    const compactFrame = compact.querySelector<HTMLElement>("[data-offer-tile-floating-frame]")!;
    expect(OFFER_TILE_STANDARD_SIZE).toBe(300);
    expect(OFFER_TILE_COMPACT_SIZE).toBe(240);
    expect(standard.dataset.offerTileSize).toBe("standard");
    expect(standard.style.width).toBe("300px");
    expect(compact.dataset.offerTileSize).toBe("compact");
    expect(compact.style.width).toBe("240px");
    expect(compact.style.height).toBe("240px");
    expect(compactFrame.style.width).toBe("300px");
    expect(compactFrame.style.height).toBe("300px");
    expect(compactFrame.style.scale).toBe("0.8");
    act(() => root.unmount());
    container.remove();
  });

  it("renders every surfaced card as a complete card face", () => {
    const draft: OfferTileModel = {
      id: "debug-full-draft",
      kind: "card-draft",
      cards: FULL_CARDS,
    };
    const trade: OfferTileModel = {
      id: "debug-full-trade",
      kind: "trade-card",
      outgoing: FULL_CARDS[0],
      incoming: FULL_CARDS,
    };
    const duplicate: OfferTileModel = {
      id: "debug-full-duplicate",
      kind: "duplicate-card",
      cards: [FULL_CARDS[0], FULL_CARDS[1], FULL_CARDS[2]],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={draft} onPress={() => {}} testId="full-draft" />
          <OfferTile model={trade} onPress={() => {}} testId="full-trade" />
          <OfferTile
            model={duplicate}
            onPress={() => {}}
            testId="full-duplicate"
          />
        </CumulusRoot>,
      );
    });

    const expectedCounts = [
      ["full-draft", 4],
      ["full-trade", 5],
      ["full-duplicate", 3],
    ] as const;
    for (const [testId, expectedCount] of expectedCounts) {
      const tile = container.querySelector(`[data-testid="${testId}"]`);
      expect(tile?.querySelectorAll("[data-offer-tile-full-card]")).toHaveLength(
        expectedCount,
      );
      expect(tile?.querySelectorAll("[data-offer-tile-card-id]")).toHaveLength(0);
      expect(
        tile?.querySelectorAll('[data-card-presentation="full"]'),
      ).toHaveLength(expectedCount);
    }
    const draftGrid = container.querySelector<HTMLElement>(
      '[data-testid="full-draft"] [data-offer-tile-card-grid]',
    );
    expect(draftGrid?.style.display).toBe("grid");
    expect(draftGrid?.style.gridTemplateColumns).toBe("repeat(2, 64px)");
    expect(draftGrid?.style.gap).toBe("var(--space-1)");

    act(() => root.unmount());
    container.remove();
  });

  it("renders a fixed symbolic button with one tile-level reveal source", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
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

    const source = container.querySelector<HTMLButtonElement>("[data-offer-tile]")!;
    expect(source.tagName).toBe("BUTTON");
    expect(source.style.width).toBe("300px");
    expect(source.style.height).toBe("300px");
    expect(source.style.borderRadius).toBe("var(--radius-pill)");
    expect(source.style.background).toBe("transparent");
    expect(source.style.border).toBe("0px");
    expect(source.style.textAlign).toBe("left");
    const background = source.querySelector<HTMLImageElement>(
      "[data-offer-tile-background]",
    );
    expect(background?.src).toContain("offer_tile_black_fill.png");
    expect(background?.tagName).toBe("IMG");
    const floatingFrame = source.querySelector<HTMLElement>(
      "[data-offer-tile-floating-frame]",
    );
    expect(floatingFrame).not.toBeNull();
    expect(floatingFrame?.querySelector("[data-offer-tile-background]")).not.toBeNull();
    const frame = source.querySelector<HTMLImageElement>("[data-offer-tile-frame]");
    expect(frame?.src).toContain("dreamsign_card_frame_2.png");
    expect(frame?.draggable).toBe(false);
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.style.pointerEvents).toBe("none");
    const visual = source.querySelector<HTMLElement>("[data-offer-tile-visual]");
    expect(visual?.style.maskImage).toContain("offer_tile_black_fill.png");
    expect(source.dataset.revealEntityType).toBe("offer");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("text");
    expect(source.querySelectorAll("[data-offer-tile-full-card]")).toHaveLength(4);
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(0);
    expect(
      [...source.querySelectorAll<HTMLElement>("[data-offer-tile-visual] *")].every(
        (node) => node.style.pointerEvents === "none" || node.closest("[data-offer-tile-visual]")?.getAttribute("style")?.includes("pointer-events: none"),
      ),
    ).toBe(true);

    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toBe(
      "Choose a card to add to your deck.",
    );
    expect(source.getAttribute("aria-label")).toBe(description?.textContent);
    expect(description?.textContent).not.toContain("Dream Augury");
    expect(description?.textContent).not.toContain("Card Draft");

    act(() => source.click());
    expect(activate).toHaveBeenCalledWith(MODEL.id);

    act(() => root.unmount());
    container.remove();
  });

  it("keeps each inner dreamsign decorative under the tile's single hover target", () => {
    const model: OfferTileModel = {
      id: "debug-dreamsign-draft",
      kind: "dreamsign-draft",
      dreamsigns: [
        {
          id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
          name: "Amplified Acorn",
          art: { kind: "dreamsign", imageName: "acorn_gold.png" },
        },
        {
          id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
          name: "Pyramid Relic",
          art: { kind: "dreamsign", imageName: "aertfact.png" },
        },
        {
          id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
          name: "Amanita",
          art: { kind: "dreamsign", imageName: "amanita.png" },
        },
        {
          id: "49990864-1DB0-4C08-91AE-40A1F04223E4",
          name: "Algae",
          art: { kind: "dreamsign", imageName: "algae.png" },
        },
      ],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={model} onPress={() => {}} />
        </CumulusRoot>,
      );
    });

    const source = container.querySelector<HTMLElement>("[data-offer-tile]")!;
    expect(source.querySelectorAll("[data-offer-tile-dreamsign-id]")).toHaveLength(4);
    expect(source.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(0);

    act(() => root.unmount());
    container.remove();
  });

  it("renders complete card faces at the composition's strict sizes", () => {
    const gift: OfferTileModel = {
      id: "debug-gift",
      kind: "card-gift",
      card: withFullCard(MODEL.cards[0], 1),
    };
    const trade: OfferTileModel = {
      id: "debug-trade-squares",
      kind: "trade-card",
      outgoing: MODEL.cards[0],
      incoming: MODEL.cards,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={gift} onPress={() => {}} testId="gift-tile" />
          <OfferTile model={MODEL} onPress={() => {}} testId="draft-tile" />
          <OfferTile model={trade} onPress={() => {}} testId="trade-square-tile" />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="gift-tile"] [data-offer-tile-full-card]',
      )?.style.width,
    ).toBe("112px");
    const draftCards = container.querySelectorAll<HTMLElement>(
      '[data-testid="draft-tile"] [data-offer-tile-full-card]',
    );
    expect(draftCards).toHaveLength(4);
    expect([...draftCards].every((card) => card.style.width === "64px")).toBe(
      true,
    );
    expect(
      container.querySelector('[data-testid="gift-tile"] [data-offer-tile-operation]'),
    ).toBeNull();

    const tradeCards = container.querySelectorAll<HTMLElement>(
      '[data-testid="trade-square-tile"] [data-offer-tile-full-card]',
    );
    expect([...tradeCards].every((card) => card.style.width === "64px")).toBe(
      true,
    );
    expect(
      container.querySelectorAll(
        '[data-testid="draft-tile"] [data-offer-tile-card-id], [data-testid="trade-square-tile"] [data-offer-tile-card-id]',
      ),
    ).toHaveLength(0);

    act(() => root.unmount());
    container.remove();
  });

  it("renders every surfaced chooser object without representative truncation", () => {
    const cards = MODEL.cards;
    const trade: OfferTileModel = {
      id: "debug-trade",
      kind: "trade-card",
      outgoing: cards[0],
      incoming: cards,
    };
    const duplicate: OfferTileModel = {
      id: "debug-duplicate",
      kind: "duplicate-card",
      cards: [cards[0], cards[1], cards[2]],
    };
    const copies: OfferTileModel = {
      id: "debug-copies",
      kind: "copies-draft",
      copyCount: 2,
      cards,
    };
    const bundle: OfferTileModel = {
      id: "debug-bundle",
      kind: "card-bundle",
      cards: [
        withFullCard(cards[0], 1),
        withFullCard(cards[1], 2),
        withFullCard(cards[2], 3),
      ],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={trade} onPress={() => {}} testId="trade-tile" />
          <OfferTile model={duplicate} onPress={() => {}} testId="duplicate-tile" />
          <OfferTile model={copies} onPress={() => {}} testId="copies-tile" />
          <OfferTile model={bundle} onPress={() => {}} testId="bundle-tile" />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelectorAll(
        '[data-testid="trade-tile"] [data-offer-tile-full-card]',
      ),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll(
        '[data-testid="duplicate-tile"] [data-offer-tile-full-card]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-testid="copies-tile"] [data-offer-tile-operation-layout]',
      )?.getAttribute("data-offer-tile-operation-layout"),
    ).toBe("overlay");
    const copiesTile = container.querySelector<HTMLElement>(
      '[data-testid="copies-tile"]',
    );
    expect(
      document.getElementById(copiesTile?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Choose a card and add two copies of it to your deck.");
    expect(
      container.querySelector(
        '[data-testid="duplicate-tile"] [data-offer-tile-operation-layout]',
      )?.getAttribute("data-offer-tile-operation-layout"),
    ).toBe("card-overlay");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="duplicate-tile"] [data-offer-tile-operation-layout]',
      )?.style.width,
    ).toBe("60px");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="duplicate-tile"] [data-offer-tile-composition]',
      )?.style.width,
    ).toBe("190px");
    expect(
      container.querySelector(
        '[data-testid="trade-tile"] [data-offer-tile-operation]',
      ),
    ).toBeNull();
    const tradeCards = container.querySelectorAll<HTMLElement>(
      '[data-testid="trade-tile"] [data-offer-tile-full-card]',
    );
    expect([...tradeCards].every((card) => card.style.width === "64px")).toBe(
      true,
    );
    const tradeGrid = container.querySelector<HTMLElement>(
      '[data-testid="trade-tile"] [data-offer-tile-card-grid]',
    );
    expect(tradeGrid?.style.gridTemplateColumns).toBe("repeat(2, 64px)");
    expect(tradeGrid?.style.gap).toBe("var(--space-1)");
    expect(
      [...tradeCards].slice(0, 4).every(
        (card) =>
          card.style.boxShadow === "var(--shadow-card)" &&
          !card.style.boxShadow.includes("var(--spark)"),
      ),
    ).toBe(true);
    expect(
      container.querySelectorAll(
        '[data-testid="bundle-tile"] [data-offer-tile-full-card]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-testid="bundle-tile"] [data-offer-tile-operation]',
      ),
    ).toBeNull();
    expect(
      [
        ...container.querySelectorAll<HTMLElement>(
          '[data-testid="bundle-tile"] [data-offer-tile-full-card]',
        ),
      ].every((card) => card.style.width === "96px"),
    ).toBe(true);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="bundle-tile"] [data-offer-tile-full-card-stack]',
      )?.style.width,
    ).toBe("190px");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="bundle-tile"] [data-offer-tile-full-card-stack]',
      )?.style.translate,
    ).toBe("");

    for (const treatmentCard of container.querySelectorAll<HTMLElement>(
      '[data-testid="trade-tile"] [data-offer-tile-full-card], [data-testid="duplicate-tile"] [data-offer-tile-full-card]',
    )) {
      expect(treatmentCard.style.borderRadius).toBe("3.6% / 2.57%");
    }

    act(() => root.unmount());
    container.remove();
  });

  it("centers full operation cards under compact marks and keeps purge art visible", () => {
    const transfigure: OfferTileModel = {
      id: "debug-transfigure",
      kind: "transfigure-card",
      card: { ...MODEL.cards[0], displaySnapshot: FULL_CARD },
      transfiguration: "Empowered",
    };
    const purge: OfferTileModel = {
      id: "debug-purge",
      kind: "purge-card",
      card: {
        ...MODEL.cards[1],
        displaySnapshot: { ...FULL_CARD, id: MODEL.cards[1].cardId },
      },
    };
    const addSite: OfferTileModel = {
      id: "debug-add-site",
      kind: "add-site",
      site: { id: "Duplication", name: "Duplication", glyph: GLYPHS.copy },
    };
    const refineStarters: OfferTileModel = {
      id: "debug-refine-starters",
      kind: "transfigure-starters",
      cards: [
        withFullCard(MODEL.cards[0], 1),
        withFullCard(MODEL.cards[1], 2),
      ],
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <OfferTile model={transfigure} onPress={() => {}} testId="transfigure" />
          <OfferTile model={purge} onPress={() => {}} testId="purge" />
          <OfferTile
            model={refineStarters}
            onPress={() => {}}
            testId="refine-starters"
          />
          <OfferTile model={addSite} onPress={() => {}} testId="add-site" />
        </CumulusRoot>,
      );
    });

    for (const testId of ["transfigure", "purge"]) {
      const mark = container.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-offer-tile-operation-layout]`,
      );
      expect(mark?.dataset.offerTileOperationLayout).toBe("card-overlay");
      expect(mark?.style.width).toBe("60px");
      expect(mark?.style.height).toBe("60px");
      expect(mark?.style.zIndex).toBe("2");
      const fullCard = container.querySelector<HTMLElement>(
        `[data-testid="${testId}"] [data-offer-tile-full-card]`,
      );
      expect(fullCard?.style.width).toBe("112px");
      expect(fullCard?.style.zIndex).toBe("1");
      expect(fullCard?.querySelector('[data-card-presentation="full"]')).not.toBeNull();
    }
    expect(
      container.querySelectorAll(
        '[data-testid="refine-starters"] [data-offer-tile-full-card]',
      ),
    ).toHaveLength(2);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="refine-starters"] [data-offer-tile-operation-layout]',
      )?.dataset.offerTileOperationLayout,
    ).toBe("card-overlay");
    const purgedCard = container.querySelector<HTMLElement>(
      '[data-testid="purge"] [data-offer-tile-full-card]',
    );
    expect(purgedCard?.style.filter).toBe("");
    expect(purgedCard?.style.boxShadow).toContain("var(--danger)");
    expect(
      container.querySelectorAll(
        '[data-testid="transfigure"] [data-offer-tile-visual] [data-reveal-entity-type], [data-testid="purge"] [data-offer-tile-visual] [data-reveal-entity-type]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="add-site"] [data-offer-tile-site-glyph]',
      )?.style.fontSize,
    ).toBe("70px");

    act(() => root.unmount());
    container.remove();
  });

  it("uses the requested marks for keyword and character-type changes", () => {
    const keyword: OfferTileModel = {
      id: "debug-keyword",
      kind: "keyword-modification",
      card: FULL_CARDS[0],
      reclaimReduction: 1,
    };
    const characterType: OfferTileModel = {
      id: "debug-character-type",
      kind: "tribal-change",
      card: FULL_CARDS[1],
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
