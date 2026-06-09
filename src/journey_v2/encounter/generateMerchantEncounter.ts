import { sha256 } from "js-sha256";
import { buildMerchantRewardsForNeed } from "../catalog/rewardCatalog";
import { priceMerchantReward } from "../catalog/pricing";
import { readMerchantDeck } from "../read/deckRead";
import type { CardData, Rarity } from "../../types/cards";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantEncounter,
  MerchantNeed,
  MerchantOffer,
  MerchantReward,
} from "../types";
import type {
  MerchantRewardFamily,
  MerchantRewardPrice,
} from "../catalog/pricing";

interface MerchantOfferCandidate {
  need: MerchantNeed;
  reward: MerchantReward;
  needRank: number;
  rewardRank: number;
  targetKey: string;
}

type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly StableJsonValue[]
  | { readonly [key: string]: StableJsonValue };

const OFFER_IDS = ["A", "B"] as const;

const BUILDER_FAMILY: Readonly<Record<MerchantReward["builderId"], MerchantRewardFamily>> = {
  grant_support_card: "cardGrant",
  grant_dreamsign: "dreamsign",
  transfigure_card: "transfiguration",
  purge_weak_card: "purge",
  duplicate_keystone: "duplicate",
  replace_weak_with_fit: "cardGrant",
  gain_essence: "essence",
  raise_essence_cap: "essence",
  add_reclaim_to_event: "other",
  add_fast_to_event: "other",
  reduce_reclaim_cost: "other",
  convert_event_to_role: "other",
  grant_exact_card: "cardGrant",
};

function stableJson(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

function toStableJsonValue(value: unknown): StableJsonValue {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toStableJsonValue(item));
  }
  if (typeof value === "object" && value !== undefined) {
    const source = value as Record<string, unknown>;
    const stable: Record<string, StableJsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child !== undefined && typeof child !== "function") {
        stable[key] = toStableJsonValue(child);
      }
    }
    return stable;
  }
  return null;
}

function targetKeyForNeed(need: MerchantNeed): string {
  if (need.needType === "card") return `card:${need.entryId}:${need.cardUuid}`;
  if (need.needKind === "dreamsign_gap") return `dreamsign:${need.dreamsignId}`;
  if (need.needKind === "missing_role" || need.needKind === "curve_problem") {
    return `theme:${need.themeId}:${need.role}`;
  }
  return "need:unknown";
}

function rewardHasPayload(reward: MerchantReward): boolean {
  return (
    reward.applyPayload !== undefined ||
    (reward.choiceRequest?.candidates.length ?? 0) > 0
  );
}

function buildCandidates(
  context: MerchantContext,
  needs: readonly MerchantNeed[],
): MerchantOfferCandidate[] {
  return needs.flatMap((need, needRank) =>
    buildMerchantRewardsForNeed(context, need).map((reward, rewardRank) => ({
      need,
      reward,
      needRank,
      rewardRank,
      targetKey: targetKeyForNeed(need),
    })),
  );
}

function candidateSortKey(candidate: MerchantOfferCandidate): readonly number[] {
  return [
    candidate.needRank,
    candidate.rewardRank,
    -candidate.need.score,
    -candidate.need.severity,
  ];
}

function compareCandidateBase(
  a: MerchantOfferCandidate,
  b: MerchantOfferCandidate,
): number {
  const aKey = candidateSortKey(a);
  const bKey = candidateSortKey(b);
  for (let index = 0; index < aKey.length; index += 1) {
    const delta = aKey[index] - bKey[index];
    if (delta !== 0) return delta;
  }
  return (
    a.need.needId.localeCompare(b.need.needId) ||
    a.reward.builderId.localeCompare(b.reward.builderId) ||
    a.targetKey.localeCompare(b.targetKey)
  );
}

function distinctivenessScore(
  candidate: MerchantOfferCandidate,
  selected: MerchantOfferCandidate,
): number {
  let score = 0;
  if (candidate.need.needId !== selected.need.needId) score += 8;
  if (candidate.need.needKind !== selected.need.needKind) score += 4;
  if (candidate.targetKey !== selected.targetKey) score += 3;
  if (candidate.reward.builderId !== selected.reward.builderId) score += 2;
  return score;
}

