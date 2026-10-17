// @vitest-environment jsdom
// D97ShopPanel contract: presents the keeper's character bust and name and
// the player's Essence, buys only available wares by slot index, and shows a
// neutral strip (Essence alone) for a shop nobody keeps; on phones the
// wares use the readable two-column density.

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardId } from "../../../types/card-identity";
import { parseD97CharacterId, parseDeckEntryId, parseDreamAnchorId } from "../../../types/identifiers";
import type { DomTestId } from "../../types/dom";
import { renderInCumulus } from "../../testing/render";
import { card, stubMatchMedia } from "../augury-and-starting-deck.fixtures";
import type { CardShopOfferView } from "../CardShopSiteScreen";
import { D97ShopPanel, type D97ShopView } from "./D97ShopPanel";

vi.mock("../../primitives/lpc-character", () => ({
  LPC_FRAME_SIZE: 64,
  lpcCharacterFrame: () => Promise.resolve("data:image/png;base64,AAAA"),
}));

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

const KEEPER = parseD97CharacterId("d9791000-0000-4000-8000-0000000000b1");
const ANCHOR = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000b1");

function offer(slotIndex: number, state: CardShopOfferView["state"]): CardShopOfferView {
  const displaySnapshot = card(slotIndex + 1);
  return {
    entryId: parseDeckEntryId(`d97-shop-slot-0-${String(slotIndex)}-${displaySnapshot.id}`),
    slotIndex,
    model: { cardId: displaySnapshot.id, displaySnapshot },
    price: 40,
    state,
  };
}

const VIEW: D97ShopView = {
  anchorId: ANCHOR,
  keeper: { characterId: KEEPER, name: "Keeper", portraitAlt: "Keeper portrait" },
  essence: 120,
  offers: [offer(0, "available"), offer(1, "unaffordable")],
  restock: { entryId: parseDeckEntryId("d97-shop-restock"), price: 30, state: "available" },
  labels: { title: "Wares", restockAction: "Restock", restocked: "Restocked", freePrice: "Free", sell: "Sell", leave: "Leave", readHint: "Hold" },
};

function render(view: D97ShopView, onBuy = vi.fn()) {
  return renderInCumulus(
    <D97ShopPanel view={view} onBuy={onBuy} onRestock={() => undefined} onSell={() => undefined} onClose={() => undefined} />,
  );
}

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

describe("D97ShopPanel", () => {
  it("presents the keeper's bust and name and the player's Essence", async () => {
    const { container } = render(VIEW);
    await act(async () => {
      await Promise.resolve();
    });
    const strip = container.querySelector("[data-d97-shop-strip]");
    expect(strip?.getAttribute("data-d97-shop-keeper")).toBe(KEEPER);
    expect(strip?.getAttribute("data-d97-shop-essence")).toBe("120");
    const portrait = container.querySelector(`[data-d97-character-portrait="${KEEPER}"]`);
    expect(portrait?.getAttribute("data-d97-character-portrait-ready")).toBe("true");
    expect(container.querySelector("[data-d97-shop-keeper-name]")).not.toBeNull();
    expect(container.querySelector("[data-d97-shop-essence-readout] [data-essence-value]")).not.toBeNull();
  });

  it("buys an available ware by slot index and ignores an unaffordable one", () => {
    const onBuy = vi.fn();
    const { container } = render(VIEW, onBuy);
    act(() => container.querySelector<HTMLElement>('[data-testid="d97-shop-offer-1"]')?.click());
    expect(onBuy).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLElement>('[data-testid="d97-shop-offer-0"]')?.click());
    expect(onBuy).toHaveBeenCalledWith(0);
  });

  it("lays the wares out two to a row at the readable card size on phones", () => {
    const { container } = render(VIEW);
    const surface = container.querySelector<HTMLElement>("[data-gallery-role=picker]")?.dataset;
    expect(surface?.galleryColumns).toBe("2");
    expect(surface?.galleryCardSize).toBe("standard");
  });

  it("shows the Essence alone for a shop nobody keeps", () => {
    const { container } = render({ ...VIEW, keeper: null });
    expect(container.querySelector("[data-d97-shop-strip]")?.getAttribute("data-d97-shop-keeper")).toBe("");
    expect(container.querySelector("[data-d97-character-portrait]")).toBeNull();
    expect(container.querySelector("[data-d97-shop-keeper-name]")).toBeNull();
    expect(container.querySelector("[data-d97-shop-essence-readout] [data-essence-value]")).not.toBeNull();
  });
});
