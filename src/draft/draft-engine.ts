import type { CardData } from "../types/cards";
import type { ResolvedDreamAvatarPackage } from "../types/content";
import type {
  DraftConfig,
  DraftPoolCopiesByCard,
  DraftState,
  PackContext,
  PoolDraftState,
} from "../types/draft";
import {
  serializeCardNumber,
  serializeDraftPickNumber,
} from "../types/draft";
import { logEvent } from "../logging";
import { logAffiliationDraw } from "../affiliations/affiliation-weights";
import { DEFAULT_DRAFT_DATA } from "../data/draft-data";
import type { SiteId } from "../types/identifiers";
import { identityKeys } from "../types/identifiers";

/** Default shared draft configuration. */
export const DEFAULT_DRAFT_CONFIG: Readonly<DraftConfig> = {
  packSize: DEFAULT_DRAFT_DATA.offers.cardsPerOffer,
  sitePickCount: DEFAULT_DRAFT_DATA.offers.picksPerSite,
  rarityCaps: DEFAULT_DRAFT_DATA.rarityCaps,
};

/** Legacy default used by tests and imported saves without persisted site data. */
export const SITE_PICKS = DEFAULT_DRAFT_DATA.offers.picksPerSite;

/**
 * Sample unique card numbers from weighted entries without replacement.
 * Returns the selected card numbers.
 *
 * Randomness is injected: `rng` is a required `() => number` returning a
 * uniform value in `[0, 1)`. Callers reached from the pure journey reducer pass a
 * `ctx.rng`-derived stream so two clients folding the same event draw the same
 * sample; other callers pass an explicit source (e.g. `Math.random`). This
 * function reads no ambient randomness of its own.
 */
function weightedSample(
  entries: Array<{ cardNumber: number; weight: number }>,
  count: number,
  rng: () => number,
): number[] {
  const packSize = Math.min(count, entries.length);
  const selected: number[] = [];

  for (let i = 0; i < packSize; i++) {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
      break;
    }

    let roll = rng() * totalWeight;
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
 *
 * `affiliationWeights`, when provided, multiplies each card's base copy weight by
 * its `cardNumber -> multiplier` entry (cards absent use 1) so a draw inside an
 * affiliated dreamscape leans toward that affiliation without ever dropping a card
 * (see `src/affiliations/affiliation-weights.ts`).
 *
 * `rng` is the injected randomness source (uniform `[0, 1)`); it defaults to
 * `Math.random` for callers that have no seed context, while the pure journey
 * reducer passes a `ctx.rng`-derived stream so a draw is deterministic per
 * `(seed, seq)`.
 */
export function drawAndSpendUniqueCards(
  state: DraftState,
  count: number,
  eligibleCardNumbers?: ReadonlySet<number>,
  affiliationWeights?: ReadonlyMap<number, number>,
  rng: () => number = Math.random,
): number[] {
  const buildEntries = (
    copies: DraftPoolCopiesByCard,
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
      const multiplier = affiliationWeights?.get(cardNumber) ?? 1;
      entries.push({ cardNumber, weight: copies_ * multiplier });
    }
    return entries;
  };

  let entries = buildEntries(state.remainingCopiesByCard);
  if (entries.length < count) {
    state.remainingCopiesByCard = { ...state.draftPoolCopiesByCard };
    entries = buildEntries(state.remainingCopiesByCard);
  }

  const drawn = weightedSample(entries, count, rng);
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
  rng: () => number,
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

    const multiplier = ctx.affiliationWeights?.get(cardNumber) ?? 1;
    entries.push({ cardNumber, weight: copies * multiplier });
  }

  if (entries.length < ctx.packSize) {
    return [];
  }

  return weightedSample(entries, ctx.packSize, rng);
}

function eligibleOpeningOffer(
  state: PoolDraftState,
  packSize: number,
  shownThisVisit: ReadonlySet<number>,
): number[] | null {
  const authored =
    state.openingDraftOffers?.[serializeDraftPickNumber(state.pickNumber)];
  if (
    authored === undefined ||
    authored.length !== packSize ||
    new Set(authored).size !== authored.length
  ) {
    return null;
  }
  for (const cardNumber of authored) {
    if (
      shownThisVisit.has(cardNumber) ||
      (state.remainingCopiesByCard[serializeCardNumber(cardNumber)] ?? 0) <= 0
    ) {
      return null;
    }
  }
  return [...authored];
}

/** Remove a capped rarity from both the live and recreatable pool multisets. */
function removeRarityFromPool(
  state: PoolDraftState,
  cardDatabase: Map<number, CardData>,
  rarity: NonNullable<CardData["rarity"]>,
): void {
  for (const key of identityKeys(state.draftPoolCopiesByCard)) {
    if (cardDatabase.get(Number(key))?.rarity === rarity) {
      delete state.draftPoolCopiesByCard[key];
      delete state.remainingCopiesByCard[key];
    }
  }
}

