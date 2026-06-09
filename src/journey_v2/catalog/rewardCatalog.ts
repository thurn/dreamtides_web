import { sha256 } from "js-sha256";
import { valueEssenceForCardGrant } from "./pricing";
import type { CardData, CardType } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type { CardKeywordModification } from "../../types/quest";
import type {
  MerchantApplyPayload,
  MerchantCatalogCard,
  MerchantChoice,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeckCard,
  MerchantGameObject,
  MerchantNeed,
  MerchantReward,
  MerchantRewardBuilderId,
  MerchantRoleNeed,
  MerchantSupportMeta,
  MerchantWeakCardNeed,
} from "../types";

export type MerchantRewardOption = MerchantReward;

export interface BuildMerchantRewardsOptions {
  avoidDuplicateCardUuids?: boolean;
}

type MerchantRewardBuilder = (
  context: MerchantContext,
  need: MerchantNeed,
  options: Required<BuildMerchantRewardsOptions>,
) => MerchantReward | null;

interface ScoredCatalogCard {
  catalogCard: MerchantCatalogCard;
  score: number;
  matchScore: number;
}

const DEFAULT_BUILD_OPTIONS: Required<BuildMerchantRewardsOptions> = {
  avoidDuplicateCardUuids: true,
};

const SUPPORT_CARD_MIN_CHOICES = 3;
const SUPPORT_CARD_MAX_CHOICES = 5;
const DREAMSIGN_MIN_CHOICES = 2;
const DREAMSIGN_MAX_CHOICES = 4;

const VALUE_ESSENCE = {
  transfiguration: 85,
  purgeWeakCard: 70,
  weakReplacementBonus: 55,
  duplicateKeystone: 95,
  addReclaim: 60,
  addFast: 55,
  reduceReclaimCost: 45,
  convertType: 65,
  gainEssence: 50,
  raiseEssenceCap: 75,
} as const;

function mergeOptions(
  options: BuildMerchantRewardsOptions = {},
): Required<BuildMerchantRewardsOptions> {
  return { ...DEFAULT_BUILD_OPTIONS, ...options };
}

function stableUnit(parts: readonly string[]): number {
  const digest = sha256(parts.join("\0"));
  const value = Number.parseInt(digest.slice(0, 13), 16);
  return value / 0x10000000000000;
}

function stableTieBreak(context: MerchantContext, need: MerchantNeed, id: string): number {
  return stableUnit([context.questSeed, context.site.id, need.needId, id]);
}

function text(card: CardData): string {
  return card.renderedText.toLowerCase();
}

function roleLabel(role: MerchantRoleNeed | undefined, fallback: string): string {
  return role?.replace(/_/g, " ") ?? fallback;
}

function supportThemesForNeed(need: MerchantNeed): readonly string[] {
  if (need.needKind === "under_supported_payoff") return [need.support.theme];
  if (need.needKind === "missing_role" || need.needKind === "curve_problem") {
    return [need.support.theme, need.role].filter((theme): theme is string =>
      theme !== undefined,
    );
  }
  if (need.needKind === "dreamsign_gap") return ["dreamsign"];
  return [];
}

function roleForNeed(need: MerchantNeed): MerchantRoleNeed | undefined {
  if (need.needKind === "missing_role" || need.needKind === "curve_problem") {
    return need.role;
  }
  return undefined;
}

function cardMatchesRole(card: CardData, role: MerchantRoleNeed | undefined): boolean {
  if (role === undefined) return false;
  const renderedText = text(card);

  switch (role) {
    case "draw":
      return /\bdraw(s|ing)?\b/i.test(card.renderedText);
    case "recursion":
      return /\breclaim\b|from your void|return [^.]*from your void/i.test(renderedText);
    case "interaction":
      return /(banish|dissolve an enemy|return [^.]*to (their|its)|prevent)/i.test(
        card.renderedText,
      );
    case "cheap_early_play":
      return card.cardType === "Character" && card.energyCost !== null && card.energyCost <= 1;
    case "events":
      return card.cardType === "Event";
    case "characters":
      return card.cardType === "Character";
    case "abandon_outlet":
      return /\babandon\b/i.test(card.renderedText);
    case "finisher":
      return (card.spark ?? 0) >= 4 || /gains \+\d+/.test(renderedText);
  }
}

