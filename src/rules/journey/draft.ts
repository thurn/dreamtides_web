// Pure draft reducer cases.
//
// Each exported case relocates the DOMAIN MATH of a legacy journey draft mutation
// (`src/state/multiplayer-journey-context.tsx` / `journey-state-actions.ts`) into a
// pure function of `(journey, payload, ctx)`. The legacy transaction /
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
import type {
  DeckEntry,
  JourneyState,
  SiteState,
  TransfigurationType,
} from "../../types/journey";
import {
  enterDraftSite as engineEnterDraftSite,
  processPlayerPickWithoutLogging,
  rerollDraftOffer as engineRerollDraftOffer,
  type OfferDeps,
} from "../../draft/draft-engine";
import { mintEntryId } from "./deck";
import { findSite } from "./sites";

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
   * The explicit draft config for the active dreamscape, including any
   * affiliation reweighting. `undefined` rejects the reducer action.
   */
  draftConfigFor(
    draftState: DraftState,
    site: Pick<SiteState, "data">,
  ): DraftConfig | undefined;
  /** Deterministically choose a legal form for one offered card, when any. */
  transfigurationForCard?(
    cardNumber: number,
    rng: () => number,
  ): TransfigurationType | null;
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

function rollOfferTransfigurations(
  draftState: DraftState,
  provider: DraftContentProvider,
  rng: () => number,
): Record<string, TransfigurationType> {
  return Object.fromEntries(
    draftState.currentOffer.flatMap((cardNumber) => {
      const transfiguration =
        provider.transfigurationForCard?.(cardNumber, rng) ?? null;
      return transfiguration === null
        ? []
        : [[String(cardNumber), transfiguration] as const];
    }),
  );
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

/**
 * `PICK_DRAFT_CARD { packIndex, cardId }` — relocates legacy `pickDraftCard` /
 * `pickDraftCardInJourneyState`. The card UUID resolves to its `cardNumber`
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
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const packIndex = integer(payload.packIndex);
  const cardId = asString(payload.cardId);
  if (packIndex === null || cardId === null) return null;

  const provider = contentProvider;
  if (provider === null) return null;

  const draftState = journey.draftState;
  if (draftState === null || draftState.activeSiteId === null) return null;
  const site = findSite(journey, draftState.activeSiteId);
  if (site === null || site.type !== "Draft") return null;

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
    entryId: mintEntryId(journey.deck, ctx.seq, 0),
    cardNumber,
    transfiguration:
      draftState.currentOfferTransfigurations?.[String(cardNumber)] ?? null,
    isBane: false,
  };
  const deck = [...journey.deck, entry];
  const deckCardNumbers = deck.map((e) => e.cardNumber);

  // Advance the draft on a clone so a bounce (from a thrown engine error, which
  // the root reducer catches) never leaves a half-mutated live state.
  const nextDraftState = structuredClone(draftState);
  const offerDeps = provider.offerDepsFor(nextDraftState, deckCardNumbers);
  const config = provider.draftConfigFor(nextDraftState, site);
  if (config === undefined) return null;
  const stream = rngStream(ctx);
  processPlayerPickWithoutLogging(
    cardNumber,
    nextDraftState,
    provider.cardDatabase(),
    config,
    offerDeps,
    stream,
    deckCardNumbers,
  );
  if (nextDraftState.transfiguredOfferSource !== undefined) {
    nextDraftState.currentOfferTransfigurations = rollOfferTransfigurations(
      nextDraftState,
      provider,
      stream,
    );
  } else {
    delete nextDraftState.currentOfferTransfigurations;
  }

  return { ...journey, deck, draftState: nextDraftState };
}

/**
 * `ENTER_DRAFT_SITE { siteId }` — the site-entry bootstrap that reveals a
 * draft site's first offer, mirroring `OPEN_SITE`'s bootstrap pattern
 * (`sites.ts`'s `openSite`). Bounces (never half-applies) when: the payload is
 * malformed; no provider is wired; there is no active draft (`draftState ===
 * null`); or `siteId` does not name a `"Draft"` site in this run's atlas.
 *
 * If the draft is already active at `siteId`, the event bounces with zero rng
 * draws. The event-log intent key prevents repeated screen mounts and connected
 * clients from appending that repeated event. Otherwise the
 * draft state is cloned and advanced via the engine's `enterDraftSite`,
 * drawing the first offer from `ctx.rng` (through the same `rngStream`
 * adapter `PICK_DRAFT_CARD` uses), so the roll is deterministic per
 * `(seed, seq)`.
 */
export function enterDraftSite(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;

  const provider = contentProvider;
  if (provider === null) return null;

  const draftState = journey.draftState;
  if (draftState === null) return null;

  const site = findSite(journey, siteId);
  if (site === null || site.type !== "Draft") return null;

  if (draftState.activeSiteId === siteId) return null;

  const nextDraftState = structuredClone(draftState);
  const deckCardNumbers = journey.deck.map((entry) => entry.cardNumber);
  const offerDeps = provider.offerDepsFor(nextDraftState, deckCardNumbers);
  const config = provider.draftConfigFor(nextDraftState, site);
  if (config === undefined) return null;
  const stream = rngStream(ctx);
  engineEnterDraftSite(
    nextDraftState,
    siteId,
    provider.cardDatabase(),
    config,
    offerDeps,
    stream,
  );
  const modifierIndex = journey.siteOfferModifiers.findIndex(
    (modifier) => modifier.kind === "transfigure-next-draft-or-shop",
  );
  if (modifierIndex >= 0) {
    const modifier = journey.siteOfferModifiers[modifierIndex];
    nextDraftState.transfiguredOfferSource = {
      siteId: modifier.sourceSiteId,
      actionId: modifier.sourceActionId,
    };
    nextDraftState.currentOfferTransfigurations = rollOfferTransfigurations(
      nextDraftState,
      provider,
      stream,
    );
    return {
      ...journey,
      draftState: nextDraftState,
      siteOfferModifiers: journey.siteOfferModifiers.filter(
        (_modifier, index) => index !== modifierIndex,
      ),
    };
  }
  delete nextDraftState.transfiguredOfferSource;
  delete nextDraftState.currentOfferTransfigurations;
  return { ...journey, draftState: nextDraftState };
}

/**
 * `REROLL_DRAFT_OFFER { siteId }` — shared debug-only replacement of the
 * active offer. It keeps the draft's pick counter and deck unchanged, while
 * the engine records the abandoned pack as shown so pool-mode offers remain
 * unique within this site visit. The event context supplies the deterministic
 * replacement roll, making the debug action converge for connected clients.
 */
export function rerollDraftOffer(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;

  const provider = contentProvider;
  if (provider === null) return null;

  const draftState = journey.draftState;
  if (
    draftState === null ||
    draftState.activeSiteId !== siteId ||
    draftState.currentOffer.length === 0
  ) {
    return null;
  }

  const site = findSite(journey, siteId);
  if (site === null || site.type !== "Draft") return null;

  const nextDraftState = structuredClone(draftState);
  const deckCardNumbers = journey.deck.map((entry) => entry.cardNumber);
  const offerDeps = provider.offerDepsFor(nextDraftState, deckCardNumbers);
  const config = provider.draftConfigFor(nextDraftState, site);
  if (config === undefined) return null;
  const stream = rngStream(ctx);
  const hasOffer = engineRerollDraftOffer(
    nextDraftState,
    config,
    offerDeps,
    stream,
  );
  if (!hasOffer) return null;
  if (nextDraftState.transfiguredOfferSource !== undefined) {
    nextDraftState.currentOfferTransfigurations = rollOfferTransfigurations(
      nextDraftState,
      provider,
      stream,
    );
  } else {
    delete nextDraftState.currentOfferTransfigurations;
  }

  return { ...journey, draftState: nextDraftState };
}

/**
 * `SET_DRAFT_STATE { draftState }` — legacy `setDraftState` (debug edit).
 * Replaces the whole draft state with the payload's, or clears it with `null`.
 * Bounces on a malformed (non-object, non-null) value. The payload shape is
 * trusted here exactly like `LOAD_STATE`'s snapshot: this is a debug escape
 * hatch, not a player-facing intent.
 */
export function setDraftState(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const raw = payload.draftState;
  if (raw !== null && typeof raw !== "object") return null;
  return { ...journey, draftState: raw as JourneyState["draftState"] };
}
