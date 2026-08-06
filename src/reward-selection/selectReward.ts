import { applyTransfigurationToCard } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { SiteType, TransfigurationType } from "../types/journey";
import { transfigurationBenefit, merchantTransfigurations } from "../journey_v2/archetypes/improve";
import { qualityOf } from "../journey_v2/signals/corpus";
import {
  dreamsignHasDeckCoverage,
  dreamsignScoreBreakdown,
} from "../journey_v2/signals/dreamsignMatch";
import { centrality, fitLooByEntry, fitScores } from "../journey_v2/signals/fit";
import type { CandidateFitScore } from "../journey_v2/signals/fit";
import { MERCHANT_TUNING } from "../journey_v2/tuning";
import { createRewardSelectionStream } from "./rng";
import { compareStableKeys, stableDigest } from "./stable";
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
  dreamsign?: DreamsignTemplate;
  dreamAvatarId?: string;
  siteType?: SiteType;
  transfiguration?: TransfigurationType;
}

const DEFAULT_SITE_TYPES: readonly SiteType[] = [
  "Shop",
  "Purge",
  "Transfiguration",
  "Duplication",
];

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
      return card.cardType === "Character" && card.energyCost !== null && card.energyCost <= 2;
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
    .filter((card) => !excluded.has(card.id) && matchesPredicate(card, predicate))
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
    if (card === undefined || !matchesPredicate(card, constraints.predicate ?? "any")) {
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
    context.deckEntries.length >= MERCHANT_TUNING.minDeckForFit && scoredFit.size > 0;
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

  const blend = request.cardFitQualityBlend ?? MERCHANT_TUNING.strongBlend;
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
    if (context.deckEntries.length < MERCHANT_TUNING.minDeckForPurge) {
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
      MERCHANT_TUNING.purgeMisfitFraction * scoredNonStarters.length,
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
          score: 1 + MERCHANT_TUNING.starterPurgeBonus,
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
        MERCHANT_TUNING.duplicateBlend.quality * qualityNormalized[index] +
        MERCHANT_TUNING.duplicateBlend.fitLoo * looNormalized[index],
      components: {
        quality: qualityNormalized[index],
        fitLoo: looNormalized[index],
      },
    }));
  }

  if (request.policyId === "deck-entry-centrality") {
    const deck = context.effectiveDeckCards.map(({ effectiveCard }) => effectiveCard);
    return entries.map(({ entry, baseCard, effectiveCard }) => {
      const score = centrality(effectiveCard, deck, context.content.fitModel);
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
    if (entry.transfiguration !== null || !matchesPredicate(effectiveCard, predicate)) continue;
    if (constraints.starterOnly === true && !effectiveCard.isStarter) continue;
    if (
      constraints.starterOnly !== true &&
      constraints.allowStarters !== true &&
      effectiveCard.isStarter
    ) continue;
    if (constraints.fixedDeckEntryId !== undefined && entry.entryId !== constraints.fixedDeckEntryId) continue;
    const forms = merchantTransfigurations(baseCard).filter((form) =>
      (constraints.allowPerfected === true || form !== "Perfected") &&
      (constraints.fixedTransfiguration === undefined || form === constraints.fixedTransfiguration) &&
      (allowed.size === 0 || allowed.has(form)),
    );
    for (const form of forms) {
      const preview = applyTransfigurationToCard(baseCard, form);
      const benefit = transfigurationBenefit(baseCard, form, preview);
      if (benefit <= 0) continue;
      const cardCentrality = centrality(effectiveCard, deck, context.content.fitModel);
      result.push({
        key: `${entry.entryId}:${form}`,
        entryId: entry.entryId,
        card: baseCard,
        transfiguration: form,
        score: request.policyId === "uniform"
          ? 0
          : MERCHANT_TUNING.transfigureBlend.benefit * benefit +
            MERCHANT_TUNING.transfigureBlend.centrality * cardCentrality,
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
    const forms = merchantTransfigurations(candidate.card).filter((form) =>
      (request.constraints?.allowPerfected === true || form !== "Perfected") &&
      (request.constraints?.fixedTransfiguration === undefined ||
        form === request.constraints.fixedTransfiguration) &&
      (allowed.size === 0 || allowed.has(form)),
    );
    const ranked = forms
      .map((form) => ({
        form,
        benefit: transfigurationBenefit(
          candidate.card!,
          form,
          applyTransfigurationToCard(candidate.card!, form),
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
  const legal = context.content.dreamsignTemplates.filter((dreamsign) =>
    !context.heldDreamsignIds.has(dreamsign.id) &&
    (request.policyId === "fixed" || context.remainingDreamsignIds.has(dreamsign.id)),
  );
  if (request.policyId === "fixed") {
    const dreamsign = legal.find((candidate) => candidate.id === fixed);
    return dreamsign === undefined
      ? failure(request, "fixed_target_unavailable")
      : [{ key: dreamsign.id, dreamsign, score: 0, components: {} }];
  }
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
    dreamsignHasDeckCoverage(profiles?.get(dreamsign.id), deck),
  );
  const positive = legal.filter((dreamsign) =>
    dreamsignScoreBreakdown(profiles?.get(dreamsign.id), deck).score > 0,
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
    const breakdown = dreamsignScoreBreakdown(profiles?.get(dreamsign.id), deck);
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
    const allowed = request.constraints?.allowedSiteTypes ?? DEFAULT_SITE_TYPES;
    if (
      allowed.length === 0 ||
      allowed.some((siteType) => !DEFAULT_SITE_TYPES.includes(siteType))
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
    case "replace-deck-entry":
    case "duplicate-deck-entry":
    case "change-entry-subtype":
      return deckEntryCandidates(context, request);
    case "choose-dream-avatar":
    case "add-site":
      return otherCandidates(context, request);
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
      return "entryModification";
    case "purge-deck-entry":
    case "replace-deck-entry":
    case "duplicate-deck-entry":
    case "change-entry-subtype":
      return "entryId";
    case "choose-dream-avatar":
      return "dreamAvatarId";
    case "add-site":
      return "siteType";
  }
}

function tuningFor(request: RewardSelectionRequest): {
  fraction: number;
  minimum: number;
  values: Record<string, number>;
} {
  if (request.policyId === "fixed") return { fraction: 1, minimum: 1, values: {} };
  if (request.policyId === "uniform" || request.policyId === "site-uniform") {
    return { fraction: 1, minimum: request.count, values: {} };
  }
  if (request.policyId === "dreamsign-match") {
    const minimum = Math.max(request.count, request.count === 1 ? 2 : request.count);
    return {
      fraction: MERCHANT_TUNING.dreamsignBandFraction,
      minimum,
      values: { dreamsignBandFraction: MERCHANT_TUNING.dreamsignBandFraction },
    };
  }
  const required = request.mechanicId === "pack-chooser"
    ? request.count * (request.packSize ?? 0)
    : request.count;
  const values: Record<string, number> = {};
  if (request.policyId === "card-fit-quality") {
    const blend = request.cardFitQualityBlend ?? MERCHANT_TUNING.strongBlend;
    values.fitWeight = blend.fit;
    values.qualityWeight = blend.quality;
  }
  if (request.policyId === "duplicate-value") {
    values.qualityWeight = MERCHANT_TUNING.duplicateBlend.quality;
    values.fitLooWeight = MERCHANT_TUNING.duplicateBlend.fitLoo;
  }
  if (request.policyId === "transfiguration-value") {
    values.benefitWeight = MERCHANT_TUNING.transfigureBlend.benefit;
    values.centralityWeight = MERCHANT_TUNING.transfigureBlend.centrality;
  }
  if (request.policyId === "card-bundle") {
    values.seedWeight = MERCHANT_TUNING.bundleBlend.seed;
    values.bundleWeight = MERCHANT_TUNING.bundleBlend.bundle;
    values.fitWeight = MERCHANT_TUNING.bundleBlend.fit;
  }
  return {
    fraction:
      request.mechanicId === "gain-card" && request.policyId === "card-fit-quality"
        ? MERCHANT_TUNING.strongBandFraction
        : MERCHANT_TUNING.bandFraction,
    minimum: request.policyId === "card-bundle"
      ? Math.max(MERCHANT_TUNING.bandMinimum, required)
      : MERCHANT_TUNING.bandMinimum,
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

  const tuning = tuningFor(request);
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
  const stream = createRewardSelectionStream(request, "candidate");
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
      const blend = MERCHANT_TUNING.bundleBlend;
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
      const growBandSize = Math.min(5, remaining.length);
      const growIndex = Math.min(
        Math.floor(stream.draw() * growBandSize),
        growBandSize - 1,
      );
      const [candidate] = remaining.splice(growIndex, 1);
      if (candidate !== undefined) selected.push(candidate);
      continue;
    }
    const index = Math.min(
      Math.floor(stream.draw() * remaining.length),
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
  const trace = {
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    mechanicId: request.mechanicId,
    policyId: request.policyId,
    selectionKey: request.scope.selectionKey,
    keyKind: keyKind(request),
    saltParts: stream.saltParts,
    purpose: "candidate",
    drawsConsumed: stream.drawsConsumed(),
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

export { DEFAULT_SITE_TYPES as ADD_SITE_CANDIDATE_TYPES };