function supportScore(
  meta: MerchantSupportMeta | undefined,
  themes: readonly string[],
): number {
  if (meta === undefined || themes.length === 0) return 0;
  let score = 0;
  for (const theme of themes) {
    if (meta.supports?.includes(theme)) score += 2.5;
    if (meta.needs?.some((need) => need.theme === theme)) score += 0.4;
  }
  return score;
}

function fitScore(context: MerchantContext, card: CardData): number {
  const model = context.fitModel;
  if (model === undefined) return 0;
  const candidateName = model.numberToName.get(card.cardNumber);
  if (candidateName === undefined) return 0;

  const deckNames = context.deckCards
    .map((deckCard) => model.numberToName.get(deckCard.cardNumber))
    .filter((name): name is string => name !== undefined);
  const cooc =
    deckNames.length === 0
      ? 0
      : deckNames.reduce(
          (total, deckName) => total + (model.coocNorm.get(deckName)?.get(candidateName) ?? 0),
          0,
        ) / deckNames.length;
  return (model.prior.get(candidateName) ?? 0) + cooc;
}

function rarityValueScore(card: CardData): number {
  if (card.rarity === "Legendary") return 0.6;
  return 0.2;
}

function rankCatalogCards(
  context: MerchantContext,
  need: MerchantNeed,
  options: Required<BuildMerchantRewardsOptions>,
): ScoredCatalogCard[] {
  const role = roleForNeed(need);
  const themes = supportThemesForNeed(need);

  return context.candidateGrantCards
    .filter((catalogCard) =>
      options.avoidDuplicateCardUuids
        ? !context.ownedCardUuids.has(catalogCard.cardUuid)
        : true,
    )
    .map((catalogCard) => {
      const meta = context.supportMetaByUuid.get(catalogCard.cardUuid);
      const roleScore = cardMatchesRole(catalogCard.card, role) ? 1.8 : 0;
      const curveScore =
        role === "cheap_early_play" && catalogCard.card.energyCost !== null
          ? Math.max(0, 1.2 - catalogCard.card.energyCost * 0.35)
          : 0;
      const supportFit = supportScore(meta, themes);
      const modelFit = fitScore(context, catalogCard.card);
      const matchScore = supportFit + roleScore + curveScore + modelFit;
      const score =
        supportFit +
        roleScore +
        curveScore +
        modelFit +
        rarityValueScore(catalogCard.card);
      return { catalogCard, score, matchScore };
    })
    .filter((scored) => scored.matchScore > 0 || need.needKind === "weak_card")
    .sort(
      (a, b) =>
        b.score - a.score ||
        stableTieBreak(context, need, a.catalogCard.cardUuid) -
          stableTieBreak(context, need, b.catalogCard.cardUuid) ||
        a.catalogCard.cardNumber - b.catalogCard.cardNumber,
    );
}

function cardGrantPayload(catalogCard: MerchantCatalogCard): MerchantApplyPayload {
  return {
    kind: "add_catalog_card",
    cardUuid: catalogCard.cardUuid,
    cardNumber: catalogCard.cardNumber,
  };
}

function catalogChoiceCandidate(
  builderId: MerchantRewardBuilderId,
  need: MerchantNeed,
  catalogCard: MerchantCatalogCard,
  summary: string,
  applyPayload: MerchantApplyPayload = cardGrantPayload(catalogCard),
): MerchantChoiceCandidate {
  return {
    choiceId: `${builderId}:${need.needId}:${catalogCard.cardUuid}`,
    title: catalogCard.displayName,
    summary,
    needId: need.needId,
    builderId,
    gameObjects: [catalogCard],
    valueEssence: valueEssenceForCardGrant(catalogCard.card.rarity),
    applyPayload,
    cardUuid: catalogCard.cardUuid,
    cardNumber: catalogCard.cardNumber,
  };
}

