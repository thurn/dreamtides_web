// Pure deck, transfiguration, and dreamsign reducer cases.
//
// Each exported case relocates the DOMAIN MATH of a legacy quest mutation
// (`src/state/multiplayer-quest-context.tsx`) into a pure function of
// `(quest, payload[, ctx])`. The legacy transaction / normalization / actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here. These functions read
// nothing but their arguments — no Firebase, no React, no live clock/rng (the
// src/rules/ lint rails): randomness arrives via `ctx.rng` and any minted id via
// `ctx.seq`.
//
// Cards and dreamsigns are keyed by UUID/entry-id only — never by name.

import type { EventContext } from "../../eventlog/types";
import type { CardType } from "../../types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  Dreamsign,
  QuestState,
  TransfigurationType,
} from "../../types/quest";

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
  resolveCardNumber(cardId: string): number | null;
  /** Resolve a dreamsign UUID to its full record, or `null` when unknown. */
  resolveDreamsign(dreamsignId: string): Dreamsign | null;
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

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

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
  quest: QuestState,
  entryId: string,
): DeckEntry | undefined {
  return quest.deck.find((entry) => entry.entryId === entryId);
}

/**
 * Mint a fresh deck-entry id that is deterministic in `(ctx.seq, index)` and
 * guaranteed unique within `deck`. Two clients folding the same event at the
 * same seq derive the same id (replaying `Math.random`/`crypto.randomUUID` would
 * diverge — that is the legacy determinism bug this fixes). `index`
 * distinguishes multiple entries minted by one event so they never collide.
 */
