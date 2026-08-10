import { applyTransfigurationToCard } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { SiteType, TransfigurationType } from "../types/journey";
import { transfigurationBenefit, rewardTransfigurations } from "../journey_v2/archetypes/improve";
import { qualityOf } from "../journey_v2/signals/corpus";
import {
  dreamsignHasDeckCoverage,
  dreamsignScoreBreakdown,
} from "../journey_v2/signals/dreamsignMatch";
import { centrality, fitLooByEntry, fitScores } from "../journey_v2/signals/fit";
import type { CandidateFitScore } from "../journey_v2/signals/fit";
import { createRewardSelectionStream } from "./rng";
import { compareStableKeys, stableDigest } from "./stable";
import {
  isRewardMechanicId,
  isRewardSelectionPolicyId,
  mechanicSupportsPolicy,
} from "../../scripts/reward-selection-contracts.mjs";
import {
  SELECTION_RULES_VERSION,
  type RewardCandidateKeyKind,
  type RewardCardPredicate,
  type RewardSelectionBindings,
  type RewardSelectionCandidateTrace,
  type RewardSelectionConstraints,
  type RewardSelectionContext,
  type RewardSelectionFailure,
  type RewardSelectionOutcome,
  type RewardSelectionRequest,
  type RewardSelectionResult,
} from "./types";

interface Candidate {
  key: string;
  score: number;
  components: Record<string, number>;
  card?: CardData;
  entryId?: string;
  dreamsign?: Pick<DreamsignTemplate, "id" | "name" | "effectDescription">;
  dreamAvatarId?: string;
  siteType?: SiteType;
  transfiguration?: TransfigurationType;
}

function failure(
  request: RewardSelectionRequest,
  reason: RewardSelectionFailure["reason"],
  detail?: string,
): RewardSelectionFailure {
  return {
    ok: false,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    mechanicId: request.mechanicId,
    policyId: request.policyId,
    selectionKey: request.scope.selectionKey,
    reason,
    ...(detail === undefined ? {} : { detail }),
  };
}

