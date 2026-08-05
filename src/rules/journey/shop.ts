// Pure shop / merchant / modifier reducer cases.
//
// This module owns the journey events that spend at a shop, resolve a Dream
// Merchant offer, and stack the battle / dreamscape / shop modifiers and atlas
// edits that Augury rewards and debug tools push. Each exported case
// relocates the DOMAIN MATH of a legacy journey mutation
// (`src/state/multiplayer-journey-context.tsx`) into a pure function of
// `(journey, payload[, ctx])`. The legacy transaction / normalization / actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here.
//
// The src/rules/ lint rails forbid Firebase, React, and any live clock/rng:
// randomness arrives via `ctx.rng`, minted ids via `ctx.seq`, and time via
// `ctx.timestamp`. Sites are keyed by id, cards by cardNumber/entry-id — never
// by name.
//
// Two cases are content-coupled and are split across the {@link
// SiteContentProvider} seam (defined in `./sites`): `REROLL_SHOP` redraws its
// inventory from the async-loaded card / Dreamsign catalogues, and the merchant
// events resolve an encounter generated from async-loaded journey content. The
// pure reducer owns the money math (free-reroll-vs-essence ordering, the
// essence charge) and delegates only the content generation; until a provider
// is registered those cases bounce (a recorded no-op, never a throw).

import type { EventContext } from "../../eventlog/types";
import { isNightmareCardId } from "../../data/nightmare";
import { getDeckContentProvider } from "./deck";
import { rerollCost } from "../../shop/shop-pricing";
import type {
  BattleModifier,
  DeckEntry,
  DreamscapeModifier,
  DreamAtlas,
  JourneyState,
  RuntimeShopSlot,
  ShopSiteRuntime,
  SiteState,
  SiteType,
} from "../../types/journey";
import { mintEntryId } from "./deck";
import { findSite, getSiteContentProvider } from "./sites";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SITE_TYPES: ReadonlySet<SiteType> = new Set<SiteType>([
  "Battle",
  "Draft",
  "Shop",
  "Purge",
  "Essence",
  "Transfiguration",
  "Duplication",
  "Reward",
  "Augury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "TemptingOffer",
  "Gamble",
  "Exploration",
]);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asSiteType(value: unknown): SiteType | null {
  return typeof value === "string" && SITE_TYPES.has(value as SiteType)
    ? (value as SiteType)
    : null;
}

function clampEssence(value: number): number {
  return Math.max(0, value);
}

/**
 * The essence a shop slot costs after discount (the documented {@link
 * ShopModifiers} contract): the slot's own `discountPercent` and the permanent
 * `essenceDiscountPercent` add, clamp to 100, and scale the base price with a
 * rounded `basePrice * (1 - pct/100)`. A zero total discount pays the base
 * price exactly.
 */
function discountedSlotPrice(
  slot: RuntimeShopSlot,
  essenceDiscountPercent: number,
): number {
  const totalPercent = Math.min(
    100,
    Math.max(0, slot.discountPercent) + Math.max(0, essenceDiscountPercent),
  );
  return totalPercent === 0
    ? slot.basePrice
    : Math.round(slot.basePrice * (1 - totalPercent / 100));
}

/** Store `runtime` for `siteId`, replacing any existing entry for that key. */
function withShopRuntime(
  journey: JourneyState,
  siteId: string,
  runtime: ShopSiteRuntime,
): JourneyState {
  return {
    ...journey,
    siteRuntime: { ...journey.siteRuntime, [siteId]: runtime },
  };
}

/** The lowest unused `site-N` id anywhere in the atlas (legacy `nextSiteIdFromAtlas`). */
function nextSiteId(atlas: DreamAtlas): string {
  let max = 0;
  for (const node of Object.values(atlas.nodes)) {
    for (const site of node.sites) {
      const match = /^site-(\d+)$/.exec(site.id);
      if (match === null) continue;
      const num = Number.parseInt(match[1], 10);
      if (Number.isFinite(num) && num > max) max = num;
    }
  }
  return `site-${String(max + 1)}`;
}

