import { dreamsignMatchScore } from "../signals/dreamsignMatch";
import { bandSample, merchantRng, weightedSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type { MerchantContext, MerchantChoiceCandidate, MerchantGameObject } from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

function deckCardData(context: MerchantContext): readonly CardData[] {
  return context.deckCards.map((deckCard) => deckCard.card);
}

function dreamsignGameObject(template: DreamsignTemplate): MerchantGameObject {
  return {
    objectType: "dreamsign",
    dreamsignId: template.id,
    dreamsignTemplate: template,
    displayName: template.name,
  };
}

/**
 * The dreamsign pool to actually sample "suited to your deck" offers from.
 *
 * A dreamsign whose profile features the deck has no card for scores 0 (see
 * {@link dreamsignMatchScore}); offering it as "suited" is exactly the bug the
 * graded scoring exists to prevent. So when any candidate carries positive
 * suitability, the pool is restricted to those — an off-archetype sign can
 * never surface. Only when nothing is suited (a cold-start deck with no signal)
 * does the full candidate list stand in.
 */
function suitedDreamsignPool(
  context: MerchantContext,
  deck: readonly CardData[],
): readonly DreamsignTemplate[] {
  const profiles = context.dreamsignProfiles;
  const suited = context.candidateDreamsigns.filter(
    (template) => dreamsignMatchScore(profiles?.get(template.id), deck) > 0,
  );
  return suited.length > 0 ? suited : context.candidateDreamsigns;
}

/** Minimum count for the `dreamsign_draft` chooser. */
const DREAMSIGN_DRAFT_MIN_COUNT = 2;
/** Maximum count for the `dreamsign_draft` chooser. */
const DREAMSIGN_DRAFT_MAX_COUNT = 4;

/**
 * Seeded-pick a chooser count in [minCount, maxCount], capped by the available
 * band size. Uses `weightedSample` with equal weights over the eligible range so
 * the count is uniform but deterministic per the caller's rng stream.
 */
function seededDreamsignCount(
  bandSize: number,
  rng: MerchantRng,
): number {
  const max = Math.min(DREAMSIGN_DRAFT_MAX_COUNT, bandSize);
  const min = Math.min(DREAMSIGN_DRAFT_MIN_COUNT, max);
  if (min >= max) return min;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return weightedSample(options, () => 1, rng) ?? min;
}

/**
 * `dreamsign` — *Gain a dreamsign suited to your deck.*
 *
 * Candidates: unheld dreamsigns (`candidateDreamsigns`). Signal: profile match
 * score against the deck. Band-sample 1 with the loose `dreamsignBandFraction`
 * (the population is small). Face-up. Eligible while >= 1 unheld dreamsign
 * exists.
 */
export const dreamsignBuilder: MerchantArchetypeBuilder = {
  archetypeId: "dreamsign",
  family: "dreamsign",
  eligible(context: MerchantContext): boolean {
    return context.candidateDreamsigns.length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const deck = deckCardData(context);
    const profiles = context.dreamsignProfiles;
    // A single "suited" offer should be one of the best-matched signs, not a
    // uniform draw from a loose band — sample a tight band over the suited pool.
    const sampled = bandSample(
      suitedDreamsignPool(context, deck),
      (template) => dreamsignMatchScore(profiles?.get(template.id), deck),
      1,
      rng,
      { bandFraction: MERCHANT_TUNING.dreamsignBandFraction, bandMinimum: 2 },
    );
    const target = sampled[0];
    if (target === undefined) return null;

    return {
      archetypeId: "dreamsign",
      family: "dreamsign",
      title: `Gain the ${target.name} dreamsign`,
      summary: "A dreamsign suited to your deck.",
      gameObjects: [dreamsignGameObject(target)],
      applyPayload: {
        kind: "add_dreamsign",
        dreamsignId: target.id,
        dreamsignTemplate: target,
      },
      targetKey: target.id,
    };
  },
};

/**
 * `dreamsign_draft` — *Pick 1 of 2–4 dreamsigns.*
 *
 * Same candidates and signal as `dreamsign`; band-sample 2–4 dreamsigns
 * (count seeded, capped by band size) as a face-up chooser. Eligible while
 * >= 2 unheld dreamsigns exist.
 */
export const dreamsignDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "dreamsign_draft",
  family: "dreamsign",
  eligible(context: MerchantContext): boolean {
    return context.candidateDreamsigns.length >= DREAMSIGN_DRAFT_MIN_COUNT;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const deck = deckCardData(context);
    const profiles = context.dreamsignProfiles;

    // Step 1: determine the band of candidates (same signal as `dreamsign`),
    // restricted to deck-suited signs so the chooser never spreads onto signs
    // the deck has no use for. We need the band size to seeded-pick the count,
    // so compute the band manually.
    const candidates = suitedDreamsignPool(context, deck);
    if (candidates.length < DREAMSIGN_DRAFT_MIN_COUNT) return null;

    // Compute band size using the same formula as bandSample
    const n = candidates.length;
    const bandFraction = MERCHANT_TUNING.dreamsignBandFraction;
    const bandMinimum = MERCHANT_TUNING.bandMinimum;
    const bandSize = Math.min(
      n,
      Math.max(Math.ceil(bandFraction * n), Math.min(bandMinimum, n)),
    );

    // Step 2: seeded count in [2, min(4, bandSize)] — use a separate rng stream
    // with a distinct salt so count and target sampling are independent.
    const countRng = merchantRng(
      context.questSeed,
      context.site.id,
      "dreamsign_draft",
      "count",
    );
    const count = seededDreamsignCount(bandSize, countRng);
    if (count < DREAMSIGN_DRAFT_MIN_COUNT) return null;

    // Step 3: band-sample `count` dreamsigns
    const sampled = bandSample(
      candidates,
      (template) => dreamsignMatchScore(profiles?.get(template.id), deck),
      count,
      rng,
      { bandFraction: MERCHANT_TUNING.dreamsignBandFraction },
    );

    if (sampled.length < DREAMSIGN_DRAFT_MIN_COUNT) return null;

    // Step 4: build the chooser candidates
    const choiceCandidates: MerchantChoiceCandidate[] = sampled.map(
      (template): MerchantChoiceCandidate => ({
        choiceId: template.id,
        title: template.name,
        summary: "A dreamsign suited to your deck.",
        gameObjects: [dreamsignGameObject(template)],
        applyPayload: {
          kind: "add_dreamsign",
          dreamsignId: template.id,
          dreamsignTemplate: template,
        },
        dreamsignId: template.id,
      }),
    );

    // targetKey = ids joined (stable identity for metrics; first id when 1 sampled)
    const targetKey = sampled.map((t) => t.id).join(",");

    return {
      archetypeId: "dreamsign_draft",
      family: "dreamsign",
      title: `Pick a dreamsign (1 of ${String(sampled.length)})`,
      summary: "Choose a dreamsign suited to your deck.",
      gameObjects: sampled.map(dreamsignGameObject),
      choiceRequest: {
        choiceType: "dreamsign",
        prompt: "Choose a dreamsign",
        candidates: choiceCandidates,
      },
      targetKey,
    };
  },
};
