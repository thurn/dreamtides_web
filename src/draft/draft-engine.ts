import type { CardData } from "../types/cards";
import type { ResolvedDreamcallerPackage } from "../types/content";
import type {
  DraftConfig,
  DraftState,
  Fresh20DraftState,
  PackContext,
  PoolDraftState,
  ReplayDraftState,
} from "../types/draft";
import { logEvent } from "../logging";
import { computeReplayOffer, type FitModel } from "./replay/fit-model";
import {
  computeFresh20Offer,
  recordFresh20Shown,
  type Fresh20Deps,
} from "./fresh20/fresh20-offer";
import { DEFAULT_DRAFT_SITE_PICK_COUNT } from "./draft-site-config";

/** Default shared draft configuration. */
export const DEFAULT_DRAFT_CONFIG: Readonly<DraftConfig> = {
  packSize: 4,
};

/** Number of player picks per draft site visit. */
export const SITE_PICKS = DEFAULT_DRAFT_SITE_PICK_COUNT;

/**
 * Dependencies the engine needs to compute a replay offer. Supplied by callers
 * on every replay-mode `revealOffer` / `processPlayerPick` / `enterDraftSite`;
 * pool-mode calls omit it.
 */
export interface ReplayDeps {
  /**
   * The player's current deck (card numbers). When computing the offer for the
   * NEXT pick this MUST already include the just-picked card; callers handle
   * that ordering.
   */
  deckCardNumbers: readonly number[];
  /** The deck-fit model used to rank a pack. */
  fitModel: FitModel;
  /** How many cards to offer (e.g. `DEFAULT_DRAFT_CONFIG.packSize`). */
  offerSize: number;
  /** Ranker. Defaults to the real {@link computeReplayOffer}; tests inject a fake. */
  computeOffer?: typeof computeReplayOffer;
}

/**
 * Per-offer dependencies for the deck-fit draft modes. `revealOffer` and the
 * pick/entry helpers accept whichever member matches the active draft state:
 * {@link ReplayDeps} for `mode:"replay"`, {@link Fresh20Deps} for
 * `mode:"fresh20"`. Pool-mode calls pass `undefined`.
 */
export type OfferDeps = ReplayDeps | Fresh20Deps;

/**
 * Compute a replay offer from the frozen pack sequence. Returns the deck-fit
 * best `offerSize` cards of the pack for this pick, the whole pack when it is
 * small, or `[]` once the sequence is exhausted (e.g. `pickNumber > 30`).
 */
export function buildReplayOffer(
  state: ReplayDraftState,
  deps: ReplayDeps,
): number[] {
  const pack = state.packSequence[state.pickNumber - 1];
  if (pack === undefined || pack.length === 0) {
    return [];
  }
  if (pack.length <= deps.offerSize) {
    return [...pack];
  }
  return (deps.computeOffer ?? computeReplayOffer)(
    pack,
    deps.deckCardNumbers,
    state.signatureCardNumbers,
    deps.fitModel,
    deps.offerSize,
  );
}

/**
 * Sample unique card numbers from weighted entries without replacement.
 * Returns the selected card numbers.
 */
function weightedSample(
  entries: Array<{ cardNumber: number; weight: number }>,
  count: number,
): number[] {
  const packSize = Math.min(count, entries.length);
  const selected: number[] = [];

  for (let i = 0; i < packSize; i++) {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
      break;
    }

    let roll = Math.random() * totalWeight;
    let chosenIndex = entries.length - 1;
    for (let index = 0; index < entries.length; index += 1) {
      roll -= entries[index].weight;
      if (roll <= 0) {
        chosenIndex = index;
        break;
      }
    }

    selected.push(entries[chosenIndex].cardNumber);
    entries.splice(chosenIndex, 1);
  }

  return selected;
}

/**
 * Draws up to `count` unique card numbers from the run draft multiset,
 * spending each drawn card from `state.remainingCopiesByCard`. When fewer than
 * `count` eligible unique cards remain the multiset is first recreated from
 * the run's fixed pool, mirroring `revealOffer`. Mutates `state`.
 *
 * `eligibleCardNumbers`, when provided, restricts the draw to that subset
 * (used by Specialty Shops to feature a single tide).
 */