function cloneDeckCard(
  deckCard: MerchantDeckCard,
  badge: MerchantDeckCard["badge"],
  previewCard?: CardData,
): MerchantDeckCard {
  return {
    ...deckCard,
    ...(badge === undefined ? {} : { badge }),
    ...(previewCard === undefined ? {} : { previewCard }),
  };
}

function targetDeckCardForNeed(
  context: MerchantContext,
  need: MerchantNeed,
): MerchantDeckCard | null {
  if (need.needType !== "card") return null;
  return context.deckEntryById.get(need.entryId) ?? null;
}

function deckCardKeywordPayload(
  deckCard: MerchantDeckCard,
  keywords: CardKeywordModification,
): MerchantApplyPayload {
  return {
    kind: "change_deck_entry_keywords",
    entryId: deckCard.entryId,
    cardUuid: deckCard.cardUuid,
    cardNumber: deckCard.cardNumber,
    keywords,
  };
}

function deckCardDuplicatePayload(deckCard: MerchantDeckCard): MerchantApplyPayload {
  return {
    kind: "duplicate_deck_entry",
    entryId: deckCard.entryId,
    cardUuid: deckCard.cardUuid,
    cardNumber: deckCard.cardNumber,
  };
}

function typeChangedPreview(
  deckCard: MerchantDeckCard,
  cardType: CardType,
  subtype: string,
): CardData {
  return {
    ...deckCard.card,
    cardType,
    subtype,
  };
}

function dreamsignDisplay(template: DreamsignTemplate): MerchantGameObject {
  return {
    objectType: "dreamsign",
    dreamsignId: template.id,
    dreamsignTemplate: template,
    displayName: template.name,
  };
}

function dreamsignRoleScore(
  template: DreamsignTemplate,
  need: MerchantNeed,
): number {
  const renderedText = template.effectDescription.toLowerCase();
  const role = roleForNeed(need);
  let score = 0;

  if (need.needKind === "dreamsign_gap") score += 1.2;
  if (role === "draw" && /\bdraw(s|ing)?\b/.test(renderedText)) score += 1.4;
  if (role === "recursion" && /\breclaim\b|void/.test(renderedText)) score += 1.4;
  if (role === "interaction" && /banish|prevent|enemy/.test(renderedText)) score += 1.2;
  if (role === "cheap_early_play" && /cost|energy|character/.test(renderedText)) score += 0.8;
  if (need.needKind === "under_supported_payoff" && renderedText.includes(need.support.theme)) {
    score += 1.2;
  }

  return score;
}

function grantSupportCard(
  context: MerchantContext,
  need: MerchantNeed,
  options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (
    need.needKind !== "under_supported_payoff" &&
    need.needKind !== "missing_role" &&
    need.needKind !== "curve_problem"
  ) {
    return null;
  }

  const candidates = rankCatalogCards(context, need, options)
    .slice(0, SUPPORT_CARD_MAX_CHOICES)
    .map((scored) =>
      catalogChoiceCandidate(
        "grant_support_card",
        need,
        scored.catalogCard,
        `Add ${scored.catalogCard.displayName} to answer ${need.label}.`,
      ),
    );
  if (candidates.length < SUPPORT_CARD_MIN_CHOICES) return null;

  return {
    builderId: "grant_support_card",
    title: `Choose ${roleLabel(roleForNeed(need), "support")}`,
    summary: `Pick a card that answers ${need.observation.summary}`,
    answersNeedIds: [need.needId],
    gameObjects: candidates.slice(0, 3).flatMap((candidate) => candidate.gameObjects),
    valueEssence: Math.max(...candidates.map((candidate) => candidate.valueEssence)),
    choiceRequest: {
      choiceType: "catalogCard",
      prompt: "Choose a card to add to your deck.",
      candidates,
    },
  };
}