function matchesPredicate(card: CardData, predicate: RewardCardPredicate): boolean {
  switch (predicate) {
    case "any":
      return true;
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return card.cardType === "Character" && card.energyCost !== null;
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function normalize(values: readonly number[]): number[] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  return Number.isFinite(span) && span > 0
    ? values.map((value) => (value - minimum) / span)
    : values.map(() => 0);
}

function bandSize(poolSize: number, fraction: number, minimum: number): number {
  return Math.min(
    poolSize,
    Math.max(Math.ceil(fraction * poolSize), Math.min(minimum, poolSize)),
  );
}

function canonicalRank(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort(
    (left, right) => right.score - left.score || compareStableKeys(left.key, right.key),
  );
}

function ordinaryCatalogCandidates(
  context: RewardSelectionContext,
  constraints: RewardSelectionConstraints,
): CardData[] {
  const customIds = new Set(
    (context.content.exploration?.customCards ?? []).map((card) => card.id),
  );
  const excluded = new Set(constraints.excludedCardUuids ?? []);
  const allowed = constraints.allowedCardUuids === undefined
    ? null
    : new Set(constraints.allowedCardUuids);
  const predicate = constraints.predicate ?? "any";
  const resolvedPool = context.draftPoolCardUuids;
  const useDraftPool =
    constraints.cardScope !== "catalog" && resolvedPool.size > 0;
  return [...context.content.cardDatabase.values()]
    .filter((card) =>
      !customIds.has(card.id) &&
      !card.isStarter &&
      card.rarity !== "Starter" &&
      card.rarity !== "Special" &&
      (allowed === null || allowed.has(card.id)) &&
      (!useDraftPool || resolvedPool.has(card.id)) &&
      (constraints.excludeOwned !== true || !context.ownedCardUuids.has(card.id)),
    )
    .filter((card) =>
      !excluded.has(card.id) &&
      matchesPredicate(card, predicate) &&
      (predicate !== "cheap-character" ||
        (card.energyCost ?? Infinity) <= context.tuning.costBands.cheapCharacterMaximum),
    )
    .sort((left, right) => compareStableKeys(left.id, right.id));
}

function cardCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
  fallback: string[],
): Candidate[] | RewardSelectionFailure {
  const constraints = request.constraints ?? {};
  if (request.policyId === "fixed") {
    const card = constraints.fixedCardUuid === undefined
      ? undefined
      : context.cardByUuid.get(constraints.fixedCardUuid);
    if (
      card === undefined ||
      !matchesPredicate(card, constraints.predicate ?? "any") ||
      (constraints.predicate === "cheap-character" &&
        (card.energyCost ?? Infinity) > context.tuning.costBands.cheapCharacterMaximum)
    ) {
      return failure(request, "fixed_target_unavailable", "fixed card is unavailable");
    }
    return [{ key: card.id, card, score: 0, components: {} }];
  }
  const cards = ordinaryCatalogCandidates(context, constraints);
  if (cards.length === 0) return failure(request, "no_legal_candidates");
  if (request.policyId === "uniform") {
    return cards.map((card) => ({ key: card.id, card, score: 0, components: {} }));
  }
  if (
    request.policyId !== "card-fit" &&
    request.policyId !== "card-fit-quality" &&
    request.policyId !== "card-bundle"
  ) {
    return failure(request, "unsupported_mechanic_policy");
  }

  const fitModel = context.content.fitModel;
  const deck = context.effectiveDeckCards.map(({ effectiveCard }) => effectiveCard);
  const scoredFit = fitModel === undefined
    ? new Map<string, CandidateFitScore>()
    : fitScores(cards, deck, fitModel);
  const fitAvailable =
    context.deckEntries.length >= context.tuning.minDeckForFit && scoredFit.size > 0;
  const corpus = context.content.merchantCorpus;
  const qualityAvailable = cards.some((card) => corpus?.cards.has(card.id) === true);
  const fitRaw = cards.map((card) => scoredFit.get(card.id)?.fit ?? 0);
  const qualityRaw = cards.map((card) =>
    corpus === undefined ? 0 : qualityOf(corpus, card.id),
  );
  const fitNormalized = normalize(fitRaw);
  const qualityNormalized = normalize(qualityRaw);

  if (request.policyId === "card-fit" || request.policyId === "card-bundle") {
    if (!fitAvailable) fallback.push("fit-unavailable");
    if (!fitAvailable && !qualityAvailable) fallback.push("quality-unavailable", "uniform");
    else if (!fitAvailable) fallback.push("quality");
    return cards.map((card, index) => {
      const score = fitAvailable
        ? fitRaw[index]
        : qualityAvailable
          ? qualityRaw[index]
          : 0;
      return {
        key: card.id,
        card,
        score,
        components: { fit: fitRaw[index], quality: qualityRaw[index] },
      };
    });
  }

  const blend = request.cardFitQualityBlend ?? context.tuning.strongBlend;
  if (!fitAvailable) fallback.push("fit-unavailable", "quality");
  if (!fitAvailable && !qualityAvailable) fallback.push("quality-unavailable", "uniform");
  return cards.map((card, index) => ({
    key: card.id,
    card,
    score: fitAvailable
      ? blend.fit * fitNormalized[index] + blend.quality * qualityNormalized[index]
      : qualityAvailable
        ? qualityRaw[index]
        : 0,
    components: {
      fit: fitNormalized[index],
      quality: qualityNormalized[index],
    },
  }));
}

function deckEntryCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): Candidate[] | RewardSelectionFailure {
  const constraints = request.constraints ?? {};
  const predicate = constraints.predicate ?? "any";
  const excludedCardUuids = new Set(constraints.excludedCardUuids ?? []);
  const excludedEntryIds = new Set(constraints.excludedDeckEntryIds ?? []);
  let entries = context.effectiveDeckCards.filter(({ entry, effectiveCard }) =>
    matchesPredicate(effectiveCard, predicate) &&
    (predicate !== "cheap-character" ||
      (effectiveCard.energyCost ?? Infinity) <= context.tuning.costBands.cheapCharacterMaximum) &&
    !excludedCardUuids.has(effectiveCard.id) &&
    !excludedEntryIds.has(entry.entryId) &&
    (constraints.allowNightmare === true || !entry.isBane) &&
    (constraints.starterOnly === true
      ? effectiveCard.isStarter
      : constraints.allowStarters === true || !effectiveCard.isStarter),
  );
  if (constraints.fixedDeckEntryId !== undefined) {
    entries = entries.filter(({ entry }) => entry.entryId === constraints.fixedDeckEntryId);
  }
  if (entries.length === 0) {
    return failure(
      request,
      constraints.fixedDeckEntryId === undefined
        ? "no_legal_candidates"
        : "fixed_target_unavailable",
    );
  }
  if (request.policyId === "fixed" || request.policyId === "uniform") {
    return entries.map(({ entry, baseCard }) => ({
      key: entry.entryId,
      entryId: entry.entryId,
      card: baseCard,
      score: 0,
      components: {},
    }));
  }

  const merchantDeck = context.effectiveDeckCards.map(({ entry, baseCard }) => ({
    objectType: "deckCard" as const,
    entryId: entry.entryId,
    cardUuid: baseCard.id,
    cardNumber: baseCard.cardNumber,
    deckEntry: entry,
    card: baseCard,
    displayName: baseCard.name,
  }));
  const loo = context.content.fitModel === undefined
    ? new Map<string, number>()
    : fitLooByEntry(merchantDeck, context.content.fitModel);

  if (request.policyId === "purge-misfit") {
    if (context.deckEntries.length < context.tuning.minDeckForPurge) {
      return failure(request, "no_legal_candidates", "deck is too small for purge policy");
    }
    const eligibleIds = new Set(entries.map(({ entry }) => entry.entryId));
    const scoredNonStarters = entries
      .filter(({ effectiveCard }) => !effectiveCard.isStarter)
      .flatMap(({ entry }) => {
        const value = loo.get(entry.entryId);
        return value === undefined ? [] : [{ entryId: entry.entryId, value }];
      })
      .sort((left, right) => left.value - right.value || compareStableKeys(left.entryId, right.entryId));
    const thresholdCount = Math.ceil(
      context.tuning.purgeMisfitFraction * scoredNonStarters.length,
    );
    const threshold = thresholdCount === 0
      ? -Infinity
      : scoredNonStarters[thresholdCount - 1]?.value ?? -Infinity;
    return entries.flatMap(({ entry, baseCard, effectiveCard }) => {
      if (!eligibleIds.has(entry.entryId)) return [];
      if (effectiveCard.isStarter) {
        return [{
          key: entry.entryId,
          entryId: entry.entryId,
          card: baseCard,
          score: 1 + context.tuning.starterPurgeBonus,
          components: { loo: 0, starter: 1, threshold },
        }];
      }
      const value = loo.get(entry.entryId);
      return value === undefined || value > threshold
        ? []
        : [{
            key: entry.entryId,
            entryId: entry.entryId,
            card: baseCard,
            score: 1 - value,
            components: { loo: value, starter: 0, threshold },
          }];
    });
  }

  if (request.policyId === "duplicate-value") {
    const corpus = context.content.merchantCorpus;
    const qualities = entries.map(({ baseCard }) =>
      corpus === undefined ? 0 : qualityOf(corpus, baseCard.id),
    );
    const looValues = entries.map(({ entry }) => loo.get(entry.entryId) ?? 0);
    const qualityNormalized = normalize(qualities);
    const looNormalized = normalize(looValues);
    return entries.map(({ entry, baseCard }, index) => ({
      key: entry.entryId,
      entryId: entry.entryId,
      card: baseCard,
      score:
        context.tuning.duplicateBlend.quality * qualityNormalized[index] +
        context.tuning.duplicateBlend.fitLoo * looNormalized[index],
      components: {
        quality: qualityNormalized[index],
        fitLoo: looNormalized[index],
      },
    }));
  }

  if (request.policyId === "deck-entry-centrality") {
    const deck = context.effectiveDeckCards.map(({ effectiveCard }) => effectiveCard);
    return entries.map(({ entry, baseCard, effectiveCard }) => {
      const score = centrality(
        effectiveCard,
        deck,
        context.content.fitModel,
        context.tuning.centrality,
      );
      return {
        key: entry.entryId,
        entryId: entry.entryId,
        card: baseCard,
        score,
        components: { centrality: score },
      };
    });
  }

  return failure(request, "unsupported_mechanic_policy");
}

function transfigurationCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): Candidate[] | RewardSelectionFailure {
  if (
    request.policyId !== "transfiguration-value" &&
    request.policyId !== "fixed" &&
    request.policyId !== "uniform"
  ) {
    return failure(request, "unsupported_mechanic_policy");
  }
  const constraints = request.constraints ?? {};
  const predicate = constraints.predicate ?? "any";
  const allowed = new Set(constraints.allowedTransfigurations ?? []);
  const deck = context.effectiveDeckCards.map(({ effectiveCard }) => effectiveCard);
  const result: Candidate[] = [];
  for (const { entry, baseCard, effectiveCard } of context.effectiveDeckCards) {
    if (
      entry.transfiguration !== null ||
      !matchesPredicate(effectiveCard, predicate) ||
      (predicate === "cheap-character" &&
        (effectiveCard.energyCost ?? Infinity) > context.tuning.costBands.cheapCharacterMaximum)
    ) continue;
    if (constraints.starterOnly === true && !effectiveCard.isStarter) continue;
    if (
      constraints.starterOnly !== true &&
      constraints.allowStarters !== true &&
      effectiveCard.isStarter
    ) continue;
    if (constraints.fixedDeckEntryId !== undefined && entry.entryId !== constraints.fixedDeckEntryId) continue;
    const forms = rewardTransfigurations(
      context.content.transfigurationData,
      baseCard,
    ).filter((form) =>
      (constraints.allowPerfected === true || form !== "Perfected") &&
      (constraints.fixedTransfiguration === undefined || form === constraints.fixedTransfiguration) &&
      (allowed.size === 0 || allowed.has(form)),
    );
    for (const form of forms) {
      const preview = applyTransfigurationToCard(
        context.content.transfigurationData,
        baseCard,
        form,
      );
      const benefit = transfigurationBenefit(
        context.content.transfigurationData,
        baseCard,
        form,
        preview,
      );
      if (benefit <= 0) continue;
      const cardCentrality = centrality(
        effectiveCard,
        deck,
        context.content.fitModel,
        context.tuning.centrality,
      );
      result.push({
        key: `${entry.entryId}:${form}`,
        entryId: entry.entryId,
        card: baseCard,
        transfiguration: form,
        score: request.policyId === "uniform"
          ? 0
          : context.tuning.transfigureBlend.benefit * benefit +
            context.tuning.transfigureBlend.centrality * cardCentrality,
        components: { benefit, centrality: cardCentrality },
      });
    }
  }
  return result.length === 0
    ? failure(request, constraints.fixedDeckEntryId === undefined
      ? "no_legal_candidates"
      : "fixed_target_unavailable")
    : result;
}

function transfiguredCatalogCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
  fallback: string[],
): Candidate[] | RewardSelectionFailure {
  const built = cardCandidates(context, request, fallback);
  if (!Array.isArray(built)) return built;
  const allowed = new Set(request.constraints?.allowedTransfigurations ?? []);
  const candidates = built.flatMap((candidate): Candidate[] => {
    if (candidate.card === undefined) return [];
    const forms = rewardTransfigurations(
      context.content.transfigurationData,
      candidate.card,
    ).filter((form) =>
      (request.constraints?.allowPerfected === true || form !== "Perfected") &&
      (request.constraints?.fixedTransfiguration === undefined ||
        form === request.constraints.fixedTransfiguration) &&
      (allowed.size === 0 || allowed.has(form)),
    );
    const ranked = forms
      .map((form) => ({
        form,
        benefit: transfigurationBenefit(
          context.content.transfigurationData,
          candidate.card!,
          form,
          applyTransfigurationToCard(
            context.content.transfigurationData,
            candidate.card!,
            form,
          ),
        ),
      }))
      .filter(({ benefit }) => benefit > 0)
      .sort((left, right) =>
        right.benefit - left.benefit || compareStableKeys(left.form, right.form),
      );
    const best = ranked[0];
    return best === undefined
      ? []
      : [{
          ...candidate,
          key: `${candidate.card.id}:${best.form}`,
          transfiguration: best.form,
          components: { ...candidate.components, transfigurationBenefit: best.benefit },
        }];
  });
  return candidates.length === 0 ? failure(request, "no_legal_candidates") : candidates;
}

function dreamsignCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
  fallback: string[],
): Candidate[] | RewardSelectionFailure {
  const fixed = request.constraints?.fixedDreamsignId;
  if (request.policyId === "fixed") {
    const dreamsign = [
      ...context.content.dreamsignTemplates,
      ...(context.content.exploration?.customDreamsigns ?? []).flatMap((candidate) =>
        candidate.id === undefined
          ? []
          : [{
              id: candidate.id,
              name: candidate.name,
              effectDescription: candidate.effectDescription,
            }],
      ),
    ].find((candidate) =>
      candidate.id === fixed && !context.heldDreamsignIds.has(candidate.id),
    );
    return dreamsign === undefined
      ? failure(request, "fixed_target_unavailable")
      : [{ key: dreamsign.id, dreamsign, score: 0, components: {} }];
  }
  const legal = context.content.dreamsignTemplates.filter((dreamsign) =>
    !context.heldDreamsignIds.has(dreamsign.id) &&
    context.remainingDreamsignIds.has(dreamsign.id),
  );
  if (request.policyId !== "dreamsign-match" && request.policyId !== "uniform") {
    return failure(request, "unsupported_mechanic_policy");
  }
  if (legal.length === 0) return failure(request, "no_legal_candidates");
  if (request.policyId === "uniform") {
    return legal.map((dreamsign) => ({
      key: dreamsign.id,
      dreamsign,
      score: 0,
      components: {},
    }));
  }
  const deck = context.effectiveDeckCards.map(({ effectiveCard }) => effectiveCard);
  const profiles = context.content.dreamsignProfiles;
  const covered = legal.filter((dreamsign) =>
    dreamsignHasDeckCoverage(
      profiles?.get(dreamsign.id),
      deck,
      context.tuning.dreamsign,
      context.tuning.costBands,
    ),
  );
  const positive = legal.filter((dreamsign) =>
    dreamsignScoreBreakdown(
      profiles?.get(dreamsign.id),
      deck,
      context.tuning.dreamsign,
      context.tuning.costBands,
    ).score > 0,
  );
  const desired = request.count;
  const pool = covered.length >= desired
    ? covered
    : positive.length >= desired
      ? positive
      : legal;
  if (pool === legal && covered.length < desired && positive.length < desired) {
    fallback.push("dreamsign-signal-free");
  } else if (pool === positive) {
    fallback.push("dreamsign-generic");
  }
  return pool.map((dreamsign) => {
    const breakdown = dreamsignScoreBreakdown(
      profiles?.get(dreamsign.id),
      deck,
      context.tuning.dreamsign,
      context.tuning.costBands,
    );
    return {
      key: dreamsign.id,
      dreamsign,
      score: breakdown.score,
      components: {
        meanCoverage: breakdown.meanCoverage,
        featureCount: breakdown.featureCount,
        qualityWeight: breakdown.qualityWeight,
        featureless: breakdown.featureless ? 1 : 0,
      },
    };
  });
}

function otherCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): Candidate[] | RewardSelectionFailure {
  if (request.mechanicId === "choose-dream-avatar") {
    if (request.policyId !== "uniform") return failure(request, "unsupported_mechanic_policy");
    const excluded = new Set(request.constraints?.excludedDreamAvatarIds ?? []);
    return context.content.dreamAvatars.filter((avatar) => !excluded.has(avatar.id)).map((avatar) => ({
      key: avatar.id,
      dreamAvatarId: avatar.id,
      score: 0,
      components: {},
    }));
  }
  if (request.mechanicId === "add-site") {
    if (request.policyId !== "site-uniform") return failure(request, "unsupported_mechanic_policy");
    const configured = context.tuning.placeableSiteTypes;
    const allowed = request.constraints?.allowedSiteTypes ?? configured;
    if (
      allowed.length === 0 ||
      allowed.some((siteType) => !configured.includes(siteType))
    ) {
      return failure(request, "invalid_request", "add-site contains an unsupported site type");
    }
    return [...new Set(allowed)].sort(compareStableKeys).map((siteType) => ({
      key: siteType,
      siteType,
      score: 0,
      components: {},
    }));
  }
  return failure(request, "unsupported_mechanic_policy");
}

function candidatesFor(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
  fallback: string[],
): Candidate[] | RewardSelectionFailure {
  switch (request.mechanicId) {
    case "gain-card":
    case "catalog-card-chooser":
    case "pack-chooser":
      return cardCandidates(context, request, fallback);
    case "transfigured-card-chooser":
      return transfiguredCatalogCandidates(context, request, fallback);
    case "gain-dreamsign":
      return dreamsignCandidates(context, request, fallback);
    case "transfigure-deck-entry":
      return transfigurationCandidates(context, request);
    case "purge-deck-entry":
    case "purge-for-essence":
    case "replace-deck-entry":
    case "duplicate-deck-entry":
    case "change-entry-subtype":
      return deckEntryCandidates(context, request);
    case "choose-dream-avatar":
    case "add-site":
      return otherCandidates(context, request);
    case "purge-and-duplicate":
    case "transfigure-deck-for-essence":
    case "change-deck-subtype":
    case "gain-nightmare-and-card":
    case "next-site-transfiguration":
    case "gain-essence-by-deck-predicate":
    case "increase-deck-spark":
    case "purge-dreamsign-for-essence":
    case "make-deck-fast":
    case "reduce-deck-cost-and-add-nightmares":
    case "next-battle-modifier":
    case "purge-duplicates-and-grant-reclaim":
      return failure(request, "unsupported_mechanic_policy");
  }
}