// ---------------------------------------------------------------------------
// BUY_SHOP_SLOT
// ---------------------------------------------------------------------------

/**
 * `BUY_SHOP_SLOT { siteId, slotIndex, purgeIndex? }` — legacy `buyShopSlot`.
 * Charges the DISCOUNTED essence price (slot + shop discount, per the {@link
 * ShopModifiers} contract), grants the item (a card appended to the deck via a
 * seq-deterministic entry id, or a Dreamsign appended / replacing the
 * `purgeIndex` slot), and marks the slot purchased.
 *
 * Bounces on a malformed payload, an unknown / already-visited site, a non-shop
 * runtime, an out-of-range slot, an already-purchased slot (the coop
 * double-buy race), a discounted price above current essence (the
 * insufficient-essence guard, essence unchanged), or a Dreamsign purchase at the
 * `maxDreamsigns` limit with no valid purge slot.
 */
export function buyShopSlot(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const slotIndex = integer(payload.slotIndex);
  if (siteId === null || slotIndex === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;

  const runtime = journey.siteRuntime[siteId];
  if (runtime === undefined || runtime.kind !== "shop") return null;
  const slot = runtime.slots[slotIndex];
  if (slot === undefined || slot.purchased) return null;

  const price = discountedSlotPrice(
    slot,
    journey.shopModifiers.essenceDiscountPercent,
  );
  if (price > journey.essence) return null;

  const purgeIndex =
    payload.purgeIndex === undefined ? undefined : integer(payload.purgeIndex);
  if (payload.purgeIndex !== undefined && purgeIndex === null) return null;

  let next: JourneyState = {
    ...journey,
    essence: clampEssence(journey.essence - price),
  };

  if (slot.itemType === "card") {
    const entry: DeckEntry = {
      entryId: mintEntryId(journey.deck, ctx.seq, 0),
      cardNumber: slot.cardNumber,
      transfiguration: slot.transfiguration ?? null,
      isBane: false,
    };
    next = { ...next, deck: [...next.deck, entry] };
  } else {
    const purgedDreamsign =
      purgeIndex === undefined || purgeIndex === null
        ? null
        : journey.dreamsigns[purgeIndex];
    if (
      (purgeIndex !== undefined && purgeIndex !== null && purgedDreamsign == null) ||
      (purgeIndex === undefined && journey.dreamsigns.length >= journey.maxDreamsigns)
    ) {
      return null;
    }
    next = {
      ...next,
      dreamsigns:
        purgeIndex === undefined || purgeIndex === null
          ? [...next.dreamsigns, slot.dreamsign]
          : next.dreamsigns.map((existing, index) =>
              index === purgeIndex ? slot.dreamsign : existing,
            ),
    };
  }

  const nextRuntime: ShopSiteRuntime = {
    ...runtime,
    slots: runtime.slots.map((candidate, index) =>
      index === slotIndex ? { ...candidate, purchased: true } : candidate,
    ),
  };
  return withShopRuntime(next, siteId, nextRuntime);
}

// ---------------------------------------------------------------------------
// REROLL_SHOP
// ---------------------------------------------------------------------------

/**
 * `REROLL_SHOP { siteId }` — restock a
 * shop's slots once. The pure reducer owns the money math: it consumes a free
 * reroll (`shopModifiers.freeRerolls`) BEFORE charging essence, so a player
 * with a free reroll pays nothing and keeps their essence; only when no free
 * reroll remains does the paid path charge the canonical price derived from the
 * folded site and runtime. The content redraw —
 * the new slots, Dreamsign pools, and draft state — is delegated to the
 * registered {@link SiteContentProvider}'s `rerollShop`, handed `ctx.rng`.
 *
 * Bounces on a malformed payload, an unknown / already-visited site, a non-shop
 * runtime, an already-rerolled shop (`rerollCount > 0`), a paid reroll the
 * player cannot afford (essence unchanged), or when no provider is registered
 * (or its `rerollShop` returns null / is absent).
 */
export function rerollShop(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;

  const runtime = journey.siteRuntime[siteId];
  if (runtime === undefined || runtime.kind !== "shop") return null;
  if (runtime.rerollCount > 0) return null;

  const site = findSite(journey, siteId);
  if (site === null) return null;

  const useFreeReroll = journey.shopModifiers.freeRerolls > 0;
  const cost = useFreeReroll
    ? 0
    : rerollCost(runtime.rerollCount, site.isEnhanced);
  if (!useFreeReroll && cost > journey.essence) return null;

  const provider = getSiteContentProvider();
  const generated = provider?.rerollShop?.({ journey, site, rng: ctx.rng });
  if (generated === undefined || generated === null) return null;

  const shopModifiers = useFreeReroll
    ? {
        ...journey.shopModifiers,
        freeRerolls: journey.shopModifiers.freeRerolls - 1,
      }
    : journey.shopModifiers;
  const essence = useFreeReroll
    ? journey.essence
    : clampEssence(journey.essence - cost);

  const nextRuntime: ShopSiteRuntime = {
    ...runtime,
    slots: generated.slots,
    rerollCount: runtime.rerollCount + 1,
    remainingDreamsignPoolIds: generated.remainingDreamsignPoolIds,
  };
  return {
    ...journey,
    essence,
    shopModifiers,
    remainingDreamsignPool: generated.remainingDreamsignPool,
    draftState: generated.draftState,
    siteRuntime: { ...journey.siteRuntime, [siteId]: nextRuntime },
  };
}

// ---------------------------------------------------------------------------
// GRANT_FREE_REROLLS / APPLY_SHOP_DISCOUNT
// ---------------------------------------------------------------------------

/**
 * `GRANT_FREE_REROLLS { count }` — legacy `grantFreeShopRerolls`. Adds `count`
 * free rerolls to the additive pool consumed by `REROLL_SHOP`. Bounces on a
 * malformed or non-positive count.
 */
export function grantFreeRerolls(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const count = finiteNumber(payload.count);
  if (count === null || count <= 0) return null;
  return {
    ...journey,
    shopModifiers: {
      ...journey.shopModifiers,
      freeRerolls: journey.shopModifiers.freeRerolls + count,
    },
  };
}

/**
 * `APPLY_SHOP_DISCOUNT { percent }` — legacy `applyShopEssenceDiscount`. Adds
 * `percent` to the permanent additive essence discount every shop slot applies.
 * Bounces on a malformed or non-positive percent.
 */
export function applyShopDiscount(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const percent = finiteNumber(payload.percent);
  if (percent === null || percent <= 0) return null;
  return {
    ...journey,
    shopModifiers: {
      ...journey.shopModifiers,
      essenceDiscountPercent:
        journey.shopModifiers.essenceDiscountPercent + percent,
    },
  };
}

// ---------------------------------------------------------------------------
// Merchant offers (provider-seam delegated)
// ---------------------------------------------------------------------------

/**
 * `ACCEPT_MERCHANT_OFFER { siteId, ...request }` — legacy
 * `acceptDreamMerchantOffer`. The whole resolution (offer lookup, essence /
 * deck / dreamsign payload application, site completion) is content-coupled and
 * lives behind the {@link SiteContentProvider}'s `resolveMerchant`, so this
 * case only resolves the site and delegates. Bounces on a missing site, no
 * provider (or absent `resolveMerchant`), or a provider that rejects the
 * request (stale encounter, unknown offer, unaffordable, already visited).
 */
export function acceptMerchantOffer(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  return resolveMerchant(journey, payload, ctx, "accept");
}

/**
 * `DECLINE_MERCHANT { siteId, ...request }` — legacy `declineDreamMerchant`.
 * Delegates to the {@link SiteContentProvider}'s `resolveMerchant` with a
 * `decline` action; the provider validates the encounter and completes the
 * site. Bounces on the same conditions as `ACCEPT_MERCHANT_OFFER`.
 */
export function declineMerchant(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  return resolveMerchant(journey, payload, ctx, "decline");
}

function resolveMerchant(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  action: "accept" | "decline",
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  const site = findSite(journey, siteId);
  if (site === null) return null;
  const provider = getSiteContentProvider();
  const result = provider?.resolveMerchant?.({
    journey,
    site,
    action,
    payload,
    rng: ctx.rng,
    seq: ctx.seq,
  });
  return result ?? null;
}

// ---------------------------------------------------------------------------
// Battle modifiers
// ---------------------------------------------------------------------------

/**
 * `PUSH_BATTLE_MODIFIER { modifier }` — legacy `pushBattleRewardModifier`.
 * Appends a fully-formed reward-reduction modifier to `battleModifiers`.
 * Bounces on a malformed modifier. (The temporary-Nightmare modifier has its
 * own event because it also mints deck entries.)
 */
export function pushBattleModifier(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const modifier = asRewardReductionModifier(payload.modifier);
  if (modifier === null) return null;
  return { ...journey, battleModifiers: [...journey.battleModifiers, modifier] };
}

function asRewardReductionModifier(value: unknown): BattleModifier | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const battlesRemaining = finiteNumber(record.battlesRemaining);
  const source = asString(record.source);
  if (battlesRemaining === null || source === null) return null;
  if (record.kind === "reward_reduction_flat") {
    const amount = finiteNumber(record.amount);
    if (amount === null) return null;
    return { kind: "reward_reduction_flat", amount, battlesRemaining, source };
  }
  if (record.kind === "reward_reduction_percent") {
    const percent = finiteNumber(record.percent);
    if (percent === null) return null;
    return {
      kind: "reward_reduction_percent",
      percent,
      battlesRemaining,
      source,
    };
  }
  return null;
}

