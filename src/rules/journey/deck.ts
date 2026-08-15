// Pure deck, transfiguration, and dreamsign reducer cases.
//
// Each exported case relocates the DOMAIN MATH of a legacy journey mutation
// (`src/state/multiplayer-journey-context.tsx`) into a pure function of
// `(journey, payload[, ctx])`. The legacy transaction / normalization / actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here. These functions read
// nothing but their arguments — no Firebase, no React, no live clock/rng (the
// src/rules/ lint rails): randomness arrives via `ctx.rng` and any minted id via
// `ctx.seq`.
//
// Cards and dreamsigns are keyed by UUID/entry-id only — never by name.

import type { EventContext } from "../../eventlog/types";
import { isNightmareCardId, NIGHTMARE_CARD_ID } from "../../data/nightmare";
import type { CardType } from "../../types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  Dreamsign,
  JourneyState,
  TransfigurationType,
} from "../../types/journey";
import type { CardId } from "../../types/card-identity";
import type { DreamsignId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import {
  cardIdFromUnknown,
  cardSubtypeFromUnknown,
} from "../../types/card-identity";
import { deckEntryIdFromUnknown } from "../../types/identifiers";
import { dreamsignIdFromUnknown } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";

// ---------------------------------------------------------------------------
// Content-provider seam (ADD_CARD / ADD_DREAMSIGN)
// ---------------------------------------------------------------------------

/**
 * The deterministic content the two "add by id" cases need but cannot compute
 * inside a pure reducer: `ADD_CARD` carries a card UUID (not the `cardNumber`
 * the deck stores), and `ADD_DREAMSIGN` carries a dreamsign UUID (not the full
 * `Dreamsign` record). Both resolutions read the TOML-sourced card / dreamsign
 * catalogues that only load asynchronously, while the reducer must fold
 * synchronously from `(state, event, ctx)` alone.
 *
 * The impure side (app/coop bootstrap, which has already loaded the content)
 * registers a provider whose functions are PURE lookups by UUID, so two clients
 * folding the same log resolve byte-identical results. Resolution never depends
 * on the event's seq: the same UUID always resolves to the same card / dreamsign.
 *
 * SEAM: real content registration is deferred to the integration task that
 * wires the reducer into src/coop/. Until a provider is registered, `ADD_CARD`
 * and `ADD_DREAMSIGN` bounce (a recorded no-op, never a throw).
 */
export interface DeckContentProvider {
  /** Resolve a card UUID to its `cardNumber`, or `null` when unknown. */
  resolveCardNumber(cardId: CardId): number | null;
  /** Resolve a dreamsign UUID to its full record, or `null` when unknown. */
  resolveDreamsign(dreamsignId: DreamsignId): Dreamsign | null;
}

let contentProvider: DeckContentProvider | null = null;

/**
 * Register (or clear, with `null`) the deterministic content provider the
 * "add by id" cases delegate to. Idempotent; the last registration wins.
 */
export function registerDeckContentProvider(
  provider: DeckContentProvider | null,
): void {
  contentProvider = provider;
}

/** The currently registered provider, or `null` when none is wired. */
export function getDeckContentProvider(): DeckContentProvider | null {
  return contentProvider;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const TRANSFIGURATION_TYPES: ReadonlySet<TransfigurationType> =
  new Set<TransfigurationType>([
    "Empowered",
    "Amplified",
    "Kindled",
    "Inspired",
    "Enduring",
    "Hastened",
    "Resonant",
    "Attuned",
    "Perfected",
  ]);

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTransfiguration(value: unknown): TransfigurationType | null {
  return typeof value === "string" &&
    TRANSFIGURATION_TYPES.has(value as TransfigurationType)
    ? (value as TransfigurationType)
    : null;
}

function findEntry(
  journey: JourneyState,
  entryId: DeckEntryId,
): DeckEntry | undefined {
  return journey.deck.find((entry) => entry.entryId === entryId);
}

/**
 * Mint a fresh deck-entry id that is deterministic in `(seq, index)` and
 * guaranteed unique within `deck`. Two clients folding the same event at the
 * same seq derive the same id (replaying `Math.random`/`crypto.randomUUID` would
 * diverge — that is the legacy determinism bug this fixes). `index`
 * distinguishes multiple entries minted by one event so they never collide.
 *
 * THE single entry-id minting scheme: every case that mints a deck entry —
 * `ADD_CARD`/`ADD_DREAMSIGN`-adjacent cases here, `BUY_SHOP_SLOT`/augury
 * resolution in shop.ts, `PURGE_...`-adjacent grants in sites.ts, and
 * `PICK_DRAFT_CARD` in draft.ts — mints through this function with its own
 * event's `seq`, so no second, independently-evolving id scheme exists in
 * the reducer (audit finding P3-8). Takes the seq directly (not a whole
 * `EventContext`) so a caller that only has a seq in hand (e.g. a
 * content-provider seam threading it through from `ctx.seq`) needs no
 * `EventContext` of its own to call it.
 */
export function mintEntryId(
  deck: readonly DeckEntry[],
  seq: number,
  index: number,
): DeckEntryId {
  const existing = new Set(deck.map((entry) => entry.entryId));
  let suffix = index;
  let candidate = `deck-${String(seq)}-${String(suffix)}`;
  while (existing.has(parseDeckEntryId(candidate))) {
    suffix += 1;
    candidate = `deck-${String(seq)}-${String(suffix)}`;
  }
  return parseDeckEntryId(candidate);
}

// ---------------------------------------------------------------------------
// Add / remove / duplicate
// ---------------------------------------------------------------------------

/**
 * `ADD_CARD { cardId, transfiguration?, source? }` adds one catalog card. The
 * card UUID resolves
 * to its `cardNumber` through the registered {@link DeckContentProvider}
 * (mirroring legacy `resolveCardById`). Nightmare is the sole Bane, so its
 * UUID sets the persisted Bane flag automatically; callers cannot mark another
 * card as a Bane. `transfiguration` stamps a badge. Bounces with no
 * provider, an unknown card id, or a malformed `transfiguration`. The minted
 * entry id is deterministic in `ctx.seq` (legacy `addCardById` used
 * `crypto.randomUUID`).
 */
export function addCard(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const cardId = cardIdFromUnknown(payload.cardId);
  if (cardId === null) return null;
  if (
    payload.isBane !== undefined &&
    payload.isBane !== true &&
    payload.isBane !== false
  ) {
    return null;
  }
  const resolvedCardId = payload.isBane === true ? NIGHTMARE_CARD_ID : cardId;
  const provider = contentProvider;
  if (provider === null) return null;
  const cardNumber = provider.resolveCardNumber(resolvedCardId);
  if (cardNumber === null) return null;

  // `transfiguration` is optional; present-but-invalid is a malformed payload.
  let transfiguration: TransfigurationType | null = null;
  if (
    payload.transfiguration !== undefined &&
    payload.transfiguration !== null
  ) {
    transfiguration = asTransfiguration(payload.transfiguration);
    if (transfiguration === null) return null;
  }

  const entry: DeckEntry = {
    entryId: mintEntryId(journey.deck, ctx.seq, 0),
    cardNumber,
    transfiguration,
    isBane: isNightmareCardId(resolvedCardId),
  };
  return { ...journey, deck: [...journey.deck, entry] };
}

/** `REMOVE_DECK_ENTRY { entryId }` — legacy `removeDeckEntry`. Stale target bounces. */
export function removeDeckEntry(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null) return null;
  if (findEntry(journey, entryId) === undefined) return null;
  return {
    ...journey,
    deck: journey.deck.filter((entry) => entry.entryId !== entryId),
  };
}

/**
 * `DUPLICATE_DECK_ENTRY { entryId }` — legacy `duplicateDeckEntry`. Appends a
 * copy carrying the source entry's card, transfiguration, and persistent
 * modifications, with a fresh id minted deterministically from `ctx.seq`
 * (legacy used the deck-counter scheme; the collision bug is fixed here by
 * `mintEntryId`'s within-deck uniqueness guard). Stale target bounces.
 */
export function duplicateDeckEntry(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null) return null;
  const entry = findEntry(journey, entryId);
  if (entry === undefined) return null;
  const copy: DeckEntry = {
    entryId: mintEntryId(journey.deck, ctx.seq, 0),
    cardNumber: entry.cardNumber,
    transfiguration: entry.transfiguration,
    ...(entry.typeChange == null ? {} : { typeChange: entry.typeChange }),
    ...(entry.keywordModification == null
      ? {}
      : { keywordModification: entry.keywordModification }),
    ...(entry.sparkBonus === undefined ? {} : { sparkBonus: entry.sparkBonus }),
    isBane: entry.isBane,
  };
  return { ...journey, deck: [...journey.deck, copy] };
}