function keyKind(request: RewardSelectionRequest): RewardCandidateKeyKind {
  switch (request.mechanicId) {
    case "gain-card":
    case "catalog-card-chooser":
    case "pack-chooser":
    case "transfigured-card-chooser":
      return "cardUuid";
    case "gain-dreamsign":
      return "dreamsignId";
    case "transfigure-deck-entry":
    case "transfigure-deck-for-essence":
      return "entryModification";
    case "purge-deck-entry":
    case "purge-for-essence":
    case "purge-and-duplicate":
    case "replace-deck-entry":
    case "duplicate-deck-entry":
    case "change-entry-subtype":
      return "entryId";
    case "change-deck-subtype":
    case "next-site-transfiguration":
    case "next-battle-modifier":
      return "entryModification";
    case "gain-nightmare-and-card":
      return "cardUuid";
    case "gain-essence-by-deck-predicate":
    case "increase-deck-spark":
    case "make-deck-fast":
    case "reduce-deck-cost-and-add-nightmares":
    case "purge-duplicates-and-grant-reclaim":
      return "entryId";
    case "purge-dreamsign-for-essence":
      return "dreamsignId";
    case "choose-dream-avatar":
      return "dreamAvatarId";
    case "add-site":
      return "siteType";
  }
}

function tuningFor(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): {
  fraction: number;
  minimum: number;
  values: Record<string, number>;
} {
  if (request.policyId === "fixed") return { fraction: 1, minimum: 1, values: {} };
  if (request.policyId === "uniform" || request.policyId === "site-uniform") {
    return { fraction: 1, minimum: request.count, values: {} };
  }
  if (request.policyId === "dreamsign-match") {
    const minimum = Math.max(request.count, context.tuning.dreamsignBandMinimum);
    return {
      fraction: context.tuning.dreamsignBandFraction,
      minimum,
      values: {
        dreamsignBandFraction: context.tuning.dreamsignBandFraction,
        dreamsignBandMinimum: context.tuning.dreamsignBandMinimum,
      },
    };
  }
  const required = request.mechanicId === "pack-chooser"
    ? request.count * (request.packSize ?? 0)
    : request.count;
  const values: Record<string, number> = {};
  if (request.policyId === "card-fit-quality") {
    const blend = request.cardFitQualityBlend ?? context.tuning.strongBlend;
    values.fitWeight = blend.fit;
    values.qualityWeight = blend.quality;
  }
  if (request.policyId === "duplicate-value") {
    values.qualityWeight = context.tuning.duplicateBlend.quality;
    values.fitLooWeight = context.tuning.duplicateBlend.fitLoo;
  }
  if (request.policyId === "transfiguration-value") {
    values.benefitWeight = context.tuning.transfigureBlend.benefit;
    values.centralityWeight = context.tuning.transfigureBlend.centrality;
  }
  if (request.policyId === "card-bundle") {
    values.seedWeight = context.tuning.bundleBlend.seed;
    values.bundleWeight = context.tuning.bundleBlend.bundle;
    values.fitWeight = context.tuning.bundleBlend.fit;
  }
  if (request.policyId === "purge-misfit") {
    values.purgeMisfitFraction = context.tuning.purgeMisfitFraction;
    values.starterPurgeBonus = context.tuning.starterPurgeBonus;
  }
  const usesStrongBand =
    request.mechanicId === "gain-card" && request.policyId === "card-fit-quality";
  return {
    fraction: usesStrongBand
      ? context.tuning.strongBandFraction
      : context.tuning.bandFraction,
    minimum: request.policyId === "card-bundle"
      ? Math.max(context.tuning.bandMinimum, required)
      : usesStrongBand
        ? context.tuning.strongBandMinimum
        : context.tuning.bandMinimum,
    values,
  };
}

