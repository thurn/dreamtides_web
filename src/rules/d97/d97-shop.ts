// The D97 shop cases (Appendix A §A4–A6): the dream's shop rolls its stock
// from the reward bag when first opened and on each restock, fixing each
// slot's quote; the player buys any affordable slot once, sells owned copies
// under the resale guard and the collection floor, and restocks once per
// visit for Essence. Every stock roll and transaction is logged with UUIDs.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import { D97_COLLECTION } from "../../content/d97/collection";
import type { D97DreamTopology } from "../../content/d97/dreams/schema";
import { D97_ENCOUNTERS } from "../../content/d97/encounters";
import { D97_SHOP } from "../../content/d97/shop";
import { acquireForRun } from "../../d97/collection/acquisition";
import { canUnequip, findCopy, removeCopies } from "../../d97/collection/collection";
import { activeRewardBag, sampleFilteredOffer } from "../../d97/collection/reward-bag";
import {
  buyQuote,
  cardBaseValue,
  restockPrice,
  saleQuote,
  shopSlotCount,
  slotCeiling,
} from "../../d97/shop/pricing";
import type { EventContext, ReducerLogRecord } from "../../eventlog/types";
import type { CardId } from "../../types/card-identity";
import type { D97OwnedCopyId, DreamAnchorId } from "../../types/identifiers";
import { d97ContentProvider, type D97ContentProvider } from "./d97-content";
import { runDreamAnchor } from "./d97-dreams";
import type { D97Transition } from "./d97-run";
import type { D97OverworldState, D97Run, D97Shop, D97ShopSlot } from "./d97-state";
import type { D97RunInput } from "./events/spec";

/** A shop case's payload names the dream's shop anchor. */
type ShopPayload = { readonly anchorId: DreamAnchorId };

/** Whether `anchorId` is the shop of a dream of `topology`, the only shop its cases open. */
export function isDreamShop(topology: D97DreamTopology, anchorId: DreamAnchorId): boolean {
  return anchorId === topology.shopAnchorId;
}

/** The run, shop anchor and content a shop case acts on, or null to bounce. */
function shopContext(
  { run }: D97RunInput,
  { anchorId }: ShopPayload,
): { run: D97Run; anchorId: DreamAnchorId; content: D97ContentProvider } | null {
  const content = d97ContentProvider();
  if (content === null) return null;
  // Only the shop of the run's own dream.
  const dream = runDreamAnchor(run, content, anchorId);
  if (dream === null || !isDreamShop(dream.definition.topology, anchorId)) return null;
  return { run, anchorId, content };
}

function withShop(d97: D97OverworldState, run: D97Run, anchorId: DreamAnchorId, shop: D97Shop, changes: Partial<D97Run>, logRecords: readonly ReducerLogRecord[]): D97Transition {
  return { d97: { ...d97, run: { ...run, ...changes, shops: { ...run.shops, [anchorId]: shop } } }, logRecords };
}

/** A card's buy quote at the shop's band, or null when the card has no price facts. */
function quoteOf(content: D97ContentProvider, cardId: CardId): number | null {
  const facts = content.cardPriceFacts(cardId);
  return facts === null ? null : buyQuote(cardBaseValue(facts, D97_SHOP), D97_SHOP.priceBand, D97_SHOP);
}

/**
 * Roll every slot: slot `i` offers a distinct card of rarity cost at most its
 * ceiling, sampled from the bag without removing a copy, its quote fixed now.
 */
function rollStock(run: D97Run, content: D97ContentProvider, ctx: EventContext): D97ShopSlot[] {
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const slots: D97ShopSlot[] = [];
  const shown = new Set<CardId>();
  const bag = activeRewardBag(content, run);
  const count = shopSlotCount(D97_SHOP.priceBand, D97_SHOP);
  for (let index = 0; index < count; index += 1) {
    const ceiling = slotCeiling(index, D97_SHOP);
    const eligible = (cardId: CardId) => {
      const facts = content.cardPriceFacts(cardId);
      return facts !== null && D97_ENCOUNTERS.rarityCost[facts.rarity] <= ceiling;
    };
    const cardId = sampleFilteredOffer(bag, eligible, shown, random);
    const price = cardId === null ? null : quoteOf(content, cardId);
    if (cardId === null || price === null) continue;
    shown.add(cardId);
    slots.push({ cardId, price, purchased: false });
  }
  return slots;
}

function stockFields(shop: D97Shop) {
  return { rolls: shop.rolls, slots: shop.slots.map(({ cardId, price, purchased }) => ({ cardId, price, purchased })) };
}

/**
 * `D97_OPEN_SHOP { anchorId }`: open the dream's shop, from its shopkeeper
 * or a conversation's hand-off. The first open rolls the stock.
 */
export function openShop(input: D97RunInput, payload: ShopPayload, ctx: EventContext): D97Transition | null {
  const context = shopContext(input, payload);
  if (context === null) return null;
  const { run, anchorId, content } = context;
  const existing = run.shops[anchorId];
  const shop = existing ?? { slots: rollStock(run, content, ctx), restockedThisVisit: false, rolls: 1 };
  return withShop(input.d97, run, anchorId, shop, {}, [
    {
      event: "d97_shop_opened",
      fields: { runId: run.runId, anchorId, firstOpen: existing === undefined, priceBand: D97_SHOP.priceBand, ...stockFields(shop) },
    },
  ]);
}

