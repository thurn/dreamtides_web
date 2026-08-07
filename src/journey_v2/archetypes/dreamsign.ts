import {
  dreamsignHasDeckCoverage,
  dreamsignMatchScore,
  dreamsignScoreBreakdown,
} from "../signals/dreamsignMatch";
import { bandSample, merchantRng, weightedSample, type MerchantRng } from "../signals/rng";
import { auguryArchetype } from "../../data/augury-data";
import { assembleOfferTrace } from "../trace/buildTrace";
import type { MerchantDreamsignTier, MerchantOfferTrace } from "../trace/types";
import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type { MerchantContext, MerchantGameObject } from "../types";
import type { MerchantArchetypeBuilder, MerchantChoiceCandidateDraft, MerchantOfferDraft } from "./types";
import { selectionMetadata, selectMerchantReward } from "./sharedSelection";

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
 * The dreamsign pool to actually sample "suited to your deck" offers from,
 * tiered so a generic blessing never crowds out a genuine match.
 *
 * - Tier 1 — signs that genuinely share a feature with the deck
 *   ({@link dreamsignHasDeckCoverage}). When at least `minimumDesired` of these
 *   exist they are the whole pool, so an off-archetype sign (zero coverage) and
 *   a featureless generic alike are excluded: the band floor can no longer pull
 *   a "suited" generic in alongside real matches.
 * - Tier 2 — top up with every positively-scoring sign (covered signs plus
 *   featureless generics) when too few genuinely match, so the offer can still
 *   form; the covered signs remain in the pool and rank ahead of the generics.
 * - Tier 3 — a cold-start deck with no signal at all falls back to the full
 *   candidate list.
 */
function suitedDreamsignPool(
  context: MerchantContext,
  deck: readonly CardData[],
  minimumDesired: number,
): { pool: readonly DreamsignTemplate[]; tier: MerchantDreamsignTier } {
  const profiles = context.dreamsignProfiles;
  const covered = context.candidateDreamsigns.filter((template) =>
    dreamsignHasDeckCoverage(
      profiles?.get(template.id),
      deck,
      context.rewardSelection.tuning.dreamsign,
      context.rewardSelection.tuning.costBands,
    ),
  );
  if (covered.length >= minimumDesired) return { pool: covered, tier: "covered" };

  const suited = context.candidateDreamsigns.filter(
    (template) => dreamsignMatchScore(
      profiles?.get(template.id),
      deck,
      context.rewardSelection.tuning.dreamsign,
      context.rewardSelection.tuning.costBands,
    ) > 0,
  );
  if (suited.length >= minimumDesired) return { pool: suited, tier: "generic" };

  return { pool: context.candidateDreamsigns, tier: "fallback" };
}

/**
 * Builds the `dreamsign_match` trace from a sampled dreamsign pool. Each
 * candidate carries its match score plus the coverage components
 * (`meanCoverage`, `featureCount`, `qualityWeight`) the score blends, so a
 * reader sees both the chosen tier and why each sign ranked where it did.
 */
function buildDreamsignTrace(params: {
  pool: readonly DreamsignTemplate[];
  tier: MerchantDreamsignTier;
  context: MerchantContext;
  deck: readonly CardData[];
  selectedIds: readonly string[];
  selectedCount: number;
  bandFraction: number;
  bandMinimum: number;
}): MerchantOfferTrace {
  const profiles = params.context.dreamsignProfiles;
  return assembleOfferTrace({
    decision: "dreamsign_match",
    keyKind: "dreamsignId",
    dreamsignTier: params.tier,
    candidates: params.pool.map((template) => {
      const breakdown = dreamsignScoreBreakdown(
        profiles?.get(template.id),
        params.deck,
        params.context.rewardSelection.tuning.dreamsign,
        params.context.rewardSelection.tuning.costBands,
      );
      return {
        key: template.id,
        displayName: template.name,
        dreamsignId: template.id,
        score: breakdown.score,
        components: {
          meanCoverage: breakdown.meanCoverage,
          featureCount: breakdown.featureCount,
          qualityWeight: breakdown.qualityWeight,
          featureless: breakdown.featureless ? 1 : 0,
        },
      };
    }),
    selectedKeys: params.selectedIds,
    selectedCount: params.selectedCount,
    bandFraction: params.bandFraction,
    bandMinimum: params.bandMinimum,
  });
}