function spendShownOffer(
  remainingCopiesByCard: DraftPoolCopiesByCard,
  offer: number[],
): void {
  for (const cardNumber of offer) {
    const key = serializeCardNumber(cardNumber);
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
  rng: () => number = Math.random,
): boolean {
  // Cards already shown in this site visit are excluded so the same card is
  // never offered twice within one visit. The set resets when a new draft site
  // visit begins (see enterDraftSite).
  const shownThisVisit = new Set(state.siteShownCardNumbers ?? []);

  const authoredOpeningOffer = eligibleOpeningOffer(
    state,
    config.packSize,
    shownThisVisit,
  );
  let offer =
    authoredOpeningOffer ??
    buildOffer(
      {
        remainingCopiesByCard: state.remainingCopiesByCard,
        pickNumber: state.pickNumber,
        packSize: config.packSize,
        affiliationWeights: config.affiliationWeights,
      },
      rng,
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
        affiliationWeights: config.affiliationWeights,
      },
      rng,
      shownThisVisit,
    );
  }

  state.currentOffer = offer;
  if (offer.length < config.packSize) {
    return false;
  }

  spendShownOffer(state.remainingCopiesByCard, offer);
  state.siteShownCardNumbers = [
    ...(state.siteShownCardNumbers ?? []),
    ...offer,
  ];
  if (options.logEvents) {
    if (config.affiliationWeights !== undefined) {
      logAffiliationDraw({
        drawSite: "draft_offer",
        affiliationId: config.affiliationId,
        candidateWeights: config.affiliationWeights,
        picked: offer,
      });
    }
    logEvent("draft_offer_revealed", {
      pickNumber: state.pickNumber,
      offerCards: offer,
      source:
        authoredOpeningOffer === null ? "weighted_pool" : "authored_opening",
      poolRemaining: countRemainingCards(state.remainingCopiesByCard),
      uniqueCardsRemaining: countRemainingUniqueCards(
        state.remainingCopiesByCard,
      ),
    });
  }
  return true;
}

function sanitizeDraftPoolCopies(
  cardDatabase: Map<number, CardData>,
  draftPoolCopiesByCard: DraftPoolCopiesByCard,
): DraftPoolCopiesByCard {
  const remainingCopiesByCard: DraftPoolCopiesByCard = {};

  for (const [cardNumberText, copies] of Object.entries(
    draftPoolCopiesByCard,
  )) {
    const cardNumber = Number(cardNumberText);
    if (
      !Number.isInteger(cardNumber) ||
      !cardDatabase.has(cardNumber) ||
      copies <= 0
    ) {
      continue;
    }

    remainingCopiesByCard[serializeCardNumber(cardNumber)] = copies;
  }

  return remainingCopiesByCard;
}

export function countRemainingCards(
  remainingCopiesByCard: DraftPoolCopiesByCard,
): number {
  return Object.values(remainingCopiesByCard).reduce(
    (total, copies) => total + copies,
    0,
  );
}

export function countRemainingUniqueCards(
  remainingCopiesByCard: DraftPoolCopiesByCard,
): number {
  return Object.keys(remainingCopiesByCard).length;
}

export function createInitialDraftState(
  cardDatabase: Map<number, CardData>,
  resolvedPackage: ResolvedDreamAvatarPackage,
): PoolDraftState {
  const draftPoolCopiesByCard = sanitizeDraftPoolCopies(
    cardDatabase,
    resolvedPackage.draftPoolCopiesByCard,
  );

  return {
    mode: "tides4",
    draftPoolCopiesByCard,
    ...(resolvedPackage.openingDraftOffers === undefined
      ? {}
      : {
          openingDraftOffers: structuredClone(
            resolvedPackage.openingDraftOffers,
          ),
        }),
    remainingCopiesByCard: { ...draftPoolCopiesByCard },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
  };
}

/** Create initial DraftState from the resolved DreamAvatar package. */
export function initializeDraftState(
  cardDatabase: Map<number, CardData>,
  resolvedPackage: ResolvedDreamAvatarPackage,
): PoolDraftState {
  const draftState = createInitialDraftState(cardDatabase, resolvedPackage);

  logEvent("draft_pool_initialized", {
    poolSize: countRemainingCards(draftState.remainingCopiesByCard),
    uniqueCardCount: countRemainingUniqueCards(
      draftState.remainingCopiesByCard,
    ),
    dreamAvatarId: resolvedPackage.dreamAvatar.id,
  });

  return draftState;
}

