import { fitScores, fitLooByEntry } from "../signals/fit";
import { bandSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type {
  MerchantApplyPayload,
  MerchantCatalogCard,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeckCard,
} from "../types";
import type { FitModel } from "../../draft/replay/fit-model";
import type { CardData } from "../../types/cards";
import { grantCandidatePool } from "./grant";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a UUID-keyed fit value for each candidate against the current deck.
 * When no fit model is present, every candidate scores 0.
 * (Mirrors the private helper in grant.ts — duplicated here to avoid a
 * dependency inversion; kept thin.)
 */
function fitValueByUuid(
  context: MerchantContext,
  candidates: readonly MerchantCatalogCard[],
): Map<string, number> {
  const result = new Map<string, number>();
  const fitModel: FitModel | undefined = context.fitModel;
  if (fitModel === undefined) {
    for (const card of candidates) result.set(card.cardUuid, 0);
    return result;
  }
  const deck: readonly CardData[] = context.deckCards.map((dc) => dc.card);
  const scores = fitScores(
    candidates.map((c) => c.card),
    deck,
    fitModel,
  );
  for (const card of candidates) {
    result.set(card.cardUuid, scores.get(card.cardUuid)?.fit ?? 0);
  }
  return result;
}

/** Returns the band size for a pool under a band fraction. */
function bandSizeFor(poolSize: number, bandFraction: number): number {
  if (poolSize === 0) return 0;
  return Math.min(
    poolSize,
    Math.max(
      Math.ceil(bandFraction * poolSize),
      Math.min(MERCHANT_TUNING.bandMinimum, poolSize),
    ),
  );
}

// ---------------------------------------------------------------------------
// Shared purge-target selection
// ---------------------------------------------------------------------------

/**
 * One candidate for purge/purge_replace: a deck card with its misfit score.
 *
 * Misfit score is higher for worse-fitting or starter cards. Starters get
 * `starterPurgeBonus` added so they rank near the bottom of the band even
 * without a LOO score.
 */
export interface PurgeCandidateEntry {
  deckCard: MerchantDeckCard;
  entryId: string;
  misfitScore: number;
}

/**
 * Builds the purge candidate set:
 * - Starter entries (always candidates, banes excluded).
 * - Non-starter entries in the bottom `purgeMisfitFraction` of
 *   `fitLooByEntry`. Entries whose card has no corpus signal are absent from
 *   `fitLooByEntry` and therefore never included.
 *
 * Banes are excluded from all candidates.
 */
export function purgeCandidates(context: MerchantContext): readonly PurgeCandidateEntry[] {
  const fitModel = context.fitModel;

  // Leave-one-out scores for non-starter deck cards with corpus signal.
  const looScores: Map<string, number> =
    fitModel !== undefined ? fitLooByEntry(context.deckCards, fitModel) : new Map<string, number>();

  // Determine the LOO threshold for the bottom purgeMisfitFraction.
  // Only entries that appear in looScores are considered for the fraction.
  const looValues = [...looScores.values()].sort((a, b) => a - b);
  const thresholdCount = Math.ceil(
    MERCHANT_TUNING.purgeMisfitFraction * looValues.length,
  );
  // All entries with loo <= looThreshold qualify (worst fraction).
  // Use -Infinity when there are no scored entries so nothing qualifies.
  const looThreshold =
    thresholdCount > 0
      ? (looValues[Math.min(thresholdCount - 1, looValues.length - 1)] ?? -Infinity)
      : -Infinity;

  const candidates: PurgeCandidateEntry[] = [];

  for (const deckCard of context.deckCards) {
    // Banes are never purge candidates.
    if (deckCard.deckEntry.isBane) continue;

    if (deckCard.card.isStarter) {
      // Starters are always candidates.
      // Misfit score: 1 (worst possible) + bonus to rank near the band bottom.
      candidates.push({
        deckCard,
        entryId: deckCard.entryId,
        misfitScore: 1 + MERCHANT_TUNING.starterPurgeBonus,
      });
    } else {
      // Non-starters: must have corpus signal AND be in the bottom fraction.
      const loo = looScores.get(deckCard.entryId);
      if (loo === undefined) continue; // no corpus signal → never a candidate
      if (loo <= looThreshold) {
        // Lower LOO = higher misfit.
        candidates.push({
          deckCard,
          entryId: deckCard.entryId,
          misfitScore: 1 - loo,
        });
      }
    }
  }

  return candidates;
}

function removeDeckEntryPayload(
  deckCard: MerchantDeckCard,
): Extract<MerchantApplyPayload, { kind: "remove_deck_entry" }> {
  return {
    kind: "remove_deck_entry",
    entryId: deckCard.entryId,
    cardUuid: deckCard.cardUuid,
    cardNumber: deckCard.cardNumber,
  };
}

// ---------------------------------------------------------------------------
// purge
// ---------------------------------------------------------------------------

/**
 * `purge` — *Remove a weak card from your deck.*
 *
 * Candidates: starter entries plus non-starter entries in the bottom
 * `purgeMisfitFraction` of `fitLooByEntry` (no-signal cards excluded).
 * Banes excluded. Signal: misfit (worst first), starters get
 * `starterPurgeBonus`. Band-sample 1. Face-up. Eligible when deck size >=
 * `minDeckForPurge` and >= 1 candidate exists.
 */
export const purgeBuilder: MerchantArchetypeBuilder = {
  archetypeId: "purge",
  family: "remove",

  eligible(context: MerchantContext): boolean {
    if (context.deckCards.length < MERCHANT_TUNING.minDeckForPurge) return false;
    return purgeCandidates(context).length > 0;
  },

  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const candidates = purgeCandidates(context);
    if (candidates.length === 0) return null;

    const sampled = bandSample(candidates, (entry) => entry.misfitScore, 1, rng);
    const target = sampled[0];
    if (target === undefined) return null;

    return {
      archetypeId: "purge",
      family: "remove",
      title: `Remove ${target.deckCard.displayName}`,
      summary: "Remove a weak card from your deck.",
      gameObjects: [
        {
          objectType: "deckCard",
          entryId: target.entryId,
          cardUuid: target.deckCard.cardUuid,
          cardNumber: target.deckCard.cardNumber,
          deckEntry: target.deckCard.deckEntry,
          card: target.deckCard.card,
          displayName: target.deckCard.displayName,
        },
      ],
      applyPayload: removeDeckEntryPayload(target.deckCard),
      targetKey: target.entryId,
    };
  },
};

