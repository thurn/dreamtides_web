// @vitest-environment jsdom
// D97ShopSellPanel contract: shows the reserve first, reports a sale by
// owned-copy id, and disables every copy at the collection floor.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardId } from "../../../types/card-identity";
import { parseD97OwnedCopyId } from "../../../types/identifiers";
import type { DomTestId } from "../../types/dom";
import { renderInCumulus } from "../../testing/render";
import { card, stubMatchMedia } from "../augury-and-starting-deck.fixtures";
import { D97ShopSellPanel, type D97ShopSellCardView, type D97ShopSellView } from "./D97ShopSellPanel";

vi.mock("../../components/card/CardView", async () => {
  const { Pressable } = await import("../../primitives/Pressable");
  return {
    CardView: () => <div />,
    GameCard: ({
      model,
      onPress,
      unavailable,
      testId,
    }: {
      model: { cardId: CardId };
      onPress?: () => void;
      unavailable?: boolean;
      testId?: DomTestId;
    }) => (
      <Pressable
        as={onPress === undefined ? "div" : "button"}
        data-testid={testId}
        data-card-id={model.cardId}
        onClick={unavailable === true ? undefined : onPress}
      />
    ),
  };
});

function copyId(index: number) {
  return parseD97OwnedCopyId(`97000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
}

function entry(index: number): D97ShopSellCardView {
  const displaySnapshot = card(index);
  return {
    entryId: copyId(index),
    model: { cardId: displaySnapshot.id, displaySnapshot },
    caption: { kind: "essence", amount: 20 },
    testId: `d97-shop-sell-card-${copyId(index)}`,
  };
}

const VIEW: D97ShopSellView = { keeper: null, essence: 40, reserve: [entry(1)], deck: [entry(2), entry(3)], collectionFloor: 25, atFloor: false, minimumDeckSize: 25, deckAtMinimum: false };

beforeEach(() => {
  stubMatchMedia(() => false);
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

describe("D97ShopSellPanel", () => {
  it("shows the reserve first and sells a copy by id", () => {
    const onSell = vi.fn();
    const { container } = renderInCumulus(<D97ShopSellPanel view={VIEW} onSell={onSell} onClose={() => undefined} />);
    expect(container.querySelector("[data-d97-shop-sell-zone]")?.getAttribute("data-d97-shop-sell-zone")).toBe("reserve");
    const target = container.querySelector<HTMLElement>(`[data-testid="d97-shop-sell-card-${copyId(1)}"]`);
    expect(target).not.toBeNull();
    act(() => target!.click());
    expect(onSell).toHaveBeenCalledWith(copyId(1));
  });

  it("shows the player's Essence while selling", () => {
    const { container } = renderInCumulus(<D97ShopSellPanel view={VIEW} onSell={() => undefined} onClose={() => undefined} />);
    expect(container.querySelector("[data-d97-shop-strip]")?.getAttribute("data-d97-shop-essence")).toBe("40");
    expect(container.querySelector("[data-d97-shop-essence-readout] [data-essence-value]")).not.toBeNull();
  });

  it("disables every copy at the collection floor", () => {
    const onSell = vi.fn();
    const { container } = renderInCumulus(<D97ShopSellPanel view={{ ...VIEW, atFloor: true }} onSell={onSell} onClose={() => undefined} />);
    expect(container.querySelector("[data-d97-shop-sell-at-floor]")?.getAttribute("data-d97-shop-sell-at-floor")).toBe("true");
    act(() => container.querySelector<HTMLElement>(`[data-testid="d97-shop-sell-card-${copyId(1)}"]`)?.click());
    expect(onSell).not.toHaveBeenCalled();
  });

  it("disables deck copies, not reserve copies, while the deck is at its minimum", () => {
    const onSell = vi.fn();
    const { container } = renderInCumulus(<D97ShopSellPanel view={{ ...VIEW, deckAtMinimum: true }} onSell={onSell} onClose={() => undefined} />);
    expect(container.querySelector("[data-d97-shop-sell-deck-at-minimum]")?.getAttribute("data-d97-shop-sell-deck-at-minimum")).toBe("true");
    act(() => container.querySelector<HTMLElement>(`[data-testid="d97-shop-sell-card-${copyId(1)}"]`)?.click());
    expect(onSell).toHaveBeenCalledWith(copyId(1));
    // The second tab is the active deck.
    const deckTab = container.querySelectorAll<HTMLElement>("[role=tab]")[1];
    expect(deckTab).toBeDefined();
    act(() => deckTab.click());
    expect(container.querySelector("[data-d97-shop-sell-zone]")?.getAttribute("data-d97-shop-sell-zone")).toBe("deck");
    act(() => container.querySelector<HTMLElement>(`[data-testid="d97-shop-sell-card-${copyId(2)}"]`)?.click());
    expect(onSell).toHaveBeenCalledTimes(1);
  });
});
