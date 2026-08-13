import { applyTransfigurationToCard } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { SiteType, TransfigurationType } from "../types/journey";
import {
  rewardTransfigurations,
  transfigurationBenefit,
} from "../journey_v2/archetypes/improve";
import {
  addCardVector,
  addTideIds,
  cardAffinity,
  compareRanks,
  cosineAffinity,
  mutableVector,
  rarityStrength,
  sampleSelectionBand,
  selectionBandSize,
} from "../selection/tide-affinity";
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
  rank: number[];
  score: number;
  components: Record<string, number>;
  card?: CardData;
  entryId?: string;
  dreamsign?: DreamsignTemplate;
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
    case "any": return true;
    case "character": return card.cardType === "Character";
    case "event": return card.cardType === "Event";
    case "cheap-character": return card.cardType === "Character" && card.energyCost !== null;
    case "spirit-animal": return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor": return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior": return card.cardType === "Character" && card.subtype === "Warrior";
    case "legendary": return card.rarity === "Legendary";
  }
}

function canonicalRank(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort(
    (left, right) => compareRanks(left.rank, right.rank) || compareStableKeys(left.key, right.key),
  );
}

function contextHasAffinity(context: RewardSelectionContext): boolean {
  return context.affinityContext.size > 0;
}

function ordinaryCardRank(
  context: RewardSelectionContext,
  card: CardData,
  affinityContext = context.affinityContext,
): { rank: number[]; components: Record<string, number> } {
  const affinity = cardAffinity(card.id, affinityContext, context.affinityIndex);
  const rarity = rarityStrength(card.rarity);
  return {
    rank: affinityContext.size === 0 ? [0] : [affinity, rarity],
    components: { affinity, rarity },
  };
}

function strongCardRank(
  context: RewardSelectionContext,
  card: CardData,
): { rank: number[]; components: Record<string, number> } {
  const affinity = cardAffinity(card.id, context.affinityContext, context.affinityIndex);
  const rarity = rarityStrength(card.rarity);
  return { rank: [rarity, affinity], components: { affinity, rarity } };
}

function ordinaryCatalogCandidates(
  context: RewardSelectionContext,
  constraints: RewardSelectionConstraints,
): CardData[] {
  const customIds = new Set((context.content.exploration?.customCards ?? []).map((card) => card.id));
  const excluded = new Set(constraints.excludedCardUuids ?? []);
  const allowed = constraints.allowedCardUuids === undefined
    ? null
    : new Set(constraints.allowedCardUuids);
  const predicate = constraints.predicate ?? "any";
  const useDraftPool = constraints.cardScope !== "catalog" && context.draftPoolCardUuids.size > 0;
  return [...context.content.cardDatabase.values()]
    .filter((card) =>
      !customIds.has(card.id) &&
      !card.isStarter &&
      card.rarity !== "Starter" &&
      card.rarity !== "Tutorial" &&
      card.rarity !== "Special" &&
      (allowed === null || allowed.has(card.id)) &&
      (!useDraftPool || context.draftPoolCardUuids.has(card.id)) &&
      (constraints.excludeOwned !== true || !context.ownedCardUuids.has(card.id)) &&
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
    ) return failure(request, "fixed_target_unavailable", "fixed card is unavailable");
    return [{ key: card.id, card, rank: [0], score: 0, components: {} }];
  }
  const cards = ordinaryCatalogCandidates(context, constraints);
  if (cards.length === 0) return failure(request, "no_legal_candidates");
  if (request.policyId === "uniform") {
    return cards.map((card) => ({ key: card.id, card, rank: [0], score: 0, components: {} }));
  }
  if (
    request.policyId !== "card-fit" &&
    request.policyId !== "card-fit-quality" &&
    request.policyId !== "card-bundle"
  ) return failure(request, "unsupported_mechanic_policy");

  const strong = request.policyId === "card-fit-quality";
  return cards.map((card) => {
    const ranked = strong ? strongCardRank(context, card) : ordinaryCardRank(context, card);
    return {
      key: card.id,
      card,
      rank: ranked.rank,
      score: ranked.rank[0] ?? 0,
      components: ranked.components,
    };
  });
}

