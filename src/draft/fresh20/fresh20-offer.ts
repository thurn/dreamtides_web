// The fresh-pack ("fresh20") draft. Unlike the record-replay draft, which shows
// the deck-fit best slice of a frozen real pack, this mode rolls a brand-new
// random pack of `packSize` cards at every pick and then applies the SAME
// deck-fit ranking (`computeReplayOffer`) to choose which cards to offer.
//
// Two show constraints shape which cards a pack may contain:
//   - cooldown: once a card has been shown (i.e. it appeared in an offer), it is
//     not shown again for at least `FRESH20_COOLDOWN_PICKS` picks.
//   - cap:      once a card has been shown `FRESH20_MAX_SHOWS` times it is never
//     shown again.
// Both are enforced at PACK GENERATION: an ineligible card never enters a pack,
// so the deck-fit step only ever ranks showable cards. Eligibility is computed
// purely from shows recorded at earlier picks, so re-revealing the same pick is
// safe (see `recordFresh20Shown`).
//
// The fit ranking deliberately ignores DreamAvatar signatures here: the deck the
// player has actually drafted is the only seed.

import type { Fresh20DraftState } from "../../types/draft.ts";
import { computeReplayOffer, type FitModel } from "../replay/fit-model.ts";

/** Default size of each freshly generated random pack. */
export const FRESH20_DEFAULT_PACK_SIZE = 20;

/** Minimum number of picks before a shown card may be shown again. */
export const FRESH20_COOLDOWN_PICKS = 10;

/** Number of times a card may be shown before it is retired permanently. */
export const FRESH20_MAX_SHOWS = 2;

/**
 * Dependencies the engine needs to roll and rank a fresh pack. Mirrors
 * `ReplayDeps` (deck, fit model, offer size) and adds the universe a random pack
 * draws from. `packSize` lives on the draft state, not here.
 */
export interface Fresh20Deps {
  /**
   * The player's current deck (card numbers). When computing the offer for the
   * NEXT pick this MUST already include the just-picked card; callers handle
   * that ordering, exactly as the replay draft does.
   */
  deckCardNumbers: readonly number[];
  /** The deck-fit model used to rank a pack. */
  fitModel: FitModel;
  /** How many cards to offer (e.g. `DEFAULT_DRAFT_CONFIG.packSize`). */
  offerSize: number;
  /** The full universe of card numbers a random pack may draw from. */
  allCardNumbers: readonly number[];
  /** RNG in [0, 1); defaults to `Math.random`. Tests inject a deterministic fake. */
  rng?: () => number;
  /** Ranker. Defaults to the real {@link computeReplayOffer}; tests inject a fake. */
  computeOffer?: typeof computeReplayOffer;
}

/**
 * Whether a card is eligible to be shown at `pickNumber` given the picks at
 * which it has already been shown. A card is eligible when it has been shown
 * fewer than {@link FRESH20_MAX_SHOWS} times AND its most recent prior show is
 * at least {@link FRESH20_COOLDOWN_PICKS} picks ago.
 *
 * Only shows at picks strictly EARLIER than `pickNumber` count, so a stray
 * record at the current pick (from a re-reveal) cannot affect this pick's pack.
 */
export function isFresh20CardEligible(
  shownPicks: readonly number[] | undefined,
  pickNumber: number,
): boolean {
  if (shownPicks === undefined || shownPicks.length === 0) {
    return true;
  }
  let priorShows = 0;
  let lastShown = -Infinity;
  for (const p of shownPicks) {
    if (p >= pickNumber) {
      continue;
    }
    priorShows += 1;
    if (p > lastShown) {
      lastShown = p;
    }
  }
  if (priorShows === 0) {
    return true;
  }
  if (priorShows >= FRESH20_MAX_SHOWS) {
    return false;
  }
  return pickNumber - lastShown >= FRESH20_COOLDOWN_PICKS;
}

/**
 * The card numbers from `allCardNumbers` that may be shown at `pickNumber`,
 * preserving input order. Pure.
 */
export function eligibleFresh20Cards(
  allCardNumbers: readonly number[],
  shownPicksByCard: Record<string, number[]>,
  pickNumber: number,
): number[] {
  const eligible: number[] = [];
  for (const cardNumber of allCardNumbers) {
    if (isFresh20CardEligible(shownPicksByCard[String(cardNumber)], pickNumber)) {
      eligible.push(cardNumber);
    }
  }
  return eligible;
}

/**
 * Sample `packSize` distinct card numbers uniformly at random from `eligible`
 * without replacement (partial Fisher–Yates over a copy). Returns fewer than
 * `packSize` only when the eligible pool is smaller than the pack. Pure aside
 * from `rng`; does not mutate `eligible`.
 */
export function generateFresh20Pack(
  eligible: readonly number[],
  packSize: number,
  rng: () => number = Math.random,
): number[] {
  const pool = [...eligible];
  const take = Math.min(packSize, pool.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, take);
}

/**
 * Roll a fresh random pack of eligible cards for the current pick and return the
 * deck-fit best `offerSize` of them. The same ranking the replay draft uses,
 * with an empty signature set (fresh20 ignores DreamAvatar signatures).
 */
export function computeFresh20Offer(
  state: Fresh20DraftState,
  deps: Fresh20Deps,
): number[] {
  const eligible = eligibleFresh20Cards(
    deps.allCardNumbers,
    state.shownPicksByCard,
    state.pickNumber,
  );
  const pack = generateFresh20Pack(eligible, state.packSize, deps.rng ?? Math.random);
  if (pack.length === 0) {
    return [];
  }
  return (deps.computeOffer ?? computeReplayOffer)(
    pack,
    deps.deckCardNumbers,
    [],
    deps.fitModel,
    deps.offerSize,
  );
}

/**
 * Record that `offer`'s cards were shown at `state.pickNumber`, mutating
 * `state.shownPicksByCard`. Idempotent for a given pick: any prior records at
 * `state.pickNumber` are cleared first, so re-revealing the same pick replaces
 * rather than accumulates. Each card's pick list is kept ascending and deduped.
 */
export function recordFresh20Shown(
  state: Fresh20DraftState,
  offer: readonly number[],
): void {
  const pick = state.pickNumber;
  // Clear any stale records at this pick (defensive against a re-reveal).
  for (const key of Object.keys(state.shownPicksByCard)) {
    const filtered = state.shownPicksByCard[key].filter((p) => p !== pick);
    if (filtered.length === 0) {
      delete state.shownPicksByCard[key];
    } else {
      state.shownPicksByCard[key] = filtered;
    }
  }
  for (const cardNumber of offer) {
    const key = String(cardNumber);
    const picks = state.shownPicksByCard[key] ?? [];
    picks.push(pick);
    picks.sort((a, b) => a - b);
    state.shownPicksByCard[key] = picks;
  }
}