// ---------------------------------------------------------------------------
// Per-entry modifications
// ---------------------------------------------------------------------------

/** Replace one deck entry (matched by id) with `next`, keeping order. */
function replaceEntry(
  journey: JourneyState,
  entryId: DeckEntryId,
  next: (entry: DeckEntry) => DeckEntry,
): JourneyState {
  return {
    ...journey,
    deck: journey.deck.map((entry) =>
      entry.entryId === entryId ? next(entry) : entry,
    ),
  };
}

function parseStatOverride(
  value: unknown,
): { drop: true } | { drop: false; value: DeckEntry["statOverride"] } | null {
  if (value === null || value === undefined) return { drop: true };
  if (!isPlainRecord(value)) return null;
  const override: { energyCost?: number; spark?: number } = {};
  if ("energyCost" in value) {
    const energyCost = finiteNumber(value.energyCost);
    if (energyCost === null) return null;
    override.energyCost = energyCost;
  }
  if ("spark" in value) {
    const spark = finiteNumber(value.spark);
    if (spark === null) return null;
    override.spark = spark;
  }
  return { drop: false, value: override };
}

function parseKeywordModification(
  value: unknown,
): { drop: true } | { drop: false; value: CardKeywordModification } | null {
  if (value === null || value === undefined) return { drop: true };
  if (!isPlainRecord(value)) return null;
  const keywords: CardKeywordModification = {};
  if ("fast" in value) {
    if (typeof value.fast !== "boolean") return null;
    keywords.fast = value.fast;
  }
  if ("energyCostReduction" in value) {
    const energyCostReduction = finiteNumber(value.energyCostReduction);
    if (energyCostReduction === null || energyCostReduction < 0) return null;
    keywords.energyCostReduction = energyCostReduction;
  }
  if ("reclaim" in value) {
    const reclaim = finiteNumber(value.reclaim);
    if (reclaim === null) return null;
    keywords.reclaim = reclaim;
  }
  if ("setReclaim" in value) {
    const setReclaim = finiteNumber(value.setReclaim);
    if (setReclaim === null) return null;
    keywords.setReclaim = setReclaim;
  }
  return { drop: false, value: keywords };
}