/**
 * `PUSH_TEMPORARY_NIGHTMARE_GRANT` mints `count` Nightmare entries and records
 * their ids so they leave the deck after the configured number of battles.
 * The UUID check keeps the event contract pinned to the sole Bane card.
 */
export function pushTemporaryNightmareGrant(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const cardId = asString(payload.cardId);
  const count = integer(payload.count);
  const battlesRemaining = integer(payload.battlesRemaining);
  const source = asString(payload.source);
  if (
    cardId === null ||
    !isNightmareCardId(cardId) ||
    count === null ||
    count <= 0 ||
    battlesRemaining === null ||
    source === null
  ) {
    return null;
  }
  const cardNumber = getDeckContentProvider()?.resolveCardNumber(cardId) ?? null;
  if (cardNumber === null) return null;

  let deck = journey.deck;
  const addedEntryIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const entry: DeckEntry = {
      entryId: mintEntryId(deck, ctx.seq, i),
      cardNumber,
      transfiguration: null,
      isBane: true,
    };
    addedEntryIds.push(entry.entryId);
    deck = [...deck, entry];
  }
  const modifier: BattleModifier = {
    kind: "temporary_nightmare_grant",
    count,
    battlesRemaining,
    addedEntryIds,
    source,
  };
  return {
    ...journey,
    deck,
    battleModifiers: [...journey.battleModifiers, modifier],
  };
}

