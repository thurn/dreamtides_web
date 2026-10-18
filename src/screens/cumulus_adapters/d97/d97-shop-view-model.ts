// The pure view-model builders for a Dreamtides 97 shop: its keeper, the
// player's Essence and its stock (each slot's fixed quote, bought slots
// empty, slots the player cannot afford disabled, and this visit's one
// restock), and the sell panel (every owned copy captioned with the rules'
// sale quote, `shopSaleQuote`, and disabled when the rules' `sellRefusal`
// refuses it). Card UUIDs resolve to cards only here.

import { D97_COLLECTION } from "../../../content/d97/collection";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import type { D97ShopTuning } from "../../../content/d97/shop";
import type { D97ShopKeeperView, D97ShopView } from "../../../cumulus/screens/d97/D97ShopPanel";
import type { D97ShopSellCardView, D97ShopSellView } from "../../../cumulus/screens/d97/D97ShopSellPanel";
import { copiesInZone } from "../../../d97/collection/collection";
import type { D97CopyZone } from "../../../d97/collection/types";
import type { OverworldOccupant } from "../../../d97/overworld/occupants";
import { restockPrice } from "../../../d97/shop/pricing";
import type { D97ContentProvider } from "../../../rules/d97/d97-content";
import { sellRefusal, shopSaleQuote, shopSellGuards } from "../../../rules/d97/d97-shop";
import type { D97Run, D97Shop } from "../../../rules/d97/d97-state";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { parseDeckEntryId, type D97CharacterId, type D97DialogueId, type DreamAnchorId } from "../../../types/identifiers";
import { SHOP_FLOW_PRESENTATION } from "../shop-flow-presentation-view-model";

/** The keeper resolved for display: who stands at the shop's anchor and the name their dialogue gives them. */
export interface D97ShopKeeper {
  readonly characterId: D97CharacterId;
  readonly name: string | null;
}

/** The keeper of the shop `occupant` stands at, named by their dialogue's speaker; null when nobody does. */
export function resolveD97ShopKeeper(
  occupant: Pick<OverworldOccupant, "character" | "dialogue"> | undefined,
  dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>,
): D97ShopKeeper | null {
  if (occupant === undefined) return null;
  const name = occupant.dialogue === null ? null : (dialogues.get(occupant.dialogue)?.speaker.name ?? null);
  return { characterId: occupant.character, name };
}

function keeperView(keeper: D97ShopKeeper | null): D97ShopKeeperView | null {
  if (keeper === null) return null;
  return {
    characterId: keeper.characterId,
    name: keeper.name,
    portraitAlt: keeper.name === null ? "The shopkeeper" : `${keeper.name}, the shopkeeper`,
  };
}

/**
 * The view of a D97 shop kept by `keeper` (null for a shop nobody keeps).
 * Slots of unknown cards are hidden.
 */
export function buildD97ShopView(input: {
  readonly anchorId: DreamAnchorId;
  readonly shop: D97Shop;
  readonly keeper: D97ShopKeeper | null;
  readonly essence: number;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly tuning: D97ShopTuning;
}): D97ShopView {
  const { anchorId, shop, keeper, essence, cards, tuning } = input;
  const restock = restockPrice(tuning.priceBand, tuning);
  return {
    anchorId,
    keeper: keeperView(keeper),
    essence,
    offers: shop.slots.flatMap((slot, slotIndex) => {
      const card = cards.get(slot.cardId);
      if (card === undefined) return [];
      return [
        {
          entryId: parseDeckEntryId(`d97-shop-slot-${String(shop.rolls)}-${String(slotIndex)}-${card.id}`),
          slotIndex,
          model: { cardId: card.id, displaySnapshot: card },
          price: slot.price,
          state: slot.purchased ? "purchased" : slot.price <= essence ? "available" : "unaffordable",
        } as const,
      ];
    }),
    restock: {
      entryId: parseDeckEntryId(`d97-shop-restock-${anchorId}`),
      price: restock,
      state: shop.restockedThisVisit ? "used" : restock <= essence ? "available" : "unaffordable",
    },
    labels: {
      title: "Wares",
      restockAction: SHOP_FLOW_PRESENTATION.restockAction,
      restocked: SHOP_FLOW_PRESENTATION.restocked,
      freePrice: SHOP_FLOW_PRESENTATION.freePrice,
      sell: "Sell Cards",
      leave: "Leave the shop",
      readHint: "Press and hold a card to read it.",
    },
  };
}

/**
 * The sell panel view of `run`'s collection, at `keeper`'s shop: prices and
 * refusals are the rules' own. Copies of unknown cards are hidden.
 */
export function buildD97ShopSellView(input: {
  readonly run: D97Run;
  readonly keeper: D97ShopKeeper | null;
  readonly cards: ReadonlyMap<CardId, CardData>;
  /** The content the rules price cards from. */
  readonly content: Pick<D97ContentProvider, "cardPriceFacts">;
}): D97ShopSellView {
  const { run, cards, content } = input;
  const zone = (name: D97CopyZone): D97ShopSellCardView[] =>
    copiesInZone(run.collection, name).flatMap((copy) => {
      const card = cards.get(copy.cardId);
      const price = shopSaleQuote(run, copy.copyId, content);
      if (card === undefined || price === null) return [];
      return [
        {
          entryId: copy.copyId,
          model: { cardId: card.id, displaySnapshot: card },
          caption: { kind: "essence", amount: price },
          disabled: sellRefusal(run, copy.copyId) !== null,
          testId: `d97-shop-sell-card-${copy.copyId}`,
        },
      ];
    });
  return {
    keeper: keeperView(input.keeper),
    essence: run.essence,
    reserve: zone("reserve"),
    deck: zone("deck"),
    collectionFloor: D97_COLLECTION.collectionFloor,
    minimumDeckSize: D97_COLLECTION.minimumDeckSize,
    ...shopSellGuards(run),
  };
}
