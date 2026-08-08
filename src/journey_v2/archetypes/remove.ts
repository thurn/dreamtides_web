import { fitLooByEntry } from "../signals/fit";
import type { MerchantRng } from "../signals/rng";
import {
  assembleOfferTrace,
  deckEntryTraceCandidates,
} from "../trace/buildTrace";
import type { MerchantOfferTrace } from "../trace/types";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantDeckCard,
} from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";
import { augurySelectionPolicy, selectionMetadata, selectMerchantReward } from "./sharedSelection";

// ---------------------------------------------------------------------------
// Shared purge-target selection
// ---------------------------------------------------------------------------

/**
 * One candidate for purge: a deck card with its misfit score.
 *
 * Misfit score is higher for worse-fitting or starter cards. Starters get
 * `starterPurgeBonus` added so they rank near the bottom of the band even
 * without a LOO score.
 */
export interface PurgeCandidateEntry {
  deckCard: MerchantDeckCard;
  entryId: string;
  misfitScore: number;
  /** Score components behind `misfitScore`, for trace logging. */
  components: {
    misfit: number;
    /** Leave-one-out fit; null for starters (no corpus signal needed). */
    loo: number | null;
    starter: boolean;
  };
}

/** The purge candidate set plus the leave-one-out threshold used to gate it. */
export interface PurgeSelection {
  candidates: readonly PurgeCandidateEntry[];
  /** The LOO value at/below which a non-starter entry becomes purge-eligible. */
  looThreshold: number;
  /** How many entries had a corpus-derived LOO score. */
  scoredEntryCount: number;
}

/**
 * Builds the purge candidate set:
 * - Starter entries (always candidates, Nightmare excluded).
 * - Non-starter entries in the bottom `purgeMisfitFraction` of
 *   `fitLooByEntry`. Entries whose card has no corpus signal are absent from
 *   `fitLooByEntry` and therefore never included.
 *
 * Nightmare, the sole Bane card, is excluded from all candidates.
 */
export function purgeSelection(context: MerchantContext): PurgeSelection {
  const fitModel = context.fitModel;

  // Leave-one-out scores for non-starter deck cards with corpus signal.
  const looScores: Map<string, number> =
    fitModel !== undefined ? fitLooByEntry(context.deckCards, fitModel) : new Map<string, number>();

  // Determine the LOO threshold for the bottom purgeMisfitFraction.
  // Only entries that appear in looScores are considered for the fraction.
  const looValues = [...looScores.values()].sort((a, b) => a - b);
  const thresholdCount = Math.ceil(
    context.rewardSelection.tuning.purgeMisfitFraction * looValues.length,
  );
  // All entries with loo <= looThreshold qualify (worst fraction).
  // Use -Infinity when there are no scored entries so nothing qualifies.
  const looThreshold =
    thresholdCount > 0
      ? (looValues[Math.min(thresholdCount - 1, looValues.length - 1)] ?? -Infinity)
      : -Infinity;

  const candidates: PurgeCandidateEntry[] = [];

  for (const deckCard of context.deckCards) {
    // Nightmare is never a purge candidate.
    if (deckCard.deckEntry.isBane) continue;

    if (deckCard.card.isStarter) {
      // Starters are always candidates.
      // Misfit score: 1 (worst possible) + bonus to rank near the band bottom.
      const misfitScore =
        1 + context.rewardSelection.tuning.starterPurgeBonus;
      candidates.push({
        deckCard,
        entryId: deckCard.entryId,
        misfitScore,
        components: { misfit: misfitScore, loo: null, starter: true },
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
          components: { misfit: 1 - loo, loo, starter: false },
        });
      }
    }
  }

  return { candidates, looThreshold, scoredEntryCount: looValues.length };
}

/** The purge candidate set (the misfit-ranked, Nightmare-excluded deck entries). */
export function purgeCandidates(
  context: MerchantContext,
): readonly PurgeCandidateEntry[] {
  return purgeSelection(context).candidates;
}

/** Assembles the `deck_entry_rank` trace for a purge selection. */
export function purgeTrace(
  context: MerchantContext,
  selection: PurgeSelection,
  selectedEntryIds: readonly string[],
  extraNotes: readonly string[] = [],
): MerchantOfferTrace {
  return assembleOfferTrace({
    decision: "deck_entry_rank",
    keyKind: "entryId",
    candidates: deckEntryTraceCandidates(
      selection.candidates.map((candidate) => ({
        deckCard: candidate.deckCard,
        entryId: candidate.entryId,
        score: candidate.misfitScore,
        components: {
          misfit: candidate.components.misfit,
          loo: candidate.components.loo ?? 0,
          starter: candidate.components.starter ? 1 : 0,
        },
      })),
    ),
    selectedKeys: selectedEntryIds,
    selectedCount: selectedEntryIds.length,
    bandFraction: context.rewardSelection.tuning.bandFraction,
    bandMinimum: context.rewardSelection.tuning.bandMinimum,
    notes: [
      `purgeMisfitFraction=${String(context.rewardSelection.tuning.purgeMisfitFraction)}`,
      `looThreshold=${String(selection.looThreshold)}`,
      `scoredEntryCount=${String(selection.scoredEntryCount)}`,
      `starterPurgeBonus=${String(context.rewardSelection.tuning.starterPurgeBonus)}`,
      ...extraNotes,
    ],
  });
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
 * Nightmare excluded. Signal: misfit (worst first), starters get
 * `starterPurgeBonus`. Band-sample 1. Face-up. Eligible when deck size >=
 * `minDeckForPurge` and >= 1 candidate exists.
 */
export const purgeBuilder: MerchantArchetypeBuilder = {
  archetypeId: "purge",
  family: "remove",

  eligible(context: MerchantContext): boolean {
    if (
      context.deckCards.length < context.rewardSelection.tuning.minDeckForPurge
    ) return false;
    return purgeCandidates(context).length > 0;
  },

  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const selection = selectMerchantReward({
      context,
      archetypeId: "purge",
      mechanicId: "purge-deck-entry",
      policyId: augurySelectionPolicy(context, "purge"),
      request: { constraints: { allowStarters: true } },
    });
    const entryId = selection?.bindings.deckEntryIds[0];
    const target = entryId === undefined ? undefined : context.deckEntryById.get(entryId);
    if (selection === null || target === undefined) return null;

    return {
      archetypeId: "purge",
      family: "remove",
      gameObjects: [
        {
          objectType: "deckCard",
          entryId: target.entryId,
          cardUuid: target.cardUuid,
          cardNumber: target.cardNumber,
          deckEntry: target.deckEntry,
          card: target.card,
          displayName: target.displayName,
        },
      ],
      applyPayload: removeDeckEntryPayload(target),
      targetKey: target.entryId,
      ...selectionMetadata(selection),
    };
  },
};