function parseTypeChange(
  value: unknown,
): { drop: true } | { drop: false; value: CardTypeChange } | null {
  if (value === null || value === undefined) return { drop: true };
  if (!isPlainRecord(value)) return null;
  const subtype = cardSubtypeFromUnknown(value.subtype);
  if (
    typeof value.predicateId !== "string" ||
    typeof value.cardType !== "string" ||
    subtype === null ||
    typeof value.label !== "string"
  ) {
    return null;
  }
  return {
    drop: false,
    value: {
      predicateId: parseCardTypeChangePredicateId(value.predicateId),
      cardType: value.cardType as CardType,
      subtype,
      label: value.label,
    },
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * `SET_DECK_ENTRY_STAT_OVERRIDE { entryId, override }` — legacy
 * `setDeckEntryStatOverride` (debug edit). A `null` override drops the key.
 * Stale target or malformed override bounces.
 */
export function setDeckEntryStatOverride(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null || findEntry(journey, entryId) === undefined)
    return null;
  const parsed = parseStatOverride(payload.override);
  if (parsed === null) return null;
  return replaceEntry(journey, entryId, (entry) => {
    if (parsed.drop) {
      const { statOverride: _dropped, ...rest } = entry;
      return rest;
    }
    return { ...entry, statOverride: parsed.value };
  });
}

/**
 * `SET_DECK_ENTRY_KEYWORDS { entryId, keywords }` — legacy
 * `setDeckEntryKeywords` (absolute set; a `null` value drops the key). Stale
 * target or malformed keywords bounces.
 */
export function setDeckEntryKeywords(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null || findEntry(journey, entryId) === undefined)
    return null;
  const parsed = parseKeywordModification(payload.keywords);
  if (parsed === null) return null;
  return replaceEntry(journey, entryId, (entry) => {
    if (parsed.drop) {
      const { keywordModification: _dropped, ...rest } = entry;
      return rest;
    }
    return { ...entry, keywordModification: parsed.value };
  });
}

/**
 * `SET_DECK_ENTRY_TYPE { entryId, typeChange }` — consolidates
 * `setDeckEntryTypeChange` / `changeDeckEntryType`. A `null` typeChange drops
 * the key. Stale target or malformed typeChange bounces.
 */
export function setDeckEntryType(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null || findEntry(journey, entryId) === undefined)
    return null;
  const parsed = parseTypeChange(payload.typeChange);
  if (parsed === null) return null;
  return replaceEntry(journey, entryId, (entry) => {
    if (parsed.drop) {
      const { typeChange: _dropped, ...rest } = entry;
      return rest;
    }
    return { ...entry, typeChange: parsed.value };
  });
}

/**
 * `TRANSFIGURE_CARD { entryId, transfiguration }` — legacy `transfigureCard`
 * (the badge-stamp half; the action-log summary is dropped). `transfiguration`
 * may be a valid {@link TransfigurationType} or `null` to clear. Stale target or
 * malformed transfiguration bounces.
 */