// ---------------------------------------------------------------------------
// Dreamscape modifiers
// ---------------------------------------------------------------------------

/**
 * `BAN_SITE_TYPE { siteType, dreamscapesRemaining, source? }` — legacy
 * `removeSiteTypeFromNextDreamscapes`. Pushes a `remove_shop_sites` dreamscape
 * modifier so upcoming dreamscapes drop shop sites for `dreamscapesRemaining`
 * dreamscapes. Only `Shop` is representable as a ban today, so any other site
 * type bounces. Also bounces on a malformed or non-positive `dreamscapesRemaining`.
 */
export function banSiteType(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteType = asSiteType(payload.siteType);
  const dreamscapesRemaining = integer(payload.dreamscapesRemaining);
  if (
    siteType !== "Shop" ||
    dreamscapesRemaining === null ||
    dreamscapesRemaining <= 0
  ) {
    return null;
  }
  const modifier: DreamscapeModifier = {
    kind: "remove_shop_sites",
    dreamscapesRemaining,
    source: asString(payload.source) ?? "ban_site_type",
  };
  return {
    ...journey,
    dreamscapeModifiers: [...journey.dreamscapeModifiers, modifier],
  };
}

/**
 * `BOOST_SITE_APPEARANCE { siteType, percent, dreamscapesRemaining, source? }` —
 * legacy `boostSiteAppearance`. Pushes a `boost_site_appearance` dreamscape
 * modifier that biases `siteType` to appear more often for
 * `dreamscapesRemaining` dreamscapes. Bounces on a malformed site type,
 * percent, or a non-positive `dreamscapesRemaining`.
 */