function bindingsFor(
  selected: readonly Candidate[],
  request: RewardSelectionRequest,
): RewardSelectionBindings {
  const cards = selected.flatMap((candidate) => candidate.card === undefined ? [] : [candidate.card]);
  const packSize = request.packSize ?? 0;
  const packs = request.mechanicId === "pack-chooser" && packSize > 0
    ? Array.from({ length: request.count }, (_, index) =>
        cards.slice(index * packSize, (index + 1) * packSize).map((card) => card.id),
      )
    : [];
  return {
    cardUuids: cards.map((card) => card.id),
    cardNumbers: cards.map((card) => card.cardNumber),
    deckEntryIds: selected.flatMap((candidate) =>
      candidate.entryId === undefined ? [] : [candidate.entryId],
    ),
    dreamsignIds: selected.flatMap((candidate) =>
      candidate.dreamsign === undefined ? [] : [candidate.dreamsign.id],
    ),
    dreamAvatarIds: selected.flatMap((candidate) =>
      candidate.dreamAvatarId === undefined ? [] : [candidate.dreamAvatarId],
    ),
    siteTypes: selected.flatMap((candidate) =>
      candidate.siteType === undefined ? [] : [candidate.siteType],
    ),
    transfigurations: selected.flatMap((candidate) =>
      candidate.transfiguration === undefined || candidate.card === undefined
        ? []
        : [{
            ...(candidate.entryId === undefined ? {} : { entryId: candidate.entryId }),
            cardUuid: candidate.card.id,
            cardNumber: candidate.card.cardNumber,
            transfiguration: candidate.transfiguration,
          }],
    ),
    packs,
  };
}

