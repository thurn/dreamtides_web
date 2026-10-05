// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCardName, type CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import {
  parseDeckEntryId,
  parseGlossaryEntryId,
  type ExplorationActionId,
} from "../../../types/identifiers";
import {
  testCardId,
  testDreamsignId,
  testExplorationActionId,
  testOfferTileId,
} from "../../../types/test-identities";
import { GLYPHS } from "../../primitives/glyph";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { annotatedFixture } from "../../testing/annotated-text";
import { renderInCumulus } from "../../testing/render";
import type { DomTestId } from "../../types/dom";
import { richText } from "../card/rich-text";
import {
  ExplorationChoice,
  type ExplorationChoiceEntity,
} from "./ExplorationChoice";
import {
  OfferTile,
  OFFER_TILE_COMPACT_SIZE,
  OFFER_TILE_STANDARD_SIZE,
  type OfferTileFourCards,
  type OfferTileModel,
} from "./OfferTile";
import { auguryOfferHeadline } from "./offer-tile-descriptions";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function click(element: Element | null | undefined): void {
  act(() => {
    (element as HTMLElement | null | undefined)?.click();
  });
}

function pointer(
  type: "pointerdown" | "pointerup" | "pointerover",
  pointerType: "mouse" | "touch",
  pointerId: number,
  timeStamp = 0,
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 120,
    clientY: 80,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    timeStamp: { value: timeStamp },
  });
  return event;
}