function selectCandidates(
  candidates: readonly MerchantOfferCandidate[],
): MerchantOfferCandidate[] {
  const validCandidates = candidates
    .filter((candidate) => rewardHasPayload(candidate.reward))
    .sort(compareCandidateBase);
  const first = validCandidates[0];
  if (first === undefined) return [];

  const selected = [first];
  const second = validCandidates
    .slice(1)
    .sort(
      (a, b) =>
        distinctivenessScore(b, first) - distinctivenessScore(a, first) ||
        compareCandidateBase(a, b),
    )[0];
  if (second !== undefined) selected.push(second);
  return selected;
}

function collectPayloads(payload: MerchantApplyPayload): MerchantApplyPayload[] {
  if (payload.kind !== "composite") return [payload];
  return [payload, ...payload.children.flatMap(collectPayloads)];
}

function payloadCardUuids(reward: MerchantReward): readonly string[] {
  const payloads = [
    ...(reward.applyPayload === undefined ? [] : collectPayloads(reward.applyPayload)),
    ...(reward.choiceRequest?.candidates.flatMap((candidate) =>
      collectPayloads(candidate.applyPayload),
    ) ?? []),
  ];
  return payloads
    .map((payload) => ("cardUuid" in payload ? payload.cardUuid : undefined))
    .filter((cardUuid): cardUuid is string => cardUuid !== undefined);
}

function rarityForReward(
  context: MerchantContext,
  reward: MerchantReward,
): Rarity | null {
  const rarities = payloadCardUuids(reward)
    .map((cardUuid) => context.cardByUuid.get(cardUuid)?.rarity ?? null)
    .filter((rarity): rarity is Rarity => rarity !== null);
  if (rarities.includes("Legendary")) return "Legendary";
  return rarities[0] ?? null;
}

function broadCatalogReachFor(
  context: MerchantContext,
  reward: MerchantReward,
): number {
  const chooserCount = reward.choiceRequest?.candidates.length ?? 0;
  if (chooserCount === 0 || context.candidateGrantCards.length === 0) return 0;
  return Math.min(1, chooserCount / context.candidateGrantCards.length);
}

function priceForCandidate(input: {
  context: MerchantContext;
  offerId: string;
  candidate: MerchantOfferCandidate;
}): MerchantRewardPrice {
  const { context, offerId, candidate } = input;
  const reward = candidate.reward;
  return priceMerchantReward({
    questSeed: context.questSeed,
    siteId: context.site.id,
    offerId,
    rewardBuilderId: reward.builderId,
    valueEssence: reward.valueEssence,
    currentEssence: context.essence,
    essenceCap: context.essenceCap,
    need: candidate.need,
    rewardFamily: BUILDER_FAMILY[reward.builderId],
    chooserCount: reward.choiceRequest?.candidates.length ?? 1,
    rarity: rarityForReward(context, reward),
    broadCatalogReach: broadCatalogReachFor(context, reward),
    outsidePool: false,
  });
}

function summarizeCardState(card: CardData) {
  return {
    id: card.id,
    cardNumber: card.cardNumber,
    cardType: card.cardType,
    subtype: card.subtype,
    isStarter: card.isStarter,
    rarity: card.rarity,
    energyCost: card.energyCost,
    energyCosts: card.energyCosts,
    spark: card.spark,
    sparkVariable: card.sparkVariable,
    isFast: card.isFast,
    isInterrupt: card.isInterrupt,
    reclaimCost: card.reclaimCost,
  };
}

