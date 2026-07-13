// @vitest-environment jsdom

import { act, type HTMLAttributes, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { GameCardModel } from "../card/CardView";
import { CARD_ASPECT_H, CARD_ASPECT_W } from "../card/card-aspect";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      layoutId,
      children,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      readonly layoutId?: string;
      readonly children?: ReactNode;
    }) => (
      <div data-layout-id={layoutId} {...props}>
        {children}
      </div>
    ),
  },
}));

vi.mock("../card/CardView", () => ({
  GameCard: ({
    model,
    figment,
    figmentTitleBar,
  }: {
    readonly model: GameCardModel;
    readonly figment?: boolean;
    readonly figmentTitleBar?: boolean;
  }) => (
    <div
      data-mock-game-card={model.cardId}
      data-figment={String(figment ?? false)}
      data-figment-title-bar={String(figmentTitleBar ?? false)}
    />
  ),
}));

import {
  CARD_PILE_VISIBLE_LAYER_CAP,
  CardPile,
  type BattlePileCard,
} from "./CardPile";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
const MODEL: GameCardModel = {
  cardId: CARD_ID,
  displaySnapshot: {
    id: CARD_ID,
    name: asCardName("Fixture Card"),
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "",
    imageNumber: 1,
    artOwned: true,
  },
};

const CARDS: readonly BattlePileCard[] = [
  { face: "up", id: "instance-top", model: MODEL, figment: true },
  { face: "down", id: "instance-second" },
  { face: "up", id: "instance-third", model: MODEL, figmentTitleBar: true },
  { face: "down", id: "instance-hidden" },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("CardPile", () => {
  it("renders the topmost three physical layers in stable identity order", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CardPile
          cards={CARDS}
          orientation="portrait"
          label="Enemy void"
          testId="enemy-void"
        />,
      );
    });

    const pile = container.querySelector<HTMLElement>("[data-card-pile]");
    const layers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-card-pile-layer]"),
    );
    expect(pile?.getAttribute("aria-label")).toBe("Enemy void");
    expect(pile?.dataset.pileCount).toBe("4");
    expect(pile?.dataset.pileVisibleCount).toBe(
      String(CARD_PILE_VISIBLE_LAYER_CAP),
    );
    expect(layers.map((layer) => layer.dataset.battleCardId)).toEqual([
      "instance-top",
      "instance-second",
      "instance-third",
    ]);
    expect(layers.map((layer) => layer.dataset.pileDepth)).toEqual([
      "0",
      "1",
      "2",
    ]);
    expect(layers.map((layer) => layer.dataset.layoutId)).toEqual([
      "battle-card:instance-top",
      "battle-card:instance-second",
      "battle-card:instance-third",
    ]);
    expect(
      layers.map(
        (layer) =>
          (layer.firstElementChild as HTMLElement | null)?.style.transform,
      ),
    ).toEqual([
      "translate(var(--space-2), calc(-1 * var(--space-2)))",
      "translate(var(--space-1), calc(-1 * var(--space-1)))",
      "translate(0, 0)",
    ]);
    expect(container.querySelector('[data-battle-card-id="instance-hidden"]')).toBeNull();
    expect(container.querySelectorAll("[data-card-back]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-mock-game-card]")).toHaveLength(2);
    expect(container.querySelector("button")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("rests the same portrait card objects sideways in landscape orientation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CardPile
          cards={[{ face: "down", id: "deck-top" }]}
          orientation="landscape"
          label="Player deck"
        />,
      );
    });

    const pile = container.querySelector<HTMLElement>("[data-card-pile]");
    const stage = container.querySelector<HTMLElement>(
      "[data-card-pile-layer] > div > div",
    );
    expect(pile?.dataset.pileOrientation).toBe("landscape");
    expect(pile?.style.aspectRatio).toBe(
      `${String(CARD_ASPECT_H)} / ${String(CARD_ASPECT_W)}`,
    );
    expect(stage?.style.transform).toContain("rotate(90deg)");

    act(() => root.unmount());
    container.remove();
  });
});