function grantDreamsign(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (
    need.needKind !== "dreamsign_gap" &&
    need.needKind !== "under_supported_payoff" &&
    need.needKind !== "missing_role"
  ) {
    return null;
  }

  const candidates = [...context.candidateDreamsigns]
    .sort(
      (a, b) =>
        dreamsignRoleScore(b, need) - dreamsignRoleScore(a, need) ||
        stableTieBreak(context, need, a.id) - stableTieBreak(context, need, b.id) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, DREAMSIGN_MAX_CHOICES)
    .map<MerchantChoiceCandidate>((template) => ({
      choiceId: `grant_dreamsign:${need.needId}:${template.id}`,
      title: template.name,
      summary: template.effectDescription,
      needId: need.needId,
      builderId: "grant_dreamsign",
      gameObjects: [dreamsignDisplay(template)],
      valueEssence: 90,
      applyPayload: {
        kind: "add_dreamsign",
        dreamsignId: template.id,
        dreamsignTemplate: template,
      },
      dreamsignId: template.id,
    }));

  if (candidates.length < DREAMSIGN_MIN_CHOICES) return null;

  return {
    builderId: "grant_dreamsign",
    title: "Choose a Dreamsign",
    summary: `Pick a Dreamsign that answers ${need.observation.summary}`,
    answersNeedIds: [need.needId],
    gameObjects: candidates.slice(0, 2).flatMap((candidate) => candidate.gameObjects),
    valueEssence: Math.max(...candidates.map((candidate) => candidate.valueEssence)),
    choiceRequest: {
      choiceType: "dreamsign",
      prompt: "Choose a Dreamsign to gain.",
      candidates,
    },
  };
}

function transfigureCard(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.needKind !== "upgrade_target") return null;
  const deckCard = context.deckEntryById.get(need.entryId);
  if (deckCard === undefined) return null;

  const metric = need.projection.metric;
  const detail =
    metric?.from !== undefined && metric.to !== undefined
      ? `${metric.from} -> ${metric.to}`
      : metric?.value === undefined
        ? undefined
        : String(metric.value);
  const gameObject = cloneDeckCard(
    deckCard,
    {
      label: need.projection.transfiguration,
      ...(detail === undefined ? {} : { detail }),
    },
    need.projection.previewCard,
  );

  return {
    builderId: "transfigure_card",
    title: `${need.projection.transfiguration} transfiguration`,
    summary: need.projection.description,
    answersNeedIds: [need.needId],
    gameObjects: [gameObject],
    valueEssence: VALUE_ESSENCE.transfiguration,
    applyPayload: {
      kind: "transfigure_deck_entry",
      entryId: need.entryId,
      cardUuid: need.cardUuid,
      cardNumber: need.cardNumber,
      transfiguration: need.projection.transfiguration,
      previewCard: need.projection.previewCard,
      description: need.projection.description,
    },
  };
}

function purgeWeakCard(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.needKind !== "weak_card") return null;
  const deckCard = context.deckEntryById.get(need.entryId);
  if (deckCard === undefined) return null;

  return {
    builderId: "purge_weak_card",
    title: `Remove ${deckCard.displayName}`,
    summary: `Remove ${deckCard.displayName} from your deck.`,
    answersNeedIds: [need.needId],
    gameObjects: [cloneDeckCard(deckCard, { label: "Remove", detail: "Deck entry" })],
    valueEssence: VALUE_ESSENCE.purgeWeakCard,
    applyPayload: {
      kind: "remove_deck_entry",
      entryId: need.entryId,
      cardUuid: need.cardUuid,
      cardNumber: need.cardNumber,
    },
  };
}

function grantExactCard(
  context: MerchantContext,
  need: MerchantNeed,
  options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.confidence < 0.75) return null;
  if (
    need.needKind !== "under_supported_payoff" &&
    need.needKind !== "missing_role" &&
    need.needKind !== "curve_problem"
  ) {
    return null;
  }

  const highestRanked = rankCatalogCards(context, need, options)[0];
  if (highestRanked === undefined) return null;
  const catalogCard = highestRanked.catalogCard;

  return {
    builderId: "grant_exact_card",
    title: `Gain ${catalogCard.displayName}`,
    summary: `Add ${catalogCard.displayName} to answer ${need.label}.`,
    answersNeedIds: [need.needId],
    gameObjects: [catalogCard],
    valueEssence: valueEssenceForCardGrant(catalogCard.card.rarity),
    applyPayload: cardGrantPayload(catalogCard),
  };
}