export function selectReward(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): RewardSelectionOutcome {
  if (
    !isRewardMechanicId(request.mechanicId) ||
    !isRewardSelectionPolicyId(request.policyId) ||
    !mechanicSupportsPolicy(request.mechanicId, request.policyId)
  ) {
    return failure(request, "invalid_request", "unknown or incompatible mechanic/policy contract");
  }
  const required = request.mechanicId === "pack-chooser"
    ? request.count * (request.packSize ?? 0)
    : request.count;
  if (
    request.scope.journeySeed !== context.journeySeed ||
    request.scope.siteUuid !== context.site.id ||
    request.scope.selectionKey.length === 0 ||
    !Number.isInteger(request.count) ||
    request.count <= 0 ||
    !Number.isInteger(required) ||
    required <= 0
  ) {
    return failure(request, "invalid_request");
  }
  const fallback: string[] = [];
  const built = candidatesFor(context, request, fallback);
  if (!Array.isArray(built)) return built;
  const candidates = canonicalRank(built);
  if (candidates.length === 0) return failure(request, "no_legal_candidates");

  const tuning = tuningFor(context, request);
  const size = bandSize(candidates.length, tuning.fraction, tuning.minimum);
  if (size < required && request.upTo !== true) {
    return failure(
      request,
      "insufficient_candidates",
      `required ${String(required)} candidates but band contains ${String(size)}`,
    );
  }
  const targetCount = request.upTo === true ? Math.min(required, size) : required;
  if (targetCount === 0) return failure(request, "insufficient_candidates");
  const band = candidates.slice(0, size);
  const candidateStream = createRewardSelectionStream(request, "candidate");
  const packStream = request.mechanicId === "pack-chooser"
    ? createRewardSelectionStream(request, "pack")
    : null;
  const bundleGrowthStream = request.policyId === "card-bundle"
    ? createRewardSelectionStream(request, "bundle-growth")
    : null;
  const samplingStream = packStream ?? candidateStream;
  const remaining = [...band];
  const selected: Candidate[] = [];
  while (selected.length < targetCount) {
    if (remaining.length === 0) break;
    if (request.policyId === "card-bundle" && selected.length > 0) {
      const seed = selected[0]?.card;
      const bundleCards = selected.flatMap((candidate) =>
        candidate.card === undefined ? [] : [candidate.card],
      );
      const candidateCards = remaining.flatMap((candidate) =>
        candidate.card === undefined ? [] : [candidate.card],
      );
      const fitModel = context.content.fitModel;
      const seedScores = seed === undefined || fitModel === undefined
        ? new Map<string, CandidateFitScore>()
        : fitScores(candidateCards, [seed], fitModel);
      const bundleScores = fitModel === undefined
        ? new Map<string, CandidateFitScore>()
        : fitScores(candidateCards, bundleCards, fitModel);
      const blend = context.tuning.bundleBlend;
      remaining.sort((left, right) => {
        const leftScore =
          blend.seed * (seedScores.get(left.card?.id ?? "")?.cooccur ?? 0) +
          blend.bundle * (bundleScores.get(left.card?.id ?? "")?.cooccur ?? 0) +
          blend.fit * (left.components.fit ?? 0);
        const rightScore =
          blend.seed * (seedScores.get(right.card?.id ?? "")?.cooccur ?? 0) +
          blend.bundle * (bundleScores.get(right.card?.id ?? "")?.cooccur ?? 0) +
          blend.fit * (right.components.fit ?? 0);
        return rightScore - leftScore || compareStableKeys(left.key, right.key);
      });
      const growBandSize = Math.min(
        context.tuning.bundleGrowthBandSize,
        remaining.length,
      );
      const growIndex = Math.min(
        Math.floor((bundleGrowthStream ?? candidateStream).draw() * growBandSize),
        growBandSize - 1,
      );
      const [candidate] = remaining.splice(growIndex, 1);
      if (candidate !== undefined) selected.push(candidate);
      continue;
    }
    const index = Math.min(
      Math.floor(samplingStream.draw() * remaining.length),
      remaining.length - 1,
    );
    const [candidate] = remaining.splice(index, 1);
    if (candidate !== undefined) {
      selected.push(candidate);
      if (
        request.constraints?.distinctDeckEntries === true &&
        candidate.entryId !== undefined
      ) {
        for (let remainingIndex = remaining.length - 1; remainingIndex >= 0; remainingIndex -= 1) {
          if (remaining[remainingIndex]?.entryId === candidate.entryId) {
            remaining.splice(remainingIndex, 1);
          }
        }
      }
    }
  }
  if (selected.length < targetCount && request.upTo !== true) {
    return failure(request, "insufficient_candidates");
  }
  const selectedKeys = selected.map((candidate) => candidate.key);
  const selectedSet = new Set(selectedKeys);
  const traceRows = band.map((candidate): RewardSelectionCandidateTrace => ({
    key: candidate.key,
    score: candidate.score,
    components: candidate.components,
    ...(candidate.card === undefined
      ? {}
      : { cardUuid: candidate.card.id, cardNumber: candidate.card.cardNumber }),
    ...(candidate.entryId === undefined ? {} : { entryId: candidate.entryId }),
    ...(candidate.dreamsign === undefined
      ? {}
      : { dreamsignId: candidate.dreamsign.id }),
    ...(candidate.dreamAvatarId === undefined
      ? {}
      : { dreamAvatarId: candidate.dreamAvatarId }),
    ...(candidate.siteType === undefined ? {} : { siteType: candidate.siteType }),
    ...(candidate.transfiguration === undefined
      ? {}
      : { transfiguration: candidate.transfiguration }),
    ...(candidate.card === undefined
      ? {}
      : { inDraftPool: context.draftPoolCardUuids.has(candidate.card.id) }),
    inBand: true,
    selected: selectedSet.has(candidate.key),
  }));
  const effectiveDeck = context.effectiveDeckCards
    .map(({ entry, baseCard }) => ({
      entryId: entry.entryId,
      cardUuid: baseCard.id,
      cardNumber: baseCard.cardNumber,
      transfiguration: entry.transfiguration,
    }))
    .sort((left, right) => compareStableKeys(left.entryId, right.entryId));
  const candidateDigest = stableDigest(
    candidates.map(({ key, score, components }) => ({ key, score, components })),
  );
  const bindings = bindingsFor(selected, request);
  const streams = [candidateStream, packStream, bundleGrowthStream]
    .filter((stream): stream is NonNullable<typeof stream> => stream !== null)
    .filter((stream) => stream.drawsConsumed() > 0)
    .map((stream) => ({
      purpose: stream.saltParts[stream.saltParts.length - 1] ?? "candidate",
      saltParts: stream.saltParts,
      drawsConsumed: stream.drawsConsumed(),
    }));
  const primaryStream = packStream ?? candidateStream;
  const trace = {
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    mechanicId: request.mechanicId,
    policyId: request.policyId,
    selectionKey: request.scope.selectionKey,
    keyKind: keyKind(request),
    saltParts: primaryStream.saltParts,
    purpose: primaryStream.saltParts[primaryStream.saltParts.length - 1] ?? "candidate",
    drawsConsumed: primaryStream.drawsConsumed(),
    streams,
    constraints: request.constraints ?? {},
    candidateCount: candidates.length,
    candidateDigest,
    band: {
      fraction: tuning.fraction,
      minimum: tuning.minimum,
      size,
      cutoffScore: band[band.length - 1]?.score ?? null,
      candidates: traceRows,
    },
    selectedKeys,
    fallback,
    tuning: tuning.values,
    effectiveDeck,
    effectiveDeckDigest: stableDigest(effectiveDeck),
  } as const;
  const result: RewardSelectionResult = {
    ok: true,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    mechanicId: request.mechanicId,
    policyId: request.policyId,
    selectionKey: request.scope.selectionKey,
    signature: stableDigest({
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
      mechanicId: request.mechanicId,
      policyId: request.policyId,
      selectionKey: request.scope.selectionKey,
      bindings,
    }),
    bindings,
    trace,
  };
  return result;
}