export function boostSiteAppearance(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteType = asSiteType(payload.siteType);
  const percent = finiteNumber(payload.percent);
  const dreamscapesRemaining = integer(payload.dreamscapesRemaining);
  if (
    siteType === null ||
    percent === null ||
    dreamscapesRemaining === null ||
    dreamscapesRemaining <= 0
  ) {
    return null;
  }
  const modifier: DreamscapeModifier = {
    kind: "boost_site_appearance",
    siteType,
    percent,
    dreamscapesRemaining,
    source: asString(payload.source) ?? "boost_site_appearance",
  };
  return {
    ...journey,
    dreamscapeModifiers: [...journey.dreamscapeModifiers, modifier],
  };
}

// ---------------------------------------------------------------------------
// Atlas edits
// ---------------------------------------------------------------------------

/**
 * `REPLACE_SITE_TYPE { nodeId, fromSiteType, toSiteType }` — legacy
 * `replaceSiteType`. Replaces the first UNVISITED site of `fromSiteType` in
 * `nodeId` with a fresh, unvisited site of `toSiteType` (a new `site-N` id).
 * Bounces on a malformed payload, an unknown node, or when the node holds no
 * unvisited site of the source type.
 */
export function replaceSiteType(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const nodeId = asString(payload.nodeId);
  const fromSiteType = asSiteType(payload.fromSiteType);
  const toSiteType = asSiteType(payload.toSiteType);
  if (nodeId === null || fromSiteType === null || toSiteType === null) {
    return null;
  }
  const node = journey.atlas.nodes[nodeId];
  if (node === undefined) return null;
  const targetIndex = node.sites.findIndex(
    (site) => site.type === fromSiteType && !site.isVisited,
  );
  if (targetIndex === -1) return null;
  if (node.sites[targetIndex].id === journey.activeSiteId) return null;

  const replacement: SiteState = {
    id: nextSiteId(journey.atlas),
    type: toSiteType,
    isEnhanced: false,
    isVisited: false,
  };
  const sites = node.sites.map((site, index) =>
    index === targetIndex ? replacement : site,
  );
  return {
    ...journey,
    atlas: {
      ...journey.atlas,
      nodes: { ...journey.atlas.nodes, [nodeId]: { ...node, sites } },
    },
  };
}

/**
 * `ADD_SITE_TO_DREAMSCAPE { nodeId, siteType }` — legacy `addSiteToDreamscape`.
 * Appends a fresh, unvisited site of `siteType` (a new `site-N` id) to `nodeId`.
 * Bounces on a malformed payload or an unknown node.
 */
export function addSiteToDreamscape(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const nodeId = asString(payload.nodeId);
  const siteType = asSiteType(payload.siteType);
  if (nodeId === null || siteType === null) return null;
  const node = journey.atlas.nodes[nodeId];
  if (node === undefined) return null;

  const site: SiteState = {
    id: nextSiteId(journey.atlas),
    type: siteType,
    isEnhanced: false,
    isVisited: false,
  };
  return {
    ...journey,
    atlas: {
      ...journey.atlas,
      nodes: {
        ...journey.atlas.nodes,
        [nodeId]: { ...node, sites: [...node.sites, site] },
      },
    },
  };
}

/**
 * `SET_CARD_SOURCE_DEBUG { state }` (debug) — legacy `setCardSourceDebug`. Sets
 * (or clears, with `null`) the card-source provenance overlay state. Bounces on
 * a value that is neither `null` nor an object.
 */
export function setCardSourceDebug(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const state = payload.state;
  if (state === null) return { ...journey, cardSourceDebug: null };
  if (typeof state !== "object" || Array.isArray(state)) return null;
  return {
    ...journey,
    cardSourceDebug: state as JourneyState["cardSourceDebug"],
  };
}