function replacementPayload(
  weakNeed: MerchantWeakCardNeed,
  catalogCard: MerchantCatalogCard,
): MerchantApplyPayload {
  return {
    kind: "composite",
    children: [
      {
        kind: "remove_deck_entry",
        entryId: weakNeed.entryId,
        cardUuid: weakNeed.cardUuid,
        cardNumber: weakNeed.cardNumber,
      },
      cardGrantPayload(catalogCard),
    ],
  };
}

function replaceWeakWithFit(
  context: MerchantContext,
  need: MerchantNeed,
  options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.needKind !== "weak_card") return null;
  const weakDeckCard = context.deckEntryById.get(need.entryId);
  if (weakDeckCard === undefined) return null;

  const candidates = rankCatalogCards(context, need, options)
    .slice(0, SUPPORT_CARD_MAX_CHOICES)
    .map((scored) => {
      const payload = replacementPayload(need, scored.catalogCard);
      return catalogChoiceCandidate(
        "replace_weak_with_fit",
        need,
        scored.catalogCard,
        `Remove ${weakDeckCard.displayName} and add ${scored.catalogCard.displayName}.`,
        payload,
      );
    });
  if (candidates.length < SUPPORT_CARD_MIN_CHOICES) return null;

  return {
    builderId: "replace_weak_with_fit",
    title: `Replace ${weakDeckCard.displayName}`,
    summary: `Remove ${weakDeckCard.displayName} and choose a stronger fit.`,
    answersNeedIds: [need.needId],
    gameObjects: [
      cloneDeckCard(weakDeckCard, { label: "Remove", detail: "Then add a card" }),
      ...candidates.slice(0, 2).flatMap((candidate) => candidate.gameObjects),
    ],
    valueEssence:
      VALUE_ESSENCE.weakReplacementBonus +
      Math.max(...candidates.map((candidate) => candidate.valueEssence)),
    choiceRequest: {
      choiceType: "replacementCard",
      prompt: `Choose a card to replace ${weakDeckCard.displayName}.`,
      candidates,
    },
  };
}

function gainEssence(
  _context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.needType !== "theme") return null;
  return {
    builderId: "gain_essence",
    title: "Gain essence",
    summary: "Gain immediate essence for the next offer or site.",
    answersNeedIds: [need.needId],
    gameObjects: [
      {
        objectType: "essence",
        amount: VALUE_ESSENCE.gainEssence,
        badge: { label: "Gain" },
      },
    ],
    valueEssence: VALUE_ESSENCE.gainEssence,
    applyPayload: {
      kind: "change_essence",
      amount: VALUE_ESSENCE.gainEssence,
    },
  };
}

function raiseEssenceCap(
  _context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.needType !== "theme") return null;
  return {
    builderId: "raise_essence_cap",
    title: "Raise essence capacity",
    summary: "Increase maximum essence for the rest of the quest.",
    answersNeedIds: [need.needId],
    gameObjects: [
      {
        objectType: "essence",
        amount: VALUE_ESSENCE.raiseEssenceCap,
        badge: { label: "Capacity" },
      },
    ],
    valueEssence: VALUE_ESSENCE.raiseEssenceCap,
    applyPayload: {
      kind: "change_max_essence",
      amount: VALUE_ESSENCE.raiseEssenceCap,
    },
  };
}

function duplicateKeystone(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (need.needKind !== "under_supported_payoff") return null;
  const deckCard = targetDeckCardForNeed(context, need);
  if (deckCard === null) return null;

  return {
    builderId: "duplicate_keystone",
    title: `Duplicate ${deckCard.displayName}`,
    summary: `Add another copy of ${deckCard.displayName} to reinforce this deck plan.`,
    answersNeedIds: [need.needId],
    gameObjects: [cloneDeckCard(deckCard, { label: "Duplicate", detail: "Deck entry" })],
    valueEssence: VALUE_ESSENCE.duplicateKeystone,
    applyPayload: deckCardDuplicatePayload(deckCard),
  };
}