export function transfigureCard(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null || findEntry(journey, entryId) === undefined)
    return null;
  let transfiguration: TransfigurationType | null = null;
  if (
    payload.transfiguration !== null &&
    payload.transfiguration !== undefined
  ) {
    transfiguration = asTransfiguration(payload.transfiguration);
    if (transfiguration === null) return null;
  }
  return replaceEntry(journey, entryId, (entry) => ({
    ...entry,
    transfiguration,
  }));
}

// ---------------------------------------------------------------------------
// Nightmare purges
// ---------------------------------------------------------------------------

/** `PURGE_ALL_NIGHTMARE_CARDS { }` removes every Nightmare. */
export function purgeAllNightmareCards(
  journey: JourneyState,
): JourneyState | null {
  if (!journey.deck.some((entry) => entry.isBane)) return null;
  return { ...journey, deck: journey.deck.filter((entry) => !entry.isBane) };
}

/**
 * `PURGE_RANDOM_NIGHTMARE_CARDS { count }` selects up to `count` Nightmare
 * entries via a partial Fisher–Yates over deterministic entry-id order, so the
 * same seed and sequence remove the same entries.
 */
export function purgeRandomNightmareCards(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const count = finiteNumber(payload.count);
  if (count === null || count <= 0) return null;
  const nightmareEntryIds = journey.deck
    .filter((entry) => entry.isBane)
    .map((entry) => entry.entryId);
  if (nightmareEntryIds.length === 0) return null;

  const target = Math.min(Math.floor(count), nightmareEntryIds.length);
  const shuffled = [...nightmareEntryIds];
  for (let i = 0; i < target; i += 1) {
    const j = i + Math.floor(ctx.rng(i) * (shuffled.length - i));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  const selected = new Set(shuffled.slice(0, target));
  return {
    ...journey,
    deck: journey.deck.filter(
      (entry) => !(entry.isBane && selected.has(entry.entryId)),
    ),
  };
}

// ---------------------------------------------------------------------------
// Dreamsigns
// ---------------------------------------------------------------------------

/**
 * `ADD_DREAMSIGN { dreamsignId, purgeIndex? }` — legacy `addDreamsign`. The
 * dreamsign UUID resolves to its record through the registered
 * {@link DeckContentProvider}.
 *
 * Two paths mirror the legacy mutation:
 *   - Append (no `purgeIndex`): adds the dreamsign; bounces at the
 *     `maxDreamsigns` limit.
 *   - Replace-at-slot (`purgeIndex`): overwrites the held dreamsign at that
 *     index (the negative-Dreamsign purge flow, which swaps a negative sign for the new
 *     sign), so the `maxDreamsigns` limit does not apply. Bounces when the slot
 *     holds no dreamsign.
 *
 * Bounces with no provider, an unknown id, or a malformed `purgeIndex`.
 */
export function addDreamsign(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const dreamsignId = dreamsignIdFromUnknown(payload.dreamsignId);
  if (dreamsignId === null) return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const dreamsign = provider.resolveDreamsign(dreamsignId);
  if (dreamsign === null) return null;

  if (payload.purgeIndex === undefined) {
    if (journey.dreamsigns.length >= journey.maxDreamsigns) return null;
    return { ...journey, dreamsigns: [...journey.dreamsigns, dreamsign] };
  }
  const purgeIndex = finiteNumber(payload.purgeIndex);
  if (purgeIndex === null || journey.dreamsigns[purgeIndex] === undefined) {
    return null;
  }
  return {
    ...journey,
    dreamsigns: journey.dreamsigns.map((existing, index) =>
      index === purgeIndex ? dreamsign : existing,
    ),
  };
}

/**
 * `REMOVE_DREAMSIGN { dreamsignId }` — legacy `removeDreamsign`, keyed by UUID
 * instead of index. Removes the first dreamsign whose id matches. Bounces when
 * no held dreamsign carries that id.
 */
export function removeDreamsign(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const dreamsignId = dreamsignIdFromUnknown(payload.dreamsignId);
  if (dreamsignId === null) return null;
  const index = journey.dreamsigns.findIndex((d) => d.id === dreamsignId);
  if (index === -1) return null;
  return {
    ...journey,
    dreamsigns: journey.dreamsigns.filter((_, i) => i !== index),
  };
}

/** `SET_DREAMSIGN_POOL { ids }` — legacy `setRemainingDreamsignPool`. */
export function setDreamsignPool(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const raw = payload.ids;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) {
    return null;
  }
  return {
    ...journey,
    remainingDreamsignPool: raw
      .map((id) => dreamsignIdFromUnknown(id))
      .filter((id): id is NonNullable<typeof id> => id !== null),
  };
}