/**
 * Seeded-pick a chooser count in [minCount, maxCount], capped by the available
 * band size. Uses `weightedSample` with equal weights over the eligible range so
 * the count is uniform but deterministic per the caller's rng stream.
 */
function seededDreamsignCount(
  bandSize: number,
  rng: MerchantRng,
  minimum: number,
  maximum: number,
): number {
  const max = Math.min(maximum, bandSize);
  const min = Math.min(minimum, max);
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
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const selection = selectMerchantReward({
      context,
      archetypeId: "dreamsign",
      mechanicId: "gain-dreamsign",
      policyId: "dreamsign-match",
    });
    const dreamsignId = selection?.bindings.dreamsignIds[0];
    const target = dreamsignId === undefined
      ? undefined
      : context.dreamsignTemplates.find((template) => template.id === dreamsignId);
    if (selection === null || target === undefined) return null;

    return {
      archetypeId: "dreamsign",
      family: "dreamsign",
      gameObjects: [dreamsignGameObject(target)],
      applyPayload: {
        kind: "add_dreamsign",
        dreamsignId: target.id,
        dreamsignTemplate: target,
      },
      targetKey: target.id,
      ...selectionMetadata(selection),
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
    const minimum = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "dreamsign_draft",
    ).quantities.minimumChooserSize;
    return context.candidateDreamsigns.length >= minimum;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const quantities = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "dreamsign_draft",
    ).quantities;
    const deck = deckCardData(context);
    const profiles = context.dreamsignProfiles;

    // Step 1: determine the band of candidates (same signal as `dreamsign`),
    // restricted to deck-suited signs so the chooser never spreads onto signs
    // the deck has no use for. We need the band size to seeded-pick the count,
    // so compute the band manually.
    const { pool: candidates, tier } = suitedDreamsignPool(
      context,
      deck,
      quantities.minimumChooserSize,
    );
    if (candidates.length < quantities.minimumChooserSize) return null;

    // Compute band size using the same formula as bandSample
    const n = candidates.length;
    const bandFraction = context.rewardSelection.tuning.dreamsignBandFraction;
    const bandMinimum = context.rewardSelection.tuning.dreamsignBandMinimum;
    const bandSize = Math.min(
      n,
      Math.max(Math.ceil(bandFraction * n), Math.min(bandMinimum, n)),
    );

    // Step 2: seeded count in [2, min(4, bandSize)] — use a separate rng stream
    // with a distinct salt so count and target sampling are independent.
    const countRng = merchantRng(
      context.journeySeed,
      context.site.id,
      "dreamsign_draft",
      "count",
    );
    const count = seededDreamsignCount(
      bandSize,
      countRng,
      quantities.minimumChooserSize,
      quantities.maximumChooserSize,
    );
    if (count < quantities.minimumChooserSize) return null;

    // Step 3: band-sample `count` dreamsigns
    const sampled = bandSample(
      candidates,
      (template) => dreamsignMatchScore(
        profiles?.get(template.id),
        deck,
        context.rewardSelection.tuning.dreamsign,
        context.rewardSelection.tuning.costBands,
      ),
      count,
      rng,
      {
        bandFraction: context.rewardSelection.tuning.dreamsignBandFraction,
        bandMinimum: context.rewardSelection.tuning.dreamsignBandMinimum,
      },
    );

    if (sampled.length < quantities.minimumChooserSize) return null;

    // Step 4: build the chooser candidates
    const choiceCandidates: MerchantChoiceCandidateDraft[] = sampled.map(
      (template): MerchantChoiceCandidateDraft => ({
        choiceId: template.id,
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
      gameObjects: sampled.map(dreamsignGameObject),
      choiceRequest: {
        choiceType: "dreamsign",
        candidates: choiceCandidates,
      },
      targetKey,
      trace: buildDreamsignTrace({
        pool: candidates,
        tier,
        context,
        deck,
        selectedIds: sampled.map((t) => t.id),
        selectedCount: sampled.length,
        bandFraction: context.rewardSelection.tuning.dreamsignBandFraction,
        bandMinimum: context.rewardSelection.tuning.dreamsignBandMinimum,
      }),
    };
  },
};