export function mintEntryId(
  deck: readonly DeckEntry[],
  ctx: EventContext,
  index: number,
): string {
  const existing = new Set(deck.map((entry) => entry.entryId));
  let suffix = index;
  let candidate = `deck-${String(ctx.seq)}-${String(suffix)}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `deck-${String(ctx.seq)}-${String(suffix)}`;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Add / remove / duplicate
// ---------------------------------------------------------------------------

/**
 * `ADD_CARD { cardId, transfiguration?, isBane?, source? }` — consolidates the
 * four legacy add-card mutations (`addCard` / `addCardById` /
 * `addCardByIdWithTransfiguration` / `addBaneCardById`). The card UUID resolves
 * to its `cardNumber` through the registered {@link DeckContentProvider}
 * (mirroring legacy `resolveCardById`); the option fields select the variant:
 * `isBane` sets the bane flag, `transfiguration` stamps a badge. Bounces with no
 * provider, an unknown card id, or a malformed `transfiguration`. The minted
 * entry id is deterministic in `ctx.seq` (legacy `addCardById` used
 * `crypto.randomUUID`).
 */
export function addCard(
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  const cardId = asString(payload.cardId);
  if (cardId === null) return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const cardNumber = provider.resolveCardNumber(cardId);
  if (cardNumber === null) return null;

  // `transfiguration` is optional; present-but-invalid is a malformed payload.
  let transfiguration: TransfigurationType | null = null;
  if (payload.transfiguration !== undefined && payload.transfiguration !== null) {
    transfiguration = asTransfiguration(payload.transfiguration);
    if (transfiguration === null) return null;
  }

  const entry: DeckEntry = {
    entryId: mintEntryId(quest.deck, ctx, 0),
    cardNumber,
    transfiguration,
    isBane: payload.isBane === true,
  };
  return { ...quest, deck: [...quest.deck, entry] };
}

/** `REMOVE_DECK_ENTRY { entryId }` — legacy `removeDeckEntry`. Stale target bounces. */
export function removeDeckEntry(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const entryId = asString(payload.entryId);
  if (entryId === null) return null;
  if (findEntry(quest, entryId) === undefined) return null;
  return {
    ...quest,
    deck: quest.deck.filter((entry) => entry.entryId !== entryId),
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
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  const entryId = asString(payload.entryId);
  if (entryId === null) return null;
  const entry = findEntry(quest, entryId);
  if (entry === undefined) return null;
  const copy: DeckEntry = {
    entryId: mintEntryId(quest.deck, ctx, 0),
    cardNumber: entry.cardNumber,
    transfiguration: entry.transfiguration,
    ...(entry.typeChange == null ? {} : { typeChange: entry.typeChange }),
    ...(entry.keywordModification == null
      ? {}
      : { keywordModification: entry.keywordModification }),
    isBane: entry.isBane,
  };
  return { ...quest, deck: [...quest.deck, copy] };
}

// ---------------------------------------------------------------------------
// Per-entry modifications
// ---------------------------------------------------------------------------

/** Replace one deck entry (matched by id) with `next`, keeping order. */
function replaceEntry(
  quest: QuestState,
  entryId: string,
  next: (entry: DeckEntry) => DeckEntry,
): QuestState {
  return {
    ...quest,
    deck: quest.deck.map((entry) =>
      entry.entryId === entryId ? next(entry) : entry,
    ),
  };
}

function parseStatOverride(
  value: unknown,
): { drop: true } | { drop: false; value: DeckEntry["statOverride"] } | null {
  if (value === null || value === undefined) return { drop: true };
  if (typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const override: { energyCost?: number; spark?: number } = {};
  if ("energyCost" in raw) {
    const energyCost = finiteNumber(raw.energyCost);
    if (energyCost === null) return null;
    override.energyCost = energyCost;
  }
  if ("spark" in raw) {
    const spark = finiteNumber(raw.spark);
    if (spark === null) return null;
    override.spark = spark;
  }
  return { drop: false, value: override };
}

function parseKeywordModification(
  value: unknown,
): { drop: true } | { drop: false; value: CardKeywordModification } | null {
  if (value === null || value === undefined) return { drop: true };
  if (typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const keywords: CardKeywordModification = {};
  if ("fast" in raw) {
    if (typeof raw.fast !== "boolean") return null;
    keywords.fast = raw.fast;
  }
  if ("reclaim" in raw) {
    const reclaim = finiteNumber(raw.reclaim);
    if (reclaim === null) return null;
    keywords.reclaim = reclaim;
  }
  if ("setReclaim" in raw) {
    const setReclaim = finiteNumber(raw.setReclaim);
    if (setReclaim === null) return null;
    keywords.setReclaim = setReclaim;
  }
  return { drop: false, value: keywords };
}

function parseTypeChange(
  value: unknown,
): { drop: true } | { drop: false; value: CardTypeChange } | null {
  if (value === null || value === undefined) return { drop: true };
  if (typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.predicateId !== "string" ||
    typeof raw.cardType !== "string" ||
    typeof raw.subtype !== "string" ||
    typeof raw.label !== "string"
  ) {
    return null;
  }
  return {
    drop: false,
    value: {
      predicateId: raw.predicateId,
      cardType: raw.cardType as CardType,
      subtype: raw.subtype,
      label: raw.label,
    },
  };
}

/**
 * `SET_DECK_ENTRY_STAT_OVERRIDE { entryId, override }` — legacy
 * `setDeckEntryStatOverride` (debug edit). A `null` override drops the key.
 * Stale target or malformed override bounces.
 */
export function setDeckEntryStatOverride(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const entryId = asString(payload.entryId);
  if (entryId === null || findEntry(quest, entryId) === undefined) return null;
  const parsed = parseStatOverride(payload.override);
  if (parsed === null) return null;
  return replaceEntry(quest, entryId, (entry) => {
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
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const entryId = asString(payload.entryId);
  if (entryId === null || findEntry(quest, entryId) === undefined) return null;
  const parsed = parseKeywordModification(payload.keywords);
  if (parsed === null) return null;
  return replaceEntry(quest, entryId, (entry) => {
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
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const entryId = asString(payload.entryId);
  if (entryId === null || findEntry(quest, entryId) === undefined) return null;
  const parsed = parseTypeChange(payload.typeChange);
  if (parsed === null) return null;
  return replaceEntry(quest, entryId, (entry) => {
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
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const entryId = asString(payload.entryId);
  if (entryId === null || findEntry(quest, entryId) === undefined) return null;
  let transfiguration: TransfigurationType | null = null;
  if (payload.transfiguration !== null && payload.transfiguration !== undefined) {
    transfiguration = asTransfiguration(payload.transfiguration);
    if (transfiguration === null) return null;
  }
  return replaceEntry(quest, entryId, (entry) => ({
    ...entry,
    transfiguration,
  }));
}

// ---------------------------------------------------------------------------
// Bane purges
// ---------------------------------------------------------------------------

/** `PURGE_ALL_BANE_CARDS { }` — legacy `purgeAllBaneCards`. Bounces with no banes. */
export function purgeAllBaneCards(quest: QuestState): QuestState | null {
  if (!quest.deck.some((entry) => entry.isBane)) return null;
  return { ...quest, deck: quest.deck.filter((entry) => !entry.isBane) };
}

/**
 * `PURGE_RANDOM_BANE_CARDS { count }` — legacy `purgeRandomBaneCards`. Selects
 * up to `count` bane entries via a partial Fisher–Yates over the (deterministic)
 * bane-entry-id order, drawing from `ctx.rng` at each step (legacy read
 * `Math.random`), so the same seed+seq removes the same entries. Bounces on a
 * non-positive count or when the deck holds no banes.
 */
export function purgeRandomBaneCards(
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  const count = finiteNumber(payload.count);
  if (count === null || count <= 0) return null;
  const baneEntryIds = quest.deck
    .filter((entry) => entry.isBane)
    .map((entry) => entry.entryId);
  if (baneEntryIds.length === 0) return null;

  const target = Math.min(Math.floor(count), baneEntryIds.length);
  const shuffled = [...baneEntryIds];
  for (let i = 0; i < target; i += 1) {
    const j = i + Math.floor(ctx.rng(i) * (shuffled.length - i));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  const selected = new Set(shuffled.slice(0, target));
  return {
    ...quest,
    deck: quest.deck.filter(
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
 *     index (the bane-dreamsign purge flow, which swaps a bane out for the new
 *     sign), so the `maxDreamsigns` limit does not apply. Bounces when the slot
 *     holds no dreamsign.
 *
 * Bounces with no provider, an unknown id, or a malformed `purgeIndex`.
 */
export function addDreamsign(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const dreamsignId = asString(payload.dreamsignId);
  if (dreamsignId === null) return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const dreamsign = provider.resolveDreamsign(dreamsignId);
  if (dreamsign === null) return null;

  if (payload.purgeIndex === undefined) {
    if (quest.dreamsigns.length >= quest.maxDreamsigns) return null;
    return { ...quest, dreamsigns: [...quest.dreamsigns, dreamsign] };
  }
  const purgeIndex = finiteNumber(payload.purgeIndex);
  if (purgeIndex === null || quest.dreamsigns[purgeIndex] === undefined) {
    return null;
  }
  return {
    ...quest,
    dreamsigns: quest.dreamsigns.map((existing, index) =>
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
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const dreamsignId = asString(payload.dreamsignId);
  if (dreamsignId === null) return null;
  const index = quest.dreamsigns.findIndex((d) => d.id === dreamsignId);
  if (index === -1) return null;
  return {
    ...quest,
    dreamsigns: quest.dreamsigns.filter((_, i) => i !== index),
  };
}

/** `SET_DREAMSIGN_POOL { ids }` — legacy `setRemainingDreamsignPool`. */
export function setDreamsignPool(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const raw = payload.ids;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) {
    return null;
  }
  return { ...quest, remainingDreamsignPool: [...raw] };
}

/**
 * `SET_DREAMSIGN_IS_BANE { dreamsignId, isBane }` — legacy `setDreamsignIsBane`
 * (debug edit), keyed by UUID instead of index. Bounces on a missing id or a
 * non-boolean flag.
 */
export function setDreamsignIsBane(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const dreamsignId = asString(payload.dreamsignId);
  if (dreamsignId === null) return null;
  if (typeof payload.isBane !== "boolean") return null;
  const isBane = payload.isBane;
  const index = quest.dreamsigns.findIndex((d) => d.id === dreamsignId);
  if (index === -1) return null;
  return {
    ...quest,
    dreamsigns: quest.dreamsigns.map((d, i) =>
      i === index ? { ...d, isBane } : d,
    ),
  };
}