/** Prepare the state for a draft site visit. Draws the first pack. */
export function enterDraftSite(
  state: DraftState,
  siteId: SiteId,
  _cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  rng: () => number = Math.random,
): void {
  if (state.activeSiteId === siteId) {
    logEvent("draft_site_entered", {
      siteId,
      pickNumber: state.pickNumber,
      poolSize: countRemainingCards(state.remainingCopiesByCard),
      offerCards: state.currentOffer,
      offerAvailable: state.currentOffer.length > 0,
      resumedExistingOffer: state.currentOffer.length > 0,
      cardsPerOffer: config.packSize,
      picksPerSite: config.sitePickCount,
      rarityCaps: config.rarityCaps,
    });
    return;
  }

  state.activeSiteId = siteId;
  state.sitePicksCompleted = 0;
  state.siteShownCardNumbers = [];
  const hasOffer = revealOffer(state, config, { logEvents: true }, rng);

  logEvent("draft_site_entered", {
    siteId,
    pickNumber: state.pickNumber,
    poolSize: countRemainingCards(state.remainingCopiesByCard),
    offerCards: state.currentOffer,
    offerAvailable: hasOffer,
    resumedExistingOffer: false,
    cardsPerOffer: config.packSize,
    picksPerSite: config.sitePickCount,
    rarityCaps: config.rarityCaps,
  });
}

/**
 * Replace the active draft site's displayed offer without advancing its pick
 * counter. The abandoned offer remains spent and recorded as shown, so a pool
 * draft never reoffers it during the same site visit.
 */
export function rerollDraftOffer(
  state: DraftState,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  rng: () => number = Math.random,
): boolean {
  const previousOffer = [...state.currentOffer];
  const hasOffer = revealOffer(state, config, { logEvents: true }, rng);

  logEvent("draft_offer_rerolled", {
    siteId: state.activeSiteId,
    pickNumber: state.pickNumber,
    previousOffer,
    offerCards: state.currentOffer,
    poolRemaining: countRemainingCards(state.remainingCopiesByCard),
    uniqueCardsRemaining: countRemainingUniqueCards(
      state.remainingCopiesByCard,
    ),
  });

  return hasOffer;
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
  rng: () => number = Math.random,
  postPickDeckCardNumbers: readonly number[] = [cardNumber],
): boolean {
  const currentOffer = [...state.currentOffer];
  if (!currentOffer.includes(cardNumber)) {
    throw new Error(`Card ${String(cardNumber)} is not in the current offer`);
  }

  const card = cardDatabase.get(cardNumber);

  if (options.logEvents) {
    logEvent("draft_pick_player", {
      siteId: state.activeSiteId,
      pickNumber: state.pickNumber,
      cardNumber,
      cardName: card?.name ?? "Unknown",
      offerCards: currentOffer,
      poolRemaining: countRemainingCards(state.remainingCopiesByCard),
      uniqueCardsRemaining: countRemainingUniqueCards(
        state.remainingCopiesByCard,
      ),
    });
  }

  state.pickNumber += 1;
  state.sitePicksCompleted += 1;

  for (const rarityCap of config.rarityCaps) {
    const pickedAtRarity = postPickDeckCardNumbers.reduce(
      (count, draftedCardNumber) =>
        cardDatabase.get(draftedCardNumber)?.rarity === rarityCap.rarity
          ? count + 1
          : count,
      0,
    );
    if (pickedAtRarity >= rarityCap.maxPicksPerRun) {
      removeRarityFromPool(state, cardDatabase, rarityCap.rarity);
    }
  }

  if (state.sitePicksCompleted >= config.sitePickCount) {
    state.currentOffer = [];
    return true;
  }

  return !revealOffer(state, config, options, rng);
}

export function processPlayerPick(
  cardNumber: number,
  state: DraftState,
  cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  rng: () => number = Math.random,
  postPickDeckCardNumbers?: readonly number[],
): boolean {
  return processPlayerPickInternal(
    cardNumber,
    state,
    cardDatabase,
    config,
    { logEvents: true },
    rng,
    postPickDeckCardNumbers,
  );
}

export function processPlayerPickWithoutLogging(
  cardNumber: number,
  state: DraftState,
  cardDatabase: Map<number, CardData>,
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
  rng: () => number = Math.random,
  postPickDeckCardNumbers?: readonly number[],
): boolean {
  return processPlayerPickInternal(
    cardNumber,
    state,
    cardDatabase,
    config,
    { logEvents: false },
    rng,
    postPickDeckCardNumbers,
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
    poolRemaining: countRemainingCards(state.remainingCopiesByCard),
    uniqueCardsRemaining: countRemainingUniqueCards(
      state.remainingCopiesByCard,
    ),
  });
}