function bestDeckEvent(
  context: MerchantContext,
  predicate: (deckCard: MerchantDeckCard, card: CardData) => boolean,
): MerchantDeckCard | null {
  return (
    context.deckCards
      .filter((deckCard) => predicate(deckCard, deckCard.card))
      .sort(
        (a, b) =>
          (b.card.rarity === "Legendary" ? 1 : 0) -
            (a.card.rarity === "Legendary" ? 1 : 0) ||
          (b.card.energyCost ?? 0) - (a.card.energyCost ?? 0) ||
          a.entryId.localeCompare(b.entryId),
      )[0] ?? null
  );
}

function addReclaimToEvent(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (roleForNeed(need) !== "recursion") return null;
  const deckCard = bestDeckEvent(
    context,
    (_deckCard, card) =>
      card.cardType === "Event" &&
      (card.reclaimCost === null || card.reclaimCost === undefined),
  );
  if (deckCard === null) return null;

  return {
    builderId: "add_reclaim_to_event",
    title: `Give ${deckCard.displayName} Reclaim`,
    summary: `${deckCard.displayName} gains Reclaim 1.`,
    answersNeedIds: [need.needId],
    gameObjects: [cloneDeckCard(deckCard, { label: "Reclaim", detail: "1" })],
    valueEssence: VALUE_ESSENCE.addReclaim,
    applyPayload: deckCardKeywordPayload(deckCard, { reclaim: 1 }),
  };
}

function addFastToEvent(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (roleForNeed(need) !== "interaction") return null;
  const deckCard = bestDeckEvent(
    context,
    (_deckCard, card) => card.cardType === "Event" && !card.isFast,
  );
  if (deckCard === null) return null;

  return {
    builderId: "add_fast_to_event",
    title: `Quicken ${deckCard.displayName}`,
    summary: `${deckCard.displayName} becomes fast.`,
    answersNeedIds: [need.needId],
    gameObjects: [cloneDeckCard(deckCard, { label: "Fast" })],
    valueEssence: VALUE_ESSENCE.addFast,
    applyPayload: deckCardKeywordPayload(deckCard, { fast: true }),
  };
}

function reduceReclaimCost(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  if (roleForNeed(need) !== "recursion") return null;
  const deckCard = bestDeckEvent(
    context,
    (_deckCard, card) => card.cardType === "Event" && (card.reclaimCost ?? 0) > 1,
  );
  if (
    deckCard === null ||
    deckCard.card.reclaimCost === undefined ||
    deckCard.card.reclaimCost === null
  ) {
    return null;
  }

  const nextReclaimCost = Math.max(1, deckCard.card.reclaimCost - 1);
  return {
    builderId: "reduce_reclaim_cost",
    title: `Lower ${deckCard.displayName} Reclaim`,
    summary: `${deckCard.displayName} costs ${nextReclaimCost} to reclaim.`,
    answersNeedIds: [need.needId],
    gameObjects: [
      cloneDeckCard(deckCard, {
        label: "Reclaim",
        detail: `${deckCard.card.reclaimCost} -> ${nextReclaimCost}`,
      }),
    ],
    valueEssence: VALUE_ESSENCE.reduceReclaimCost,
    applyPayload: deckCardKeywordPayload(deckCard, { setReclaim: nextReclaimCost }),
  };
}

