// Pure draft reducer cases.
//
// Each exported case relocates the DOMAIN MATH of a legacy quest draft mutation
// (`src/state/multiplayer-quest-context.tsx` / `quest-state-actions.ts`) into a
// pure function of `(quest, payload, ctx)`. The legacy transaction /
// normalization / actionLog wrappers are engine concerns and live elsewhere now
// (the root reducer folds, the eventlog engine persists), so they are dropped
// here. These functions read nothing but their arguments and the registered
// content provider — no Firebase, no React, no live clock/rng (the src/rules/
// lint rails): randomness arrives via `ctx.rng` and any minted id via `ctx.seq`.
//
// Cards are keyed by UUID/cardNumber only — never by name.

import type { EventContext } from "../../eventlog/types";
import type { CardData } from "../../types/cards";
import type { DraftConfig, DraftState } from "../../types/draft";
import type { DeckEntry, QuestState } from "../../types/quest";
import {
  DEFAULT_DRAFT_CONFIG,
  processPlayerPickWithoutLogging,
  type OfferDeps,
} from "../../draft/draft-engine";
import { mintEntryId } from "./deck";

// ---------------------------------------------------------------------------
// Content-provider seam (PICK_DRAFT_CARD)
// ---------------------------------------------------------------------------

/**
 * The deterministic content `PICK_DRAFT_CARD` needs but cannot compute inside a
 * pure reducer: the event carries a card UUID (not the `cardNumber` the draft
 * state works in), and advancing the draft (revealing the next offer) reads the
 * TOML-sourced card catalogue plus, for the deck-fit draft modes, a fit model
 * and the dreamscape's affiliation reweighting. All of that only loads
 * asynchronously, while the reducer must fold synchronously from
 * `(state, event, ctx)` alone.
 *
 * The impure side (app/coop bootstrap, which has already loaded the content)
 * registers a provider whose functions are PURE and DETERMINISTIC in their
 * inputs, so two clients folding the same log resolve byte-identical results.
 * Resolution never depends on the event's seq: the same UUID always resolves to
 * the same card, and the same `(draftState, deck)` always yields the same deps.
 *
 * SEAM: real content registration is deferred to the integration task that
 * wires the reducer into src/coop/. Until a provider is registered,
 * `PICK_DRAFT_CARD` bounces (a recorded no-op, never a throw).
 */
export interface DraftContentProvider {
  /** Resolve a card UUID to its `cardNumber`, or `null` when unknown. */
  resolveCardNumber(cardId: string): number | null;
  /** The card database the draft engine consults (rarity, etc.). */
  cardDatabase(): Map<number, CardData>;
  /**
   * The per-offer deck-fit deps for the NEXT offer, given the draft state and
   * the deck card numbers *including* the just-picked card (the deck-fit modes
   * rank the next pack against the post-pick deck). Pool mode returns
   * `undefined`.
   */
  offerDepsFor(
    draftState: DraftState,
    deckCardNumbers: readonly number[],
  ): OfferDeps | undefined;
  /**
   * The draft config for the active dreamscape (affiliation reweighting), or
   * `undefined` for a neutral dreamscape (the engine default applies).
   */
  draftConfigFor(draftState: DraftState): DraftConfig | undefined;
}

let contentProvider: DraftContentProvider | null = null;

/**
 * Register (or clear, with `null`) the deterministic content provider the draft
 * pick case delegates to. Idempotent; the last registration wins.
 */
export function registerDraftContentProvider(
  provider: DraftContentProvider | null,
): void {
  contentProvider = provider;
}

/** The currently registered provider, or `null` when none is wired. */
export function getDraftContentProvider(): DraftContentProvider | null {
  return contentProvider;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * Adapt the event context's keyed rng `(drawIndex) => number` to the
 * `() => number` stream the draft engine expects. A local counter advances the
 * draw index on each call, so successive draws within one event are independent
 * yet deterministic for `(seed, seq)` — two clients folding the same
 * `PICK_DRAFT_CARD` roll the same next offer.
 */
function rngStream(ctx: EventContext): () => number {
  let drawIndex = 0;
  return () => ctx.rng(drawIndex++);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

/**
 * `PICK_DRAFT_CARD { packIndex, cardId }` — relocates legacy `pickDraftCard` /
 * `pickDraftCardInQuestState`. The card UUID resolves to its `cardNumber`
 * through the registered {@link DraftContentProvider}; the pick is validated
 * against the offered pack, the card is appended to the deck (with a
 * seq-deterministic entry id), and the draft is advanced — revealing the next
 * offer via the engine, which draws from `ctx.rng` so the roll is deterministic
 * per `(seed, seq)`.
 *
 * Bounces (never half-applies) when: the payload is malformed; no provider is
 * wired; the card UUID is unknown; there is no active draft; `packIndex` is out
 * of range; or the card at `packIndex` is not the picked card. The last guard
 * covers both the **pick-not-in-pack** case (a stale/forged card id) and the
 * **double-pick race** (a duplicate click whose pack position has already
 * advanced past the picked card).
 */
export function pickDraftCard(
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  const packIndex = integer(payload.packIndex);
  const cardId = asString(payload.cardId);
  if (packIndex === null || cardId === null) return null;

  const provider = contentProvider;
  if (provider === null) return null;

  const draftState = quest.draftState;
  if (draftState === null || draftState.activeSiteId === null) return null;

  const cardNumber = provider.resolveCardNumber(cardId);
  if (cardNumber === null) return null;

  // Pack-membership guard: the picked card must sit at exactly `packIndex` of
  // the current offer. This both rejects a card that is not in the pack and
  // makes the concurrent double-pick click safe (the second replay sees an
  // advanced offer whose position no longer holds the card).
  const offer = draftState.currentOffer;
  if (packIndex < 0 || packIndex >= offer.length) return null;
  if (offer[packIndex] !== cardNumber) return null;

  // Append the picked card FIRST so the deck-fit ranking for the NEXT offer
  // reflects the deck including the just-picked card (pool mode never reads the
  // deck, so this ordering is observationally identical there).
  const entry: DeckEntry = {
    entryId: mintEntryId(quest.deck, ctx, 0),
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
  const deck = [...quest.deck, entry];
  const deckCardNumbers = deck.map((e) => e.cardNumber);

  // Advance the draft on a clone so a bounce (from a thrown engine error, which
  // the root reducer catches) never leaves a half-mutated live state.
  const nextDraftState = structuredClone(draftState);
  const offerDeps = provider.offerDepsFor(nextDraftState, deckCardNumbers);
  const config = provider.draftConfigFor(nextDraftState) ?? DEFAULT_DRAFT_CONFIG;
  processPlayerPickWithoutLogging(
    cardNumber,
    nextDraftState,
    provider.cardDatabase(),
    config,
    offerDeps,
    rngStream(ctx),
  );

  return { ...quest, deck, draftState: nextDraftState };
}

/**
 * `SET_DRAFT_STATE { draftState }` — legacy `setDraftState` (debug edit).
 * Replaces the whole draft state with the payload's, or clears it with `null`.
 * Bounces on a malformed (non-object, non-null) value. The payload shape is
 * trusted here exactly like `LOAD_STATE`'s snapshot: this is a debug escape
 * hatch, not a player-facing intent.
 */
export function setDraftState(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const raw = payload.draftState;
  if (raw !== null && typeof raw !== "object") return null;
  return { ...quest, draftState: raw as QuestState["draftState"] };
}