// ---------------------------------------------------------------------------
// purge_replace
// ---------------------------------------------------------------------------

/**
 * Eligibility for the replacement half: the grant pool must have a band of
 * >= 4 cards (mirrors `fitCardDraftBuilder`'s size check).
 */
function replacementHalfEligible(context: MerchantContext): boolean {
  const pool = grantCandidatePool(context);
  return bandSizeFor(pool.length, MERCHANT_TUNING.bandFraction) >= 4;
}

/**
 * `purge_replace` — *Remove a weak card and draft 1 of 4 replacements.*
 *
 * Removal target selected exactly as `purge`. Replacements are a face-up
 * fit-band sample of 4 unowned non-starter pool cards (same logic as
 * `fit_card_draft`). Each chooser candidate's payload is a composite
 * [remove_deck_entry, add_catalog_card]. Both halves must be individually
 * eligible.
 */
export const purgeReplaceBuilder: MerchantArchetypeBuilder = {
  archetypeId: "purge_replace",
  family: "remove",

  eligible(context: MerchantContext): boolean {
    return purgeBuilder.eligible(context) && replacementHalfEligible(context);
  },

  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    // Select the removal target (same as purge).
    const purgeCands = purgeCandidates(context);
    if (purgeCands.length === 0) return null;

    const purgeSampled = bandSample(
      purgeCands,
      (entry) => entry.misfitScore,
      1,
      rng,
    );
    const purgeTarget = purgeSampled[0];
    if (purgeTarget === undefined) return null;

    // Select 4 fit-band replacements from the grant pool.
    const pool = grantCandidatePool(context);
    if (pool.length === 0) return null;

    const fitByUuid = fitValueByUuid(context, pool);
    const replacements = bandSample(
      pool,
      (card) => fitByUuid.get(card.cardUuid) ?? 0,
      4,
      rng,
    );
    if (replacements.length < 4) return null;

    const remove = removeDeckEntryPayload(purgeTarget.deckCard);

    const candidates: MerchantChoiceCandidate[] = replacements.map((card) => ({
      choiceId: card.cardUuid,
      title: card.displayName,
      summary: "A replacement for your removed card.",
      gameObjects: [card],
      applyPayload: {
        kind: "composite",
        children: [
          remove,
          {
            kind: "add_catalog_card",
            cardUuid: card.cardUuid,
            cardNumber: card.cardNumber,
          },
        ],
      } satisfies MerchantApplyPayload,
      cardUuid: card.cardUuid,
      cardNumber: card.cardNumber,
    }));

    return {
      archetypeId: "purge_replace",
      family: "remove",
      title: `Remove ${purgeTarget.deckCard.displayName} and draft a replacement`,
      summary: "Remove a weak card and pick one of four replacements.",
      gameObjects: [
        {
          objectType: "deckCard",
          entryId: purgeTarget.entryId,
          cardUuid: purgeTarget.deckCard.cardUuid,
          cardNumber: purgeTarget.deckCard.cardNumber,
          deckEntry: purgeTarget.deckCard.deckEntry,
          card: purgeTarget.deckCard.card,
          displayName: purgeTarget.deckCard.displayName,
          badge: { label: "Removed" },
        },
      ],
      choiceRequest: {
        choiceType: "replacementCard",
        prompt: "Pick a replacement",
        candidates,
      },
      targetKey: `${purgeTarget.entryId}:${replacements.map((c) => c.cardUuid).join(",")}`,
    };
  },
};