/**
 * `D97_BUY_SHOP_CARD { anchorId, slotIndex }`: buy one unbought, affordable
 * slot. The copy enters the reserve with its price recorded, and acquiring it
 * removes one copy from the bag if the bag still holds one.
 */
export function buyShopCard(input: D97RunInput, payload: ShopPayload & { readonly slotIndex: number }): D97Transition | null {
  const context = shopContext(input, payload);
  const { slotIndex } = payload;
  if (context === null) return null;
  const { run, anchorId, content } = context;
  const shop = run.shops[anchorId];
  const slot = shop?.slots[slotIndex];
  if (shop === undefined || slot === undefined || slot.purchased || slot.price > run.essence) return null;
  const acquired = acquireForRun(run, { cardId: slot.cardId, channel: "shop", price: slot.price, zone: "reserve", source: "offer" }, content);
  const { collection, bags } = acquired.run;
  const { copy } = acquired;
  const slots = shop.slots.map((candidate, index) => (index === slotIndex ? { ...candidate, purchased: true } : candidate));
  const essence = run.essence - slot.price;
  return withShop(input.d97, run, anchorId, { ...shop, slots }, { collection, essence, bags }, [
    ...acquired.logRecords,
    {
      event: "d97_shop_card_bought",
      fields: { runId: run.runId, anchorId, slotIndex, cardId: slot.cardId, copyId: copy.copyId, price: slot.price, essence },
    },
  ]);
}

/** What the dream's shop pays for `copyId` now, or null for an unknown copy or card. */
export function shopSaleQuote(
  run: D97Run,
  copyId: D97OwnedCopyId,
  content: Pick<D97ContentProvider, "cardPriceFacts">,
): number | null {
  const copy = findCopy(run.collection, copyId);
  const facts = copy === null ? null : content.cardPriceFacts(copy.cardId);
  if (copy === null || facts === null) return null;
  return saleQuote(copy, cardBaseValue(facts, D97_SHOP), D97_SHOP.priceBand, D97_SHOP);
}

/**
 * What stops the shop buying from `run` now: at the collection floor it buys
 * nothing, and while the active deck is at its minimum size it buys no deck
 * copy (as for unequipping).
 */
export function shopSellGuards(run: D97Run): { readonly atFloor: boolean; readonly deckAtMinimum: boolean } {
  return {
    atFloor: run.collection.copies.length <= D97_COLLECTION.collectionFloor,
    deckAtMinimum: !canUnequip(run.collection, D97_COLLECTION.minimumDeckSize),
  };
}

/** Why the shop will not buy `copyId` from `run` (`shopSellGuards`), or null when it will. */
export function sellRefusal(run: D97Run, copyId: D97OwnedCopyId): "unknownCopy" | "atFloor" | "deckAtMinimum" | null {
  const copy = findCopy(run.collection, copyId);
  if (copy === null) return "unknownCopy";
  const guards = shopSellGuards(run);
  if (guards.atFloor) return "atFloor";
  return copy.zone === "deck" && guards.deckAtMinimum ? "deckAtMinimum" : null;
}

/**
 * `D97_SELL_COPY { anchorId, copyId }`: sell an owned copy for its sale quote
 * under the resale guard. Refused when it would cross the collection floor,
 * or take the active deck below its minimum size.
 */
export function sellCopy(input: D97RunInput, payload: ShopPayload & { readonly copyId: D97OwnedCopyId }): D97Transition | null {
  const context = shopContext(input, payload);
  const { copyId } = payload;
  if (context === null) return null;
  const { run, anchorId, content } = context;
  const shop = run.shops[anchorId];
  const copy = findCopy(run.collection, copyId);
  const price = shopSaleQuote(run, copyId, content);
  if (shop === undefined || copy === null || price === null || sellRefusal(run, copyId) !== null) return null;
  const collection = removeCopies(run.collection, [copyId], D97_COLLECTION.collectionFloor);
  if (collection === null) return null;
  const essence = run.essence + price;
  return withShop(input.d97, run, anchorId, shop, { collection, essence }, [
    {
      event: "d97_shop_copy_sold",
      fields: {
        runId: run.runId,
        anchorId,
        copyId,
        cardId: copy.cardId,
        zone: copy.zone,
        channel: copy.provenance.channel,
        price,
        essence,
        collectionSize: collection.copies.length,
      },
    },
  ]);
}

/**
 * `D97_RESTOCK_SHOP { anchorId }`: pay to re-roll every slot, including bought
 * ones. Once per visit.
 */
export function restockShop(input: D97RunInput, payload: ShopPayload, ctx: EventContext): D97Transition | null {
  const context = shopContext(input, payload);
  if (context === null) return null;
  const { run, anchorId, content } = context;
  const shop = run.shops[anchorId];
  const price = restockPrice(D97_SHOP.priceBand, D97_SHOP);
  if (shop === undefined || shop.restockedThisVisit || price > run.essence) return null;
  const restocked: D97Shop = { slots: rollStock(run, content, ctx), restockedThisVisit: true, rolls: shop.rolls + 1 };
  const essence = run.essence - price;
  return withShop(input.d97, run, anchorId, restocked, { essence }, [
    { event: "d97_shop_restocked", fields: { runId: run.runId, anchorId, price, essence, ...stockFields(restocked) } },
  ]);
}