export function drawAndSpendUniqueCards(
  state: DraftState,
  count: number,
  eligibleCardNumbers?: ReadonlySet<number>,
): number[] {
  if (state.mode !== "pool") {
    throw new Error("drawAndSpendUniqueCards requires a pool draft state");
  }
  const buildEntries = (
    copies: Record<string, number>,
  ): Array<{ cardNumber: number; weight: number }> => {
    const entries: Array<{ cardNumber: number; weight: number }> = [];
    for (const [cardNumberText, copies_] of Object.entries(copies)) {
      const cardNumber = Number(cardNumberText);
      if (!Number.isInteger(cardNumber) || copies_ <= 0) {
        continue;
      }
      if (
        eligibleCardNumbers !== undefined &&
        !eligibleCardNumbers.has(cardNumber)
      ) {
        continue;
      }
      entries.push({ cardNumber, weight: copies_ });
    }
    return entries;
  };

  let entries = buildEntries(state.remainingCopiesByCard);
  if (entries.length < count) {
    state.remainingCopiesByCard = { ...state.draftPoolCopiesByCard };
    entries = buildEntries(state.remainingCopiesByCard);
  }

  const drawn = weightedSample(entries, count);
  spendShownOffer(state.remainingCopiesByCard, drawn);
  return drawn;
}

/**
 * Build a 4-unique-card offer weighted by remaining copies. Card numbers in
 * `excludeCardNumbers` are never offered: this is how a draft site keeps a card
 * from appearing twice across the offers of a single visit once it has been
 * shown.
 */
function buildOffer(
  ctx: PackContext,
  excludeCardNumbers: Set<number> = new Set(),
): number[] {
  const entries: Array<{ cardNumber: number; weight: number }> = [];

  for (const [cardNumberText, copies] of Object.entries(
    ctx.remainingCopiesByCard,
  )) {
    const cardNumber = Number(cardNumberText);
    if (
      !Number.isInteger(cardNumber) ||
      copies <= 0 ||
      excludeCardNumbers.has(cardNumber)
    ) {
      continue;
    }

    entries.push({ cardNumber, weight: copies });
  }

  if (entries.length < ctx.packSize) {
    return [];
  }

  return weightedSample(entries, ctx.packSize);
}

function spendShownOffer(
  remainingCopiesByCard: Record<string, number>,
  offer: number[],
): void {
  for (const cardNumber of offer) {
    const key = String(cardNumber);
    const remainingCopies = remainingCopiesByCard[key];
    if (remainingCopies === undefined) {
      continue;
    }

    if (remainingCopies <= 1) {
      delete remainingCopiesByCard[key];
    } else {
      remainingCopiesByCard[key] = remainingCopies - 1;
    }
  }
}

function revealOffer(
  state: DraftState,
  config: DraftConfig,
  options: { logEvents: boolean } = { logEvents: true },
  offerDeps?: OfferDeps,
): boolean {
  if (state.mode === "replay") {
    if (offerDeps === undefined) {
      throw new Error("revealOffer requires replayDeps for a replay draft state");
    }
    state.currentOffer = buildReplayOffer(state, offerDeps as ReplayDeps);
    if (options.logEvents) {
      logEvent("draft_offer_revealed", {
        pickNumber: state.pickNumber,
        offerCards: state.currentOffer,
      });
    }
    return state.currentOffer.length > 0;
  }

  if (state.mode === "fresh20") {
    if (offerDeps === undefined) {
      throw new Error(
        "revealOffer requires fresh20Deps for a fresh20 draft state",
      );
    }
    state.currentOffer = computeFresh20Offer(state, offerDeps as Fresh20Deps);
    // Record the shown cards so the cooldown / twice-then-never caps apply on
    // later picks. Done here (once per pick) rather than in the pure offer
    // computation so the offer builder stays side-effect free.
    recordFresh20Shown(state, state.currentOffer);
    if (options.logEvents) {
      logEvent("draft_offer_revealed", {
        pickNumber: state.pickNumber,
        offerCards: state.currentOffer,
      });
    }
    return state.currentOffer.length > 0;
  }

  // Cards already shown in this site visit are excluded so the same card is
  // never offered twice within one visit. The set resets when a new draft site
  // visit begins (see enterDraftSite).
  const shownThisVisit = new Set(state.siteShownCardNumbers ?? []);

  let offer = buildOffer(
    {
      remainingCopiesByCard: state.remainingCopiesByCard,
      pickNumber: state.pickNumber,
      packSize: config.packSize,
    },
    shownThisVisit,
  );

  // The draft multiset is finite. When fewer than a full offer's worth of
  // unique unshown cards remain, recreate the multiset from the run's fixed
  // pool so the Draft site can keep producing offers. Cards shown earlier this
  // visit stay excluded, so recreation never reintroduces a within-visit
  // duplicate.
  if (offer.length < config.packSize) {
    state.remainingCopiesByCard = { ...state.draftPoolCopiesByCard };
    if (options.logEvents) {
      logEvent("draft_pool_recreated", {
        pickNumber: state.pickNumber,
        poolSize: countRemainingCards(state.remainingCopiesByCard),
        uniqueCardsRemaining: countRemainingUniqueCards(
          state.remainingCopiesByCard,
        ),
      });
    }
    offer = buildOffer(
      {
        remainingCopiesByCard: state.remainingCopiesByCard,
        pickNumber: state.pickNumber,
        packSize: config.packSize,
      },
      shownThisVisit,
    );
  }

  state.currentOffer = offer;
  if (offer.length < config.packSize) {
    return false;
  }

  spendShownOffer(state.remainingCopiesByCard, offer);
  state.siteShownCardNumbers = [...(state.siteShownCardNumbers ?? []), ...offer];
  if (options.logEvents) {
    logEvent("draft_offer_revealed", {
      pickNumber: state.pickNumber,
      offerCards: offer,
      poolRemaining: countRemainingCards(state.remainingCopiesByCard),
      uniqueCardsRemaining: countRemainingUniqueCards(state.remainingCopiesByCard),
    });
  }
  return true;
}