function withoutCardContext(
  context: RewardSelectionContext,
  cardUuid: string,
): Map<string, number> {
  const result = mutableVector(context.affinityContext);
  for (const [tideId, weight] of context.affinityIndex.cardVectors.get(cardUuid) ?? []) {
    const next = (result.get(tideId) ?? 0) - weight;
    if (next === 0) result.delete(tideId);
    else result.set(tideId, next);
  }
  return result;
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
      constraints.fixedDeckEntryId === undefined ? "no_legal_candidates" : "fixed_target_unavailable",
    );
  }
  if (
    request.policyId === "fixed" ||
    request.policyId === "uniform"
  ) {
    return entries.map(({ entry, baseCard }) => ({
      key: entry.entryId,
      entryId: entry.entryId,
      card: baseCard,
      rank: [0],
      score: 0,
      components: {},
    }));
  }
  if (
    request.policyId === "purge-misfit" &&
    context.deckEntries.length < context.tuning.minDeckForPurge
  ) return failure(request, "no_legal_candidates", "deck is too small for purge policy");

  if (
    request.policyId !== "purge-misfit" &&
    request.policyId !== "duplicate-value" &&
    request.policyId !== "deck-entry-centrality" &&
    request.policyId !== "card-fit-quality"
  ) return failure(request, "unsupported_mechanic_policy");

  return entries.map(({ entry, baseCard, effectiveCard }) => {
    const looContext = withoutCardContext(context, effectiveCard.id);
    const affinity = cardAffinity(effectiveCard.id, looContext, context.affinityIndex);
    const rarity = rarityStrength(effectiveCard.rarity);
    const rank = request.policyId === "duplicate-value"
      ? [rarity, affinity]
      : request.policyId === "deck-entry-centrality"
        ? [affinity, rarity]
        : [-affinity];
    return {
      key: entry.entryId,
      entryId: entry.entryId,
      card: baseCard,
      rank,
      score: rank[0] ?? 0,
      components: { affinity, rarity },
    };
  });
}

function transfigurationCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): Candidate[] | RewardSelectionFailure {
  if (
    request.policyId !== "transfiguration-value" &&
    request.policyId !== "fixed" &&
    request.policyId !== "uniform"
  ) return failure(request, "unsupported_mechanic_policy");
  const constraints = request.constraints ?? {};
  const predicate = constraints.predicate ?? "any";
  const allowed = new Set(constraints.allowedTransfigurations ?? []);
  const result: Candidate[] = [];
  for (const { entry, baseCard, effectiveCard } of context.effectiveDeckCards) {
    if (
      entry.transfiguration !== null ||
      !matchesPredicate(effectiveCard, predicate) ||
      (predicate === "cheap-character" &&
        (effectiveCard.energyCost ?? Infinity) > context.tuning.costBands.cheapCharacterMaximum) ||
      (constraints.starterOnly === true && !effectiveCard.isStarter) ||
      (constraints.starterOnly !== true && constraints.allowStarters !== true && effectiveCard.isStarter) ||
      (constraints.fixedDeckEntryId !== undefined && entry.entryId !== constraints.fixedDeckEntryId)
    ) continue;
    const affinity = cardAffinity(
      effectiveCard.id,
      withoutCardContext(context, effectiveCard.id),
      context.affinityIndex,
    );
    for (const form of rewardTransfigurations(context.content.transfigurationData, baseCard)) {
      if (
        (constraints.allowPerfected !== true && form === "Perfected") ||
        (constraints.fixedTransfiguration !== undefined && form !== constraints.fixedTransfiguration) ||
        (allowed.size > 0 && !allowed.has(form))
      ) continue;
      const benefit = transfigurationBenefit(
        context.content.transfigurationData,
        baseCard,
        form,
        applyTransfigurationToCard(context.content.transfigurationData, baseCard, form),
      );
      if (benefit <= 0) continue;
      const rank = request.policyId === "transfiguration-value" ? [benefit, affinity] : [0];
      result.push({
        key: `${entry.entryId}:${form}`,
        entryId: entry.entryId,
        card: baseCard,
        transfiguration: form,
        rank,
        score: rank[0] ?? 0,
        components: { benefit, affinity },
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
): Candidate[] | RewardSelectionFailure {
  const built = cardCandidates(context, request);
  if (!Array.isArray(built)) return built;
  const allowed = new Set(request.constraints?.allowedTransfigurations ?? []);
  const result = built.flatMap((candidate): Candidate[] => {
    if (candidate.card === undefined) return [];
    const ranked = rewardTransfigurations(context.content.transfigurationData, candidate.card)
      .filter((form) =>
        (request.constraints?.allowPerfected === true || form !== "Perfected") &&
        (request.constraints?.fixedTransfiguration === undefined ||
          form === request.constraints.fixedTransfiguration) &&
        (allowed.size === 0 || allowed.has(form)),
      )
      .map((form) => ({
        form,
        benefit: transfigurationBenefit(
          context.content.transfigurationData,
          candidate.card!,
          form,
          applyTransfigurationToCard(context.content.transfigurationData, candidate.card!, form),
        ),
      }))
      .filter(({ benefit }) => benefit > 0)
      .sort((left, right) => right.benefit - left.benefit || compareStableKeys(left.form, right.form));
    const best = ranked[0];
    if (best === undefined) return [];
    const affinity = candidate.components.affinity ?? 0;
    return [{
      ...candidate,
      key: `${candidate.card.id}:${best.form}`,
      transfiguration: best.form,
      rank: [best.benefit, affinity, rarityStrength(candidate.card.rarity)],
      score: best.benefit,
      components: { ...candidate.components, transfigurationBenefit: best.benefit },
    }];
  });
  return result.length === 0 ? failure(request, "no_legal_candidates") : result;
}

function dreamsignCandidates(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): Candidate[] | RewardSelectionFailure {
  const fixed = request.constraints?.fixedDreamsignId;
  const customDreamsigns: DreamsignTemplate[] = (
    context.content.exploration?.customDreamsigns ?? []
  ).flatMap((dreamsign) => dreamsign.id === undefined
    ? []
    : [{
        id: dreamsign.id,
        name: dreamsign.name,
        effectDescription: dreamsign.effectDescription,
      }]);
  const allDreamsigns = [
    ...context.content.dreamsignTemplates,
    ...customDreamsigns,
  ];
  if (request.policyId === "fixed") {
    const dreamsign = allDreamsigns.find(
      (candidate) => candidate.id === fixed && !context.heldDreamsignIds.has(candidate.id),
    );
    return dreamsign === undefined
      ? failure(request, "fixed_target_unavailable")
      : [{ key: dreamsign.id, dreamsign, rank: [0], score: 0, components: {} }];
  }
  const legal = allDreamsigns.filter((dreamsign) =>
    !context.heldDreamsignIds.has(dreamsign.id) &&
    context.remainingDreamsignIds.has(dreamsign.id),
  );
  if (request.policyId !== "dreamsign-match" && request.policyId !== "uniform") {
    return failure(request, "unsupported_mechanic_policy");
  }
  if (legal.length === 0) return failure(request, "no_legal_candidates");
  return legal.map((dreamsign): Candidate => {
    if (request.policyId === "uniform") {
      return { key: dreamsign.id, dreamsign, rank: [0], score: 0, components: {} };
    }
    const vector = new Map<string, number>();
    addTideIds(vector, dreamsign.tideIds ?? []);
    const affinity = cosineAffinity(vector, context.affinityContext);
    const rarity = rarityStrength(dreamsign.rarity);
    const rank = contextHasAffinity(context) ? [affinity, rarity] : [0];
    return {
      key: dreamsign.id,
      dreamsign,
      rank,
      score: rank[0] ?? 0,
      components: { affinity, rarity },
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
    return context.content.dreamAvatars
      .filter((avatar) => !excluded.has(avatar.id))
      .map((avatar) => ({
        key: avatar.id,
        dreamAvatarId: avatar.id,
        rank: [0],
        score: 0,
        components: {},
      }));
  }
  if (request.mechanicId === "add-site") {
    if (request.policyId !== "site-uniform") return failure(request, "unsupported_mechanic_policy");
    const configured = context.tuning.placeableSiteTypes;
    const allowed = request.constraints?.allowedSiteTypes ?? configured;
    if (allowed.length === 0 || allowed.some((siteType) => !configured.includes(siteType))) {
      return failure(request, "invalid_request", "add-site contains an unsupported site type");
    }
    return [...new Set(allowed)].sort(compareStableKeys).map((siteType) => ({
      key: siteType,
      siteType,
      rank: [0],
      score: 0,
      components: {},
    }));
  }
  return failure(request, "unsupported_mechanic_policy");
}

function candidatesFor(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): Candidate[] | RewardSelectionFailure {
  switch (request.mechanicId) {
    case "gain-card":
    case "catalog-card-chooser":
    case "pack-chooser":
      return cardCandidates(context, request);
    case "transfigured-card-chooser":
      return transfiguredCatalogCandidates(context, request);
    case "gain-dreamsign":
      return dreamsignCandidates(context, request);
    case "transfigure-deck-entry":
      return transfigurationCandidates(context, request);
    case "purge-deck-entry":
    case "purge-for-essence":
    case "replace-deck-entry":
    case "duplicate-deck-entry":
    case "change-entry-subtype":
    case "change-entry-card-type":
      return deckEntryCandidates(context, request);
    case "choose-dream-avatar":
    case "add-site":
      return otherCandidates(context, request);
    default:
      return failure(request, "unsupported_mechanic_policy");
  }
}

function keyKind(request: RewardSelectionRequest): RewardCandidateKeyKind {
  switch (request.mechanicId) {
    case "gain-card":
    case "catalog-card-chooser":
    case "pack-chooser":
    case "transfigured-card-chooser":
    case "gain-nightmare-and-card": return "cardUuid";
    case "gain-dreamsign":
    case "purge-dreamsign-for-essence": return "dreamsignId";
    case "transfigure-deck-entry":
    case "transfigure-deck-for-essence":
    case "change-deck-subtype":
    case "next-site-transfiguration":
    case "next-battle-modifier": return "entryModification";
    case "purge-deck-entry":
    case "purge-for-essence":
    case "purge-and-duplicate":
    case "replace-deck-entry":
    case "duplicate-deck-entry":
    case "change-entry-subtype":
    case "change-entry-card-type":
    case "gain-essence-by-deck-predicate":
    case "increase-deck-spark":
    case "make-deck-fast":
    case "reduce-deck-cost-and-add-nightmares":
    case "purge-duplicates-and-grant-reclaim": return "entryId";
    case "choose-dream-avatar": return "dreamAvatarId";
    case "add-site": return "siteType";
    case "essence-mutation":
    case "shop-purchase-modifier": throw new Error("Mechanic does not select a reward candidate");
  }
}

function tuningFor(
  context: RewardSelectionContext,
  request: RewardSelectionRequest,
): { fraction: number; minimum: number; values: Record<string, number> } {
  if (request.policyId === "fixed") return { fraction: 1, minimum: 1, values: {} };
  if (request.policyId === "uniform" || request.policyId === "site-uniform") {
    return { fraction: 1, minimum: request.count, values: {} };
  }
  const selection = context.content.poolContext?.poolData.tides4Decks?.selection;
  const fraction = selection?.bandFraction ?? context.tuning.bandFraction;
  const minimum = selection?.bandMinimum ?? context.tuning.bandMinimum;
  return {
    fraction,
    minimum: Math.max(minimum, request.mechanicId === "pack-chooser"
      ? request.count * (request.packSize ?? 0)
      : request.count),
    values: { bandFraction: fraction, bandMinimum: minimum },
  };
}

function bindingsFor(
  selected: readonly Candidate[],
  request: RewardSelectionRequest,
): RewardSelectionBindings {
  const cards = selected.flatMap((candidate) => candidate.card === undefined ? [] : [candidate.card]);
  const packSize = request.packSize ?? 0;
  return {
    cardUuids: cards.map((card) => card.id),
    cardNumbers: cards.map((card) => card.cardNumber),
    deckEntryIds: selected.flatMap((candidate) => candidate.entryId === undefined ? [] : [candidate.entryId]),
    dreamsignIds: selected.flatMap((candidate) => candidate.dreamsign === undefined ? [] : [candidate.dreamsign.id]),
    dreamAvatarIds: selected.flatMap((candidate) => candidate.dreamAvatarId === undefined ? [] : [candidate.dreamAvatarId]),
    siteTypes: selected.flatMap((candidate) => candidate.siteType === undefined ? [] : [candidate.siteType]),
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
    packs: request.mechanicId === "pack-chooser" && packSize > 0
      ? Array.from({ length: request.count }, (_, index) =>
          cards.slice(index * packSize, (index + 1) * packSize).map((card) => card.id),
        )
      : [],
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
  ) return failure(request, "invalid_request", "unknown or incompatible mechanic/policy contract");
  const required = request.mechanicId === "pack-chooser"
    ? request.count * (request.packSize ?? 0)
    : request.count;
  if (
    request.scope.journeySeed !== context.journeySeed ||
    request.scope.siteUuid !== context.site.id ||
    request.scope.selectionKey.length === 0 ||
    !Number.isInteger(request.count) || request.count <= 0 ||
    !Number.isInteger(required) || required <= 0
  ) return failure(request, "invalid_request");

  const built = candidatesFor(context, request);
  if (!Array.isArray(built)) return built;
  let candidates = canonicalRank(built);
  if (candidates.length === 0) return failure(request, "no_legal_candidates");
  const tuning = tuningFor(context, request);
  const initialBandSize = selectionBandSize(candidates.length, tuning.fraction, tuning.minimum);
  if (initialBandSize < required && request.upTo !== true) {
    return failure(request, "insufficient_candidates", `required ${String(required)} candidates but band contains ${String(initialBandSize)}`);
  }
  const targetCount = request.upTo === true ? Math.min(required, initialBandSize) : required;
  const candidateStream = createRewardSelectionStream(request, "candidate");
  const packStream = request.mechanicId === "pack-chooser"
    ? createRewardSelectionStream(request, "pack")
    : null;
  const bundleStream = request.policyId === "card-bundle"
    ? createRewardSelectionStream(request, "bundle-growth")
    : null;
  const stream = packStream ?? candidateStream;
  const initialBandKeys = new Set(candidates.slice(0, initialBandSize).map((candidate) => candidate.key));
  const selected: Candidate[] = [];
  const temporaryContext = mutableVector(context.affinityContext);

  while (selected.length < targetCount && candidates.length > 0) {
    if (request.policyId === "card-bundle") {
      candidates = canonicalRank(candidates.map((candidate) => {
        if (candidate.card === undefined) return candidate;
        const ranked = ordinaryCardRank(context, candidate.card, temporaryContext);
        return {
          ...candidate,
          rank: ranked.rank,
          score: ranked.rank[0] ?? 0,
          components: ranked.components,
        };
      }));
    }
    const size = selectionBandSize(candidates.length, tuning.fraction, tuning.minimum);
    const drawStream = request.policyId !== "card-bundle"
      ? stream
      : request.mechanicId === "pack-chooser"
        ? selected.length % (request.packSize ?? 1) === 0
          ? (packStream ?? candidateStream)
          : (bundleStream ?? candidateStream)
        : selected.length === 0
          ? candidateStream
          : (bundleStream ?? candidateStream);
    const picked = sampleSelectionBand(
      candidates,
      size,
      () => drawStream.draw(),
    );
    if (picked === undefined) break;
    selected.push(picked);
    candidates = candidates.filter((candidate) => {
      if (candidate.key === picked.key) return false;
      return request.constraints?.distinctDeckEntries !== true ||
        picked.entryId === undefined || candidate.entryId !== picked.entryId;
    });
    if (request.policyId === "card-bundle" && picked.card !== undefined) {
      addCardVector(temporaryContext, picked.card.id, context.affinityIndex);
    }
  }
  if (selected.length < targetCount && request.upTo !== true) {
    return failure(request, "insufficient_candidates");
  }

  const allCandidates = canonicalRank(built);
  const selectedKeys = selected.map((candidate) => candidate.key);
  const selectedSet = new Set(selectedKeys);
  const traceRows = allCandidates.map((candidate): RewardSelectionCandidateTrace => ({
    key: candidate.key,
    score: candidate.score,
    components: candidate.components,
    ...(candidate.card === undefined ? {} : {
      cardUuid: candidate.card.id,
      cardNumber: candidate.card.cardNumber,
      inDraftPool: context.draftPoolCardUuids.has(candidate.card.id),
    }),
    ...(candidate.entryId === undefined ? {} : { entryId: candidate.entryId }),
    ...(candidate.dreamsign === undefined ? {} : { dreamsignId: candidate.dreamsign.id }),
    ...(candidate.dreamAvatarId === undefined ? {} : { dreamAvatarId: candidate.dreamAvatarId }),
    ...(candidate.siteType === undefined ? {} : { siteType: candidate.siteType }),
    ...(candidate.transfiguration === undefined ? {} : { transfiguration: candidate.transfiguration }),
    inBand: initialBandKeys.has(candidate.key),
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
  const candidateDigest = stableDigest(allCandidates.map(({ key, rank, components }) => ({ key, rank, components })));
  const bindings = bindingsFor(selected, request);
  const streams = [candidateStream, packStream, bundleStream]
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter((candidate) => candidate.drawsConsumed() > 0)
    .map((candidate) => ({
      purpose: candidate.saltParts[candidate.saltParts.length - 1] ?? "candidate",
      saltParts: candidate.saltParts,
      drawsConsumed: candidate.drawsConsumed(),
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
    candidateCount: allCandidates.length,
    candidateDigest,
    band: {
      fraction: tuning.fraction,
      minimum: tuning.minimum,
      size: initialBandSize,
      cutoffScore: allCandidates[initialBandSize - 1]?.score ?? null,
      candidates: traceRows,
    },
    selectedKeys,
    fallback: [],
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