function summarizeApplyPayload(payload: MerchantApplyPayload): unknown {
  switch (payload.kind) {
    case "add_catalog_card":
      return {
        kind: payload.kind,
        cardUuid: payload.cardUuid,
        cardNumber: payload.cardNumber,
      };
    case "add_dreamsign":
      return {
        kind: payload.kind,
        dreamsignId: payload.dreamsignId,
        dreamsignTemplateId: payload.dreamsignTemplate.id,
      };
    case "transfigure_deck_entry":
      return {
        kind: payload.kind,
        entryId: payload.entryId,
        cardUuid: payload.cardUuid,
        cardNumber: payload.cardNumber,
        transfiguration: payload.transfiguration,
        previewCard: summarizeCardState(payload.previewCard),
      };
    case "duplicate_deck_entry":
    case "remove_deck_entry":
      return {
        kind: payload.kind,
        entryId: payload.entryId,
        cardUuid: payload.cardUuid,
        cardNumber: payload.cardNumber,
      };
    case "change_deck_entry_keywords":
      return {
        kind: payload.kind,
        entryId: payload.entryId,
        cardUuid: payload.cardUuid,
        cardNumber: payload.cardNumber,
        keywords: payload.keywords,
      };
    case "change_deck_entry_type":
      return {
        kind: payload.kind,
        entryId: payload.entryId,
        cardUuid: payload.cardUuid,
        cardNumber: payload.cardNumber,
        typeChange: {
          predicateId: payload.typeChange.predicateId,
          cardType: payload.typeChange.cardType,
          subtype: payload.typeChange.subtype,
        },
      };
    case "change_essence":
    case "change_max_essence":
      return {
        kind: payload.kind,
        amount: payload.amount,
      };
    case "composite":
      return {
        kind: payload.kind,
        children: payload.children.map(summarizeApplyPayload),
      };
  }
}

function summarizeGameObject(object: MerchantReward["gameObjects"][number]) {
  switch (object.objectType) {
    case "catalogCard":
      return {
        objectType: object.objectType,
        cardUuid: object.cardUuid,
        cardNumber: object.cardNumber,
      };
    case "deckCard":
      return {
        objectType: object.objectType,
        entryId: object.entryId,
        cardUuid: object.cardUuid,
        cardNumber: object.cardNumber,
        previewCardNumber: object.previewCard?.cardNumber,
        previewCard:
          object.previewCard === undefined
            ? undefined
            : summarizeCardState(object.previewCard),
      };
    case "dreamsign":
      return {
        objectType: object.objectType,
        dreamsignId: object.dreamsignId,
        dreamsignTemplateId: object.dreamsignTemplate.id,
      };
    case "essence":
      return {
        objectType: object.objectType,
        amount: object.amount,
      };
  }
}

function summarizeReward(reward: MerchantReward) {
  return {
    builderId: reward.builderId,
    answersNeedIds: reward.answersNeedIds,
    valueEssence: reward.valueEssence,
    applyPayload:
      reward.applyPayload === undefined
        ? undefined
        : summarizeApplyPayload(reward.applyPayload),
    choiceRequest:
      reward.choiceRequest === undefined
        ? undefined
        : {
            choiceType: reward.choiceRequest.choiceType,
            candidates: reward.choiceRequest.candidates.map((candidate) => ({
              choiceId: candidate.choiceId,
              needId: candidate.needId,
              builderId: candidate.builderId,
              cardUuid: candidate.cardUuid,
              cardNumber: candidate.cardNumber,
              dreamsignId: candidate.dreamsignId,
              valueEssence: candidate.valueEssence,
              applyPayload: summarizeApplyPayload(candidate.applyPayload),
              gameObjects: candidate.gameObjects.map(summarizeGameObject),
            })),
          },
    gameObjects: reward.gameObjects.map(summarizeGameObject),
  };
}

function inputSignature(context: MerchantContext) {
  return {
    questSeed: context.questSeed,
    site: {
      id: context.site.id,
      type: context.site.type,
      isEnhanced: context.site.isEnhanced,
      isVisited: context.site.isVisited,
    },
    resources: {
      essence: context.essence,
      essenceCap: context.essenceCap,
    },
    deck: context.deckCards.map((deckCard) => ({
      entryId: deckCard.entryId,
      cardUuid: deckCard.cardUuid,
      cardNumber: deckCard.cardNumber,
      transfiguration: deckCard.deckEntry.transfiguration,
      keywordModification: deckCard.deckEntry.keywordModification,
      typeChange: deckCard.deckEntry.typeChange,
      isBane: deckCard.deckEntry.isBane,
    })),
    heldDreamsignIds: [...context.heldDreamsignIds].sort(),
  };
}