function sanitizeDraftPoolCopies(
  cardDatabase: Map<number, CardData>,
  draftPoolCopiesByCard: Record<string, number>,
): Record<string, number> {
  const remainingCopiesByCard: Record<string, number> = {};

  for (const [cardNumberText, copies] of Object.entries(draftPoolCopiesByCard)) {
    const cardNumber = Number(cardNumberText);
    if (
      !Number.isInteger(cardNumber) ||
      !cardDatabase.has(cardNumber) ||
      copies <= 0
    ) {
      continue;
    }

    remainingCopiesByCard[String(cardNumber)] = copies;
  }

  return remainingCopiesByCard;
}

export function countRemainingCards(
  remainingCopiesByCard: Record<string, number>,
): number {
  return Object.values(remainingCopiesByCard).reduce(
    (total, copies) => total + copies,
    0,
  );
}

export function countRemainingUniqueCards(
  remainingCopiesByCard: Record<string, number>,
): number {
  return Object.keys(remainingCopiesByCard).length;
}

export function createInitialDraftState(
  cardDatabase: Map<number, CardData>,
  resolvedPackage: ResolvedDreamcallerPackage,
): PoolDraftState {
  const draftPoolCopiesByCard = sanitizeDraftPoolCopies(
    cardDatabase,
    resolvedPackage.draftPoolCopiesByCard,
  );

  return {
    mode: "pool",
    draftPoolCopiesByCard,
    remainingCopiesByCard: { ...draftPoolCopiesByCard },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
  };
}

/**
 * Create an initial replay {@link ReplayDraftState} from a chosen record's
 * frozen pack sequence and the Dreamcaller's signature cards.
 */
export function createInitialReplayDraftState(args: {
  recordId: string;
  packSequence: number[][];
  signatureCardNumbers: number[];
}): ReplayDraftState {
  return {
    mode: "replay",
    recordId: args.recordId,
    packSequence: args.packSequence,
    signatureCardNumbers: args.signatureCardNumbers,
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
  };
}

/**
 * Create an initial {@link Fresh20DraftState}. The packs are rolled lazily at
 * each pick, so nothing is frozen up front: only the pack size and the (empty)
 * show history are seeded here.
 */
export function createInitialFresh20DraftState(args: {
  packSize: number;
}): Fresh20DraftState {
  return {
    mode: "fresh20",
    packSize: args.packSize,
    shownPicksByCard: {},
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
  };
}

/** Create initial DraftState from the resolved Dreamcaller package. */
export function initializeDraftState(
  cardDatabase: Map<number, CardData>,
  resolvedPackage: ResolvedDreamcallerPackage,
): PoolDraftState {
  const draftState = createInitialDraftState(cardDatabase, resolvedPackage);

  logEvent("draft_pool_initialized", {
    poolSize: countRemainingCards(draftState.remainingCopiesByCard),
    uniqueCardCount: countRemainingUniqueCards(draftState.remainingCopiesByCard),
    dreamcallerId: resolvedPackage.dreamcaller.id,
  });

  return draftState;
}

