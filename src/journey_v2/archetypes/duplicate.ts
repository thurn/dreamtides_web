import { fitLooByEntry } from "../signals/fit";
import { multiplicityOf } from "../signals/corpus";
import { bandSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type {
  MerchantApplyPayload,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeckCard,
} from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/**
 * A duplicate candidate: a non-starter deck entry with multiplicity >=
 * `duplicateMultiplicityMin`, plus its blended signal score.
 */
interface DuplicateCandidate {
  deckCard: MerchantDeckCard;
  entryId: string;
  signal: number;
}

/**
 * Returns all non-starter deck entries whose card has multiplicity >=
 * `duplicateMultiplicityMin`, scored by
 * `duplicateBlend.multiplicity * multiplicityNorm + duplicateBlend.fitLoo * fitLooNorm`.
 *
 * FitLoo scores come from `fitLooByEntry`, normalized over the candidate set.
 * Multiplicity values are normalized over the candidate set.
 * Missing fitLoo entries default to 0 (no corpus signal for that card →
 * neutral fit contribution).
 */
function duplicateCandidates(context: MerchantContext): readonly DuplicateCandidate[] {
  const corpus = context.merchantCorpus;
  if (corpus === undefined) return [];

  // Filter non-starters with sufficient multiplicity.
  const eligible = context.deckCards.filter((dc) => {
    if (dc.card.isStarter) return false;
    return multiplicityOf(corpus, dc.cardUuid) >= MERCHANT_TUNING.duplicateMultiplicityMin;
  });
  if (eligible.length === 0) return [];

  // Compute LOO scores for ALL deck cards (not just eligible), then look up
  // per-entry scores for eligible ones.
  const fitModel = context.fitModel;
  const looScores: Map<string, number> =
    fitModel !== undefined ? fitLooByEntry(context.deckCards, fitModel) : new Map<string, number>();

  // Raw multiplicity values for eligible entries.
  const multiplicities = eligible.map((dc) =>
    multiplicityOf(corpus, dc.cardUuid),
  );
  const looValues = eligible.map((dc) => looScores.get(dc.entryId) ?? 0);

  // Min-max normalize within the eligible set.
  const multNorm = minMaxNormalize(multiplicities);
  const looNorm = minMaxNormalize(looValues);

  const blend = MERCHANT_TUNING.duplicateBlend;
  return eligible.map((dc, i) => ({
    deckCard: dc,
    entryId: dc.entryId,
    signal: blend.multiplicity * multNorm[i] + blend.fitLoo * looNorm[i],
  }));
}

/** Min-max normalize to [0, 1]; constant input maps to 0. */
function minMaxNormalize(values: readonly number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return values.map(() => 0);
  }
  return values.map((v) => (v - min) / span);
}

// ---------------------------------------------------------------------------
// duplicate builder
// ---------------------------------------------------------------------------

/**
 * `duplicate` — *Duplicate a deck card (pick 1 of up to 3).*
 *
 * Candidates: non-starter deck entries with
 * `multiplicityOf(card) >= duplicateMultiplicityMin`. Signal:
 * `duplicateBlend.multiplicity * multiplicityNorm + duplicateBlend.fitLoo *
 * fitLooNorm` (cards real decks run as multiples, weighted toward ones that
 * pull with this deck). Band-sample up to 3 as a face-up chooser; a single
 * candidate renders as a direct offer. Eligible when >= 1 candidate exists.
 */
export const duplicateBuilder: MerchantArchetypeBuilder = {
  archetypeId: "duplicate",
  family: "duplicate",

  eligible(context: MerchantContext): boolean {
    return duplicateCandidates(context).length > 0;
  },

  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const candidates = duplicateCandidates(context);
    if (candidates.length === 0) return null;

    // Band-sample up to 3.
    const sampled = bandSample(
      candidates,
      (entry) => entry.signal,
      3,
      rng,
    );
    if (sampled.length === 0) return null;

    // Build payloads.
    const duplicatePayload = (dc: MerchantDeckCard): Extract<MerchantApplyPayload, { kind: "duplicate_deck_entry" }> => ({
      kind: "duplicate_deck_entry",
      entryId: dc.entryId,
      cardUuid: dc.cardUuid,
      cardNumber: dc.cardNumber,
    });

    if (sampled.length === 1) {
      // Single candidate → direct offer.
      const target = sampled[0];
      return {
        archetypeId: "duplicate",
        family: "duplicate",
        title: `Duplicate ${target.deckCard.displayName}`,
        summary: "Add another copy of a deck card.",
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
        hiddenUntilCommit: false,
        applyPayload: duplicatePayload(target.deckCard),
        targetKey: target.entryId,
      };
    }

    // Multiple candidates → chooser.
    const choiceCandidates: MerchantChoiceCandidate[] = sampled.map((entry) => ({
      choiceId: entry.entryId,
      title: entry.deckCard.displayName,
      summary: "Duplicate this card.",
      gameObjects: [
        {
          objectType: "deckCard",
          entryId: entry.entryId,
          cardUuid: entry.deckCard.cardUuid,
          cardNumber: entry.deckCard.cardNumber,
          deckEntry: entry.deckCard.deckEntry,
          card: entry.deckCard.card,
          displayName: entry.deckCard.displayName,
        },
      ],
      applyPayload: duplicatePayload(entry.deckCard),
    }));

    return {
      archetypeId: "duplicate",
      family: "duplicate",
      title: "Duplicate a deck card",
      summary: "Pick a card from your deck to duplicate.",
      gameObjects: [],
      hiddenUntilCommit: false,
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Pick 1 of up to 3",
        candidates: choiceCandidates,
      },
      targetKey: sampled.map((e) => e.entryId).join(","),
    };
  },
};