function signatureFor(
  context: MerchantContext,
  offers: readonly Omit<MerchantOffer, "encounterSignature">[],
): string {
  return sha256(
    stableJson({
      input: inputSignature(context),
      offers: offers.map((offer) => ({
        offerId: offer.offerId,
        needId: offer.needId,
        rewardBuilderId: offer.rewardBuilderId,
        price: offer.price,
        priceDetail: offer.priceDetail,
        reward: summarizeReward(offer.reward),
      })),
    }),
  );
}

function assertValidEncounter(
  encounter: MerchantEncounter,
  needs: readonly MerchantNeed[],
): void {
  if (encounter.offers.length !== OFFER_IDS.length) {
    throw new Error(
      `Dream Merchant encounter requires exactly two offers; generated ${encounter.offers.length}`,
    );
  }
  for (const [index, expectedOfferId] of OFFER_IDS.entries()) {
    const offer = encounter.offers[index];
    if (offer?.offerId !== expectedOfferId) {
      throw new Error(
        `Dream Merchant offer ${index + 1} must have id ${expectedOfferId}`,
      );
    }
  }

  const needIds = new Set(needs.map((need) => need.needId));
  const offerIds = new Set<string>();
  for (const offer of encounter.offers) {
    if (offerIds.has(offer.offerId)) {
      throw new Error(`Duplicate merchant offer id: ${offer.offerId}`);
    }
    offerIds.add(offer.offerId);
    if (!needIds.has(offer.needId)) {
      throw new Error(`Merchant offer ${offer.offerId} answers unknown need ${offer.needId}`);
    }
    if (offer.rewards.length === 0) {
      throw new Error(`Merchant offer ${offer.offerId} has no rewards`);
    }
    if (!offer.reward.answersNeedIds.includes(offer.needId)) {
      throw new Error(
        `Merchant offer ${offer.offerId} reward does not answer ${offer.needId}`,
      );
    }
    if (!rewardHasPayload(offer.reward)) {
      throw new Error(`Merchant offer ${offer.offerId} has no apply payload`);
    }
    if (!Number.isFinite(offer.price) || offer.price < 0) {
      throw new Error(`Merchant offer ${offer.offerId} has invalid price`);
    }
    if (!Number.isFinite(offer.priceDetail.price)) {
      throw new Error(`Merchant offer ${offer.offerId} has invalid price detail`);
    }
  }
}

export function generateMerchantEncounter(
  context: MerchantContext,
): MerchantEncounter {
  const needs = readMerchantDeck(context);
  const selected = selectCandidates(buildCandidates(context, needs)).slice(
    0,
    OFFER_IDS.length,
  );
  if (selected.length !== OFFER_IDS.length) {
    throw new Error(
      `Dream Merchant encounter requires exactly two buildable offers; selected ${selected.length}`,
    );
  }

  const unsignedOffers = selected.map<Omit<MerchantOffer, "encounterSignature">>(
    (candidate, index) => {
      const offerId = OFFER_IDS[index];
      const priceDetail = priceForCandidate({ context, offerId, candidate });
      return {
        offerId,
        rewardBuilderId: candidate.reward.builderId,
        needId: candidate.need.needId,
        price: priceDetail.price,
        priceDetail,
        locked: priceDetail.locked,
        ...(priceDetail.lockedReason === undefined
          ? {}
          : { lockedReason: priceDetail.lockedReason }),
        reward: candidate.reward,
        rewards: [candidate.reward],
      };
    },
  );
  const encounterSignature = signatureFor(context, unsignedOffers);
  const encounter: MerchantEncounter = {
    encounterSignature,
    siteId: context.site.id,
    offers: unsignedOffers.map((offer) => ({
      ...offer,
      encounterSignature,
    })),
  };

  assertValidEncounter(encounter, needs);
  return encounter;
}