/** Prepare the state for a draft site visit. Draws the first pack. */
export function enterDraftSite(
  state: DraftState,
  siteId: string,
  _cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  offerDeps?: OfferDeps,
): void {
  if (state.activeSiteId === siteId) {
    logEvent("draft_site_entered", {
      siteId,
      pickNumber: state.pickNumber,
      poolSize:
        state.mode === "pool"
          ? countRemainingCards(state.remainingCopiesByCard)
          : 0,
      offerCards: state.currentOffer,
      // A pool offer is always either full or empty, so `> 0` matches the old
      // `=== packSize` check there; for replay it also reports a valid short
      // pack (fewer than packSize cards) as available.
      offerAvailable: state.currentOffer.length > 0,
      resumedExistingOffer: state.currentOffer.length > 0,
    });
    return;
  }

  state.activeSiteId = siteId;
  state.sitePicksCompleted = 0;
  state.siteShownCardNumbers = [];
  const hasOffer = revealOffer(state, config, { logEvents: true }, offerDeps);

  logEvent("draft_site_entered", {
    siteId,
    pickNumber: state.pickNumber,
    poolSize:
      state.mode === "pool"
        ? countRemainingCards(state.remainingCopiesByCard)
        : 0,
    offerCards: state.currentOffer,
    offerAvailable: hasOffer,
    resumedExistingOffer: false,
  });
}

/** Return the current offer for display. */
export function getCurrentOffer(state: DraftState): number[] {
  return state.currentOffer;
}

/**
 * Process a player pick. The shown cards are spent from the fixed pool.
 * Returns whether the site visit is complete.
 */
function processPlayerPickInternal(
  cardNumber: number,
  state: DraftState,
  cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  options: { logEvents: boolean },
  offerDeps?: OfferDeps,
): boolean {
  const currentOffer = [...state.currentOffer];
  if (!currentOffer.includes(cardNumber)) {
    throw new Error(
      `Card ${String(cardNumber)} is not in the current offer`,
    );
  }

  const card = cardDatabase.get(cardNumber);

  if (options.logEvents) {
    logEvent("draft_pick_player", {
      siteId: state.activeSiteId,
      pickNumber: state.pickNumber,
      cardNumber,
      cardName: card?.name ?? "Unknown",
      offerCards: currentOffer,
      ...(state.mode === "pool"
        ? {
            poolRemaining: countRemainingCards(state.remainingCopiesByCard),
            uniqueCardsRemaining: countRemainingUniqueCards(
              state.remainingCopiesByCard,
            ),
          }
        : {}),
    });
  }

  state.pickNumber += 1;
  state.sitePicksCompleted += 1;

  if (state.sitePicksCompleted >= SITE_PICKS) {
    state.currentOffer = [];
    return true;
  }

  return !revealOffer(state, config, options, offerDeps);
}

export function processPlayerPick(
  cardNumber: number,
  state: DraftState,
  cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  offerDeps?: OfferDeps,
): boolean {
  return processPlayerPickInternal(
    cardNumber,
    state,
    cardDatabase,
    config,
    { logEvents: true },
    offerDeps,
  );
}

export function processPlayerPickWithoutLogging(
  cardNumber: number,
  state: DraftState,
  cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  offerDeps?: OfferDeps,
): boolean {
  return processPlayerPickInternal(
    cardNumber,
    state,
    cardDatabase,
    config,
    { logEvents: false },
    offerDeps,
  );
}

/** Finalize a draft site visit. Log the cards drafted during this visit. */
export function completeDraftSite(
  state: DraftState,
  draftedCardNumbers: number[],
): void {
  logEvent("draft_site_completed", {
    siteId: state.activeSiteId,
    cardsDrafted: [...draftedCardNumbers],
    picksCompleted: state.sitePicksCompleted,
    ...(state.mode === "pool"
      ? {
          poolRemaining: countRemainingCards(state.remainingCopiesByCard),
          uniqueCardsRemaining: countRemainingUniqueCards(
            state.remainingCopiesByCard,
          ),
        }
      : {}),
  });
}