function fixtureCard(
  cardId: CardId,
  cardNumber: number,
  art?: { readonly x: number; readonly y: number; readonly scale: number },
): Readonly<CardData> {
  return {
    id: cardId,
    name: parseCardName(`Test Card ${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "Spirit Animal",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "",
    imageNumber: 100 + cardNumber,
    artOwned: true,
    ...(art === undefined ? {} : { art }),
  };
}

const CARDS = [
  fixtureCard(testCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"), 1, {
    x: 0.5,
    y: -0.5,
    scale: 1.7,
  }),
  fixtureCard(testCardId("161482b6-af07-4d9e-822d-8c738672beb9"), 2),
  fixtureCard(testCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"), 3),
  fixtureCard(testCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"), 4),
] as const satisfies OfferTileFourCards;

const OFFER: OfferTileModel = {
  id: testOfferTileId("card-draft"),
  kind: "card-draft",
  cards: CARDS,
};

const PRESENTATION = {
  headline: { kind: "text", text: "Headline" },
  subtitle: { kind: "text", text: "Subtitle" },
} as const;

type OfferTileProps = Parameters<typeof OfferTile>[0];

function offerTile(
  testId: DomTestId,
  model: OfferTileModel,
  extra: Partial<OfferTileProps> = {},
): ReactElement {
  return (
    <OfferTile
      key={testId}
      presentation={PRESENTATION}
      model={model}
      onPress={() => {}}
      testId={testId}
      {...extra}
    />
  );
}

describe("OfferTile", () => {
  it("uniformly scales the compact composition from the standard geometry", () => {
    const { container } = renderInCumulus(
      <>
        {offerTile("standard", OFFER)}
        {offerTile("compact", OFFER, { size: "compact" })}
      </>,
    );
    const standard = container.querySelector<HTMLElement>(
      '[data-testid="standard"]',
    )!;
    const compact = container.querySelector<HTMLElement>(
      '[data-testid="compact"]',
    )!;
    const frame = compact.querySelector<HTMLElement>(
      "[data-offer-tile-floating-frame]",
    )!;
    expect(standard.style.width).toBe(`${String(OFFER_TILE_STANDARD_SIZE)}px`);
    expect(compact.style.width).toBe(`${String(OFFER_TILE_COMPACT_SIZE)}px`);
    expect(frame.style.width).toBe(`${String(OFFER_TILE_STANDARD_SIZE)}px`);
    expect(Number(frame.style.scale)).toBeCloseTo(
      OFFER_TILE_COMPACT_SIZE / OFFER_TILE_STANDARD_SIZE,
      5,
    );
  });

  it("lays out one to four card panels and applies the authored art focus", () => {
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
      ["four", OFFER, "grid-4"],
    ];
    const { container } = renderInCumulus(
      <>{models.map(([testId, model]) => offerTile(testId, model))}</>,
    );
    for (const [testId, , layout] of models) {
      expect(
        container.querySelector<HTMLElement>(
          `[data-testid="${testId}"] [data-offer-tile-card-art-layout]`,
        )?.dataset.offerTileCardArtLayout,
      ).toBe(layout);
    }

    const image = container.querySelector<HTMLImageElement>(
      `[data-testid="one"] [data-offer-tile-card-art="${CARDS[0].id}"] img`,
    )!;
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 462 },
      naturalHeight: { configurable: true, value: 280 },
    });
    act(() => {
      image.dispatchEvent(new Event("load", { bubbles: true }));
    });
    const translation = /translate\(([-\d.]+)%, ([-\d.]+)%\)$/.exec(
      image.style.transform,
    );
    expect(Number(translation?.[1])).toBeGreaterThan(0);
    expect(Number(translation?.[2])).toBeLessThan(0);
  });

  it("is the single interaction and reveal source and reports its offer id", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <OfferTile presentation={PRESENTATION} model={OFFER} onPress={onPress} />,
    );
    const source =
      container.querySelector<HTMLButtonElement>("[data-offer-tile]")!;
    expect(source.tagName).toBe("BUTTON");
    expect(source.querySelectorAll("[data-reveal-entity-type]")).toHaveLength(
      0,
    );
    expect(source.dataset.revealEntityType).toBe("offer");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.getAttribute("aria-label")).toBe(
      auguryOfferHeadline(OFFER, PRESENTATION),
    );
    click(source);
    expect(onPress).toHaveBeenCalledWith(OFFER.id);
  });

  it("renders Dreamsign and site offers over full-art backgrounds", () => {
    const presentation = {
      ...PRESENTATION,
      backgroundArt: { source: "card", imageNumber: 123456 },
    } as const;
    const { container } = renderInCumulus(
      <>
        {offerTile(
          "gift",
          {
            id: testOfferTileId("dreamsign-gift"),
            kind: "dreamsign-gift",
            dreamsign: {
              id: testDreamsignId("c706d0ba-2f41-4b14-95d8-db168ac6246c"),
              name: "Sign",
              art: { kind: "dreamsign", imageName: "sign.png" },
            },
          },
          { presentation },
        )}
        {offerTile(
          "site",
          {
            id: testOfferTileId("add-site"),
            kind: "add-site",
            site: { id: "Duplication", name: "Site", glyph: GLYPHS.copy },
          },
          { presentation },
        )}
      </>,
    );
    for (const [testId, kind] of [
      ["gift", "dreamsign-gift"],
      ["site", "add-site"],
    ] as const) {
      expect(
        container.querySelector<HTMLElement>(
          `[data-testid="${testId}"] [data-offer-tile-full-art-background="${kind}"]`,
        )?.dataset.offerTileFullArtBackgroundImage,
      ).toBe("123456");
    }
    expect(
      container.querySelector(
        '[data-testid="gift"] [data-offer-tile-dreamsign-id]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="site"] [data-offer-tile-site-id]'),
    ).not.toBeNull();
  });
});

describe("ExplorationChoice", () => {
  const entityCard = syntheticGameCard(1);
  const entity: ExplorationChoiceEntity = {
    kind: "card",
    id: entityCard.cardId,
    entryId: parseDeckEntryId("entry"),
    card: entityCard,
  };
  const annotated = richText.annotated(
    annotatedFixture("{entity}", { entity: "Entity" }, { entity }),
  );

  function choice(actionId: ExplorationActionId): HTMLElement {
    return document.querySelector<HTMLElement>(
      `[data-exploration-action-id="${actionId}"]`,
    )!;
  }

  it("emits its action id once per mouse, keyboard-compatible, and touch activation", () => {
    const actionId = testExplorationActionId("activation");
    const onPress = vi.fn();
    renderInCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: "Choice",
          description: richText.rules("Plain"),
          availability: "available",
        }}
        onPress={onPress}
      />,
    );
    const target = choice(actionId);
    const mouseClick = (detail: number) => {
      act(() => {
        target.dispatchEvent(
          new MouseEvent("click", { bubbles: true, detail }),
        );
      });
    };
    mouseClick(1);
    mouseClick(0);
    expect(onPress).toHaveBeenCalledTimes(2);
    act(() => {
      target.dispatchEvent(pointer("pointerdown", "touch", 7, 100));
    });
    act(() => {
      target.dispatchEvent(pointer("pointerup", "touch", 7, 180));
    });
    mouseClick(1);
    expect(onPress).toHaveBeenCalledTimes(3);
    expect(onPress).toHaveBeenNthCalledWith(3, actionId);
  });

  it("uses touch hold for reading without activation", () => {
    const actionId = testExplorationActionId("hold");
    vi.useFakeTimers();
    const onPress = vi.fn();
    renderInCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: "Choice",
          description: annotated,
          availability: "available",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    const target = choice(actionId);
    act(() => {
      target.dispatchEvent(pointer("pointerdown", "touch", 8, 100));
    });
    act(() => {
      vi.advanceTimersByTime(35);
    });
    act(() => {
      target.dispatchEvent(pointer("pointerup", "touch", 8, 401));
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it("preserves authored order for repeated labels across UUID-backed entity kinds", () => {
    const secondCard = syntheticGameCard(2);
    const repeated: ExplorationChoiceEntity = {
      kind: "card",
      id: secondCard.cardId,
      entryId: parseDeckEntryId("entry-two"),
      card: secondCard,
    };
    const dreamsign = localizedDreamsignFixture({
      idSeed: "40000000-0000-4000-8000-000000000001",
      name: "Entity",
    });
    const dreamsignEntity: ExplorationChoiceEntity = {
      kind: "dreamsign",
      id: dreamsign.id,
      dreamsign,
    };
    const actionId = testExplorationActionId("ordered");
    const { container } = renderInCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: "Choice",
          description: richText.annotated(
            annotatedFixture(
              "{first} then {second} then {sign}",
              { first: "Entity", second: "Entity", sign: dreamsign.name },
              { first: entity, second: repeated, sign: dreamsignEntity },
            ),
          ),
          availability: "available",
          preview: dreamsignEntity,
        }}
        onPress={() => {}}
      />,
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-exploration-entity-label]",
        ),
        (element) => element.dataset.entityId,
      ),
    ).toEqual([entity.id, repeated.id, dreamsign.id]);
    expect(choice(actionId).dataset.explorationEntityPreview).toBe("dreamsign");
  });

  it("registers a fixed Transfiguration glossary definition", () => {
    const glossaryId = parseGlossaryEntryId(
      "f40df441-0e44-4122-b4d4-cdc4085a9ffb",
    );
    const actionId = testExplorationActionId("kindled");
    renderInCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: "Choice",
          description: richText.rules("Plain"),
          availability: "available",
          transfigurationGlossaryId: glossaryId,
        }}
        onPress={() => {}}
      />,
    );
    expect(choice(actionId).dataset.explorationTransfigurationGlossaryId).toBe(
      glossaryId,
    );
  });

  it("keeps unavailable entity labels visible and inert", () => {
    const actionId = testExplorationActionId("blocked");
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <ExplorationChoice
        model={{
          actionId,
          label: "Choice",
          description: annotated,
          availability: "unavailable",
          preview: entity,
        }}
        onPress={onPress}
      />,
    );
    click(choice(actionId));
    expect(onPress).not.toHaveBeenCalled();
    const label = container.querySelector("[data-exploration-entity-label]");
    expect(label).not.toBeNull();
    expect(label?.hasAttribute("tabindex")).toBe(false);
    expect(label?.hasAttribute("data-reveal-entity-id")).toBe(false);
  });
});