function convertEventToRole(
  context: MerchantContext,
  need: MerchantNeed,
  _options: Required<BuildMerchantRewardsOptions>,
): MerchantReward | null {
  const role = roleForNeed(need);
  const targetType =
    role === "events" ? "Event" : role === "characters" ? "Character" : null;
  if (targetType === null) return null;
  const sourceType: CardType = targetType === "Event" ? "Character" : "Event";
  const deckCard =
    context.deckCards.find((candidate) => candidate.card.cardType === sourceType) ?? null;
  if (deckCard === null) return null;

  const subtype = targetType === "Event" ? "Rite" : "Visitor";
  const label = targetType === "Event" ? "Event" : "Character";
  return {
    builderId: "convert_event_to_role",
    title: `Make ${deckCard.displayName} a ${label}`,
    summary: `${deckCard.displayName} changes type to cover a missing ${label.toLowerCase()} slot.`,
    answersNeedIds: [need.needId],
    gameObjects: [
      cloneDeckCard(
        deckCard,
        { label, detail: subtype },
        typeChangedPreview(deckCard, targetType, subtype),
      ),
    ],
    valueEssence: VALUE_ESSENCE.convertType,
    applyPayload: makeMerchantTypeChangePayload({
      entryId: deckCard.entryId,
      cardUuid: deckCard.cardUuid,
      cardNumber: deckCard.cardNumber,
      predicateId: `merchant:${need.needId}:${targetType.toLowerCase()}`,
      cardType: targetType,
      subtype,
      label,
    }),
  };
}

export const MERCHANT_REWARD_BUILDERS: Readonly<
  Record<MerchantRewardBuilderId, MerchantRewardBuilder>
> = {
  grant_support_card: grantSupportCard,
  grant_dreamsign: grantDreamsign,
  transfigure_card: transfigureCard,
  purge_weak_card: purgeWeakCard,
  duplicate_keystone: duplicateKeystone,
  replace_weak_with_fit: replaceWeakWithFit,
  gain_essence: gainEssence,
  raise_essence_cap: raiseEssenceCap,
  add_reclaim_to_event: addReclaimToEvent,
  add_fast_to_event: addFastToEvent,
  reduce_reclaim_cost: reduceReclaimCost,
  convert_event_to_role: convertEventToRole,
  grant_exact_card: grantExactCard,
};

function isMerchantRewardBuilderId(value: string): value is MerchantRewardBuilderId {
  return value in MERCHANT_REWARD_BUILDERS;
}

export function buildMerchantRewardWithBuilder(
  context: MerchantContext,
  need: MerchantNeed,
  builderId: MerchantRewardBuilderId,
  options: BuildMerchantRewardsOptions = {},
): MerchantReward | null {
  return MERCHANT_REWARD_BUILDERS[builderId](context, need, mergeOptions(options));
}

export function buildMerchantRewardsForNeed(
  context: MerchantContext,
  need: MerchantNeed,
  options: BuildMerchantRewardsOptions = {},
): MerchantRewardOption[] {
  const builderIds = need.compatibleRewardBuilderIds.filter(isMerchantRewardBuilderId);
  const seen = new Set<MerchantRewardBuilderId>();
  const rewards: MerchantReward[] = [];
  const mergedOptions = mergeOptions(options);

  for (const builderId of builderIds) {
    if (seen.has(builderId)) continue;
    seen.add(builderId);
    const reward = MERCHANT_REWARD_BUILDERS[builderId](context, need, mergedOptions);
    if (reward !== null) rewards.push(reward);
  }

  return rewards;
}

export function buildMerchantRewardCatalog(
  context: MerchantContext,
  needs: readonly MerchantNeed[],
  options: BuildMerchantRewardsOptions = {},
): MerchantRewardOption[] {
  return needs.flatMap((need) => buildMerchantRewardsForNeed(context, need, options));
}

export function resolveMerchantChoice(
  reward: MerchantReward,
  choice: MerchantChoice | string,
): MerchantApplyPayload | null {
  const choiceId = typeof choice === "string" ? choice : choice.choiceId;
  const candidate = reward.choiceRequest?.candidates.find(
    (item) => item.choiceId === choiceId,
  );
  return candidate?.applyPayload ?? null;
}

export function makeMerchantTypeChangePayload(input: {
  entryId: string;
  cardUuid: string;
  cardNumber: number;
  predicateId: string;
  cardType: CardType;
  subtype: string;
  label: string;
}): MerchantApplyPayload {
  return {
    kind: "change_deck_entry_type",
    entryId: input.entryId,
    cardUuid: input.cardUuid,
    cardNumber: input.cardNumber,
    typeChange: {
      predicateId: input.predicateId,
      cardType: input.cardType,
      subtype: input.subtype,
      label: input.label,
    },
  };
}
