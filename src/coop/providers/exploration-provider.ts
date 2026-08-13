import {
  mergeCardKeywordModification,
  resolveDeckEntryCard,
} from "../../card-type-change";
import { createDreamsign } from "../../data/dreamsigns";
import { toJourneyDreamAvatar } from "../../data/dream-avatar-selection";
import {
  EXPLORATION_CHOOSABLE_SITE_TYPES,
  explorationActionUsesOfferedDeckTarget,
  explorationEncounterForCard,
  type ExplorationActionContent,
  type ExplorationChoosableSiteType,
  type ExplorationPredicate,
} from "../../data/exploration";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import {
  explorationStarterCardPreparationsEqual,
  prepareExplorationStarterCardPlan,
} from "../../exploration/starter-card-plan";
import {
  explorationStarterCardTransfigurationPreparationsEqual,
  prepareExplorationStarterCardTransfigurationPlan,
} from "../../exploration/starter-card-transfiguration-plan";
import {
  explorationMultiCardTransfigurationPreparationsEqual,
  prepareExplorationMultiCardTransfigurationPlan,
  type ExplorationMultiCardTransfigurationEffectKind,
} from "../../exploration/multi-card-transfiguration-plan";
import {
  multiCardReplacementPreparationsEqual,
  prepareMultiCardReplacementPlan,
} from "../../exploration/multi-card-replacement-plan";
import {
  explorationRandomDeckTargetPreparationsEqual,
  prepareExplorationRandomDeckTargetPlan,
  type ExplorationRandomDeckTargetEffectKind,
} from "../../exploration/random-deck-target-plan";
import {
  explorationDisclosedDeckTargetPreparationsEqual,
  prepareExplorationDisclosedDeckTargetPlan,
} from "../../exploration/disclosed-deck-target-plan";
import {
  explorationCompoundActionPreparationsEqual,
  prepareExplorationCompoundActionPlan,
  type ExplorationCompoundActionKind,
  type ExplorationCompoundActionPreparation,
} from "../../exploration/compound-action-plan";
import {
  explorationSiteInsertionPreparationsEqual,
  explorationSiteTypeChoicePreparationsEqual,
  prepareExplorationSiteInsertion,
  prepareExplorationSiteTypeChoice,
} from "../../exploration/site-insertion-plan";
import {
  prepareExplorationDreamsignPlan,
  resolveExplorationDreamsignPlan,
  type ExplorationDreamsignEffectKind,
} from "../../dreamsign/exploration-dreamsign-plan";
import {
  hashStringToSeed,
  type JourneyContent,
} from "../../data/journey-content";
import {
  eligibleTransfigurations,
  offeredTransfigurationForms,
} from "../../transfiguration/transfiguration-logic";
import type { CardData, CardType } from "../../types/cards";
import type {
  CardTypeChange,
  DeckEntry,
  Dreamsign,
  ExplorationActionOfferRuntime,
  ExplorationEssencePreparation,
  ExplorationCardKeywordChange,
  ExplorationResolution,
  ExplorationSiteRuntime,
  ExplorationStarterCardEffectKind,
  ExplorationStarterCardTransfigurationEffectKind,
  JourneyState,
  SiteState,
  TransfigurationType,
} from "../../types/journey";
import { mintEntryId } from "../../rules/journey/deck";
import {
  applyJourneyRewardEffect,
  type JourneyRewardEffect,
} from "../../rules/journey/reward-effects";
import { buildRewardSelectionContext } from "../../reward-selection/context";
import { createRewardSelectionStream } from "../../reward-selection/rng";
import { selectReward } from "../../reward-selection/selectReward";
import {
  SELECTION_RULES_VERSION,
  type RewardMechanicId,
  type RewardSelectionPolicyId,
  type RewardSelectionRequest,
  type RewardSelectionResult,
} from "../../reward-selection/types";
import { stableDigest } from "../../reward-selection/stable";

interface ExplorationSelection {
  entryIds?: unknown;
  transfiguration?: unknown;
  transfigurations?: unknown;
  purgeEntryId?: unknown;
  copyEntryId?: unknown;
  cardIds?: unknown;
  packIndex?: unknown;
  subtype?: unknown;
  replacedDreamsignId?: unknown;
  dreamsignId?: unknown;
  dreamAvatarId?: unknown;
  offeredDreamsignId?: unknown;
  purgedDreamsignId?: unknown;
  overflowReplacementDreamsignIds?: unknown;
  siteType?: unknown;
}

const ESSENCE_AMOUNT_PURPOSE = "essence-amount" as const;

function explorationChoosableSiteTypes(
  values: readonly SiteState["type"][],
): readonly ExplorationChoosableSiteType[] | null {
  return values.every((value) =>
    EXPLORATION_CHOOSABLE_SITE_TYPES.includes(
      value as ExplorationChoosableSiteType,
    ),
  )
    ? (values as readonly ExplorationChoosableSiteType[])
    : null;
}

function isExplorationDreamsignEffectKind(
  effectKind: string,
): effectKind is ExplorationDreamsignEffectKind {
  return (
    effectKind === "gain-nightmare-and-dreamsign" ||
    effectKind === "gain-nightmare-and-offered-dreamsign" ||
    effectKind === "gain-offered-dreamsign" ||
    effectKind === "replace-selected-dreamsign-with-offered" ||
    effectKind === "replace-all-dreamsigns-random" ||
    effectKind === "purge-selected-dreamsign-and-gain-random"
  );
}

function authoredDreamsignCount(
  action: ExplorationActionContent,
  effectKind: ExplorationDreamsignEffectKind,
): number | undefined {
  return effectKind === "gain-offered-dreamsign" ||
    effectKind === "gain-nightmare-and-offered-dreamsign" ||
    effectKind === "replace-selected-dreamsign-with-offered"
    ? action.offerCount
    : effectKind === "purge-selected-dreamsign-and-gain-random"
      ? action.count
      : undefined;
}

function authoredNightmareCount(
  action: ExplorationActionContent,
): number | undefined {
  return action.effectKind === "gain-nightmare-and-dreamsign" ||
    action.effectKind === "gain-nightmare-and-offered-dreamsign"
    ? action.nightmareCount
    : undefined;
}

function fixedDreamsignId(
  action: ExplorationActionContent,
): string | undefined {
  return action.effectKind === "gain-nightmare-and-dreamsign"
    ? action.dreamsignId
    : undefined;
}

function isNightmareDreamsignEffect(action: ExplorationActionContent): boolean {
  return (
    action.effectKind === "gain-nightmare-and-dreamsign" ||
    action.effectKind === "gain-nightmare-and-offered-dreamsign"
  );
}

function isExplorationStarterCardEffectKind(
  effectKind: string,
): effectKind is ExplorationStarterCardEffectKind {
  return (
    effectKind === "purge-starter-card" ||
    effectKind === "purge-random-starter-card" ||
    effectKind === "purge-random-starter-and-gain-card" ||
    effectKind === "replace-all-starter-cards"
  );
}

function isExplorationStarterCardTransfigurationEffectKind(
  effectKind: string,
): effectKind is ExplorationStarterCardTransfigurationEffectKind {
  return (
    effectKind === "transfigure-random-starter-cards" ||
    effectKind === "transfigure-all-starter-cards"
  );
}

function isExplorationMultiCardTransfigurationEffect(
  action: ExplorationActionContent,
): action is ExplorationActionContent & {
  effectKind: ExplorationMultiCardTransfigurationEffectKind;
} {
  return (
    (action.effectKind === "transfigure-selected" && (action.count ?? 1) > 1) ||
    (action.effectKind === "transfigure-fixed-selected" &&
      (action.count ?? 1) > 1) ||
    action.effectKind === "transfigure-random-cards" ||
    action.effectKind === "transfigure-fixed-random-cards"
  );
}

function isExplorationMultiCardReplacementEffect(
  action: ExplorationActionContent,
): action is ExplorationActionContent & {
  effectKind: "replace-selected";
  predicate: ExplorationPredicate;
  count: number;
} {
  return (
    action.effectKind === "replace-selected" &&
    action.predicate !== undefined &&
    action.count !== undefined &&
    action.count > 1
  );
}

function isExplorationRandomDeckTargetEffect(
  action: ExplorationActionContent,
): action is ExplorationActionContent & {
  effectKind: ExplorationRandomDeckTargetEffectKind;
  count?: number;
} {
  return (
    ((action.effectKind === "copy-random-cards" ||
      action.effectKind === "change-random-card-type") &&
      action.count !== undefined) ||
    (action.effectKind === "replace-random-with-card" &&
      action.predicate !== undefined &&
      action.cardId !== undefined)
  );
}

function explorationCompoundActionKind(
  effectKind: ExplorationActionContent["effectKind"],
): ExplorationCompoundActionKind | null {
  switch (effectKind) {
    case "transfigure-all-cards":
      return "all-card-transfiguration";
    case "purge-disclosed-and-transfigure-same-type":
      return "purge-disclosed-transfigure-same-type";
    case "make-predicate-fast-and-gain-nightmares":
      return "predicate-fast-nightmares";
    case "take-transfigured-cards-and-gain-nightmares":
      return "take-transfigured-nightmares";
    case "purge-one-transfigure-and-copy-others":
      return "purge-transfigure-copy";
    default:
      return null;
  }
}

function prepareCompoundAction(input: {
  action: ExplorationActionContent;
  journey: JourneyState;
  site: SiteState;
  encounterCardId: string;
  content: JourneyContent;
}): ExplorationCompoundActionPreparation | null {
  const { action, journey, site, encounterCardId, content } = input;
  const common = {
    actionId: action.id,
    encounterCardId,
    journey,
    site,
    content,
  };
  switch (explorationCompoundActionKind(action.effectKind)) {
    case "all-card-transfiguration":
      return prepareExplorationCompoundActionPlan({
        ...common,
        kind: "all-card-transfiguration",
      });
    case "purge-disclosed-transfigure-same-type":
      return action.transfiguration === undefined
        ? null
        : prepareExplorationCompoundActionPlan({
            ...common,
            kind: "purge-disclosed-transfigure-same-type",
            transfiguration: action.transfiguration,
          });
    case "predicate-fast-nightmares":
      return action.predicate === undefined ||
        !Number.isInteger(action.nightmareCount) ||
        (action.nightmareCount ?? 0) <= 0
        ? null
        : prepareExplorationCompoundActionPlan({
            ...common,
            kind: "predicate-fast-nightmares",
            predicate: action.predicate,
            nightmareCount: action.nightmareCount as number,
          });
    case "take-transfigured-nightmares":
      return action.predicate === undefined ||
        action.offerCount !== 4 ||
        action.transfiguration === undefined ||
        !Number.isInteger(action.nightmareCount) ||
        (action.nightmareCount ?? 0) <= 0
        ? null
        : prepareExplorationCompoundActionPlan({
            ...common,
            kind: "take-transfigured-nightmares",
            predicate: action.predicate,
            offerCount: action.offerCount,
            transfiguration: action.transfiguration,
            nightmareCount: action.nightmareCount as number,
          });
    case "purge-transfigure-copy":
      return action.offerCount !== 4 || action.transfiguration === undefined
        ? null
        : prepareExplorationCompoundActionPlan({
            ...common,
            kind: "purge-transfigure-copy",
            offerCount: action.offerCount,
            transfiguration: action.transfiguration,
          });
    case null:
      return null;
  }
}

/** Map a deterministic unit draw uniformly onto an inclusive integer range. */
export function mapDeterministicDrawToInclusiveInteger(
  draw: number,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isFinite(draw) ||
    draw < 0 ||
    draw > 1 ||
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    minimum > maximum
  ) {
    throw new Error("Invalid deterministic inclusive integer mapping input");
  }
  const size = maximum - minimum + 1;
  return minimum + Math.min(size - 1, Math.floor(draw * size));
}

function idIndex(content: JourneyContent): ReadonlyMap<string, CardData> {
  return new Map(
    [...content.cardDatabase.values()].map((card) => [
      card.id.toLowerCase(),
      card,
    ]),
  );
}

function matchesPredicate(
  card: CardData,
  predicate: ExplorationPredicate,
  content: JourneyContent,
): boolean {
  switch (predicate) {
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return (
        card.cardType === "Character" &&
        card.energyCost !== null &&
        card.energyCost <=
          content.rewardSelectionData.tuning.costBands.cheapCharacterMaximum
      );
    case "legendary":
      return card.rarity === "Legendary";
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function resolvedDeckCards(
  journey: JourneyState,
  content: JourneyContent,
): Array<{ entry: DeckEntry; card: CardData }> {
  return journey.deck.flatMap((entry) => {
    const base = content.cardDatabase.get(entry.cardNumber);
    return base === undefined
      ? []
      : [
          {
            entry,
            card: resolveDeckEntryCard(
              content.transfigurationData,
              base,
              entry,
            ),
          },
        ];
  });
}

function transfigureAllEligibleEntryIds(
  action: ExplorationActionContent,
  journey: JourneyState,
  content: JourneyContent,
): string[] {
  const predicate = action.predicate;
  const transfiguration = action.transfiguration;
  if (predicate === undefined || transfiguration === undefined) return [];
  return resolvedDeckCards(journey, content)
    .filter(
      ({ entry, card }) =>
        entry.transfiguration === null &&
        matchesPredicate(card, predicate, content) &&
        offeredTransfigurationForms(
          content.transfigurationData,
          card,
          null,
        ).some((form) => form.type === transfiguration),
    )
    .map(({ entry }) => entry.entryId)
    .sort((left, right) => left.localeCompare(right));
}

function usesOfferedDeckTarget(action: ExplorationActionContent): boolean {
  return explorationActionUsesOfferedDeckTarget(action);
}

function emptyOffer(
  actionId: string,
  mechanicId?: RewardMechanicId,
  policyId?: RewardSelectionPolicyId,
): ExplorationActionOfferRuntime {
  return {
    actionId,
    ...(mechanicId === undefined ? {} : { canonicalMechanicId: mechanicId }),
    ...(policyId === undefined ? {} : { selectionPolicyId: policyId }),
    offeredCardIds: [],
    offeredDreamsignIds: [],
    offeredDeckEntryIds: [],
    offeredDreamAvatarIds: [],
    packCardIds: [],
    replacementCardIdByEntryId: {},
    transfigurationByEntryId: {},
  };
}

function buildCompoundActionOffer(input: {
  action: ExplorationActionContent;
  journey: JourneyState;
  content: JourneyContent;
  site: SiteState;
  encounterCardId: string;
}): ExplorationActionOfferRuntime | null {
  const preparation = prepareCompoundAction(input);
  if (preparation === null) return null;
  const mechanicAndPolicy = (() => {
    switch (preparation.kind) {
      case "all-card-transfiguration":
      case "purge-transfigure-copy":
        return {
          mechanicId: "transfigure-deck-entry" as const,
          policyId: "uniform" as const,
        };
      case "purge-disclosed-transfigure-same-type":
        return {
          mechanicId: "purge-deck-entry" as const,
          policyId: "purge-misfit" as const,
        };
      case "predicate-fast-nightmares":
        return { mechanicId: "make-deck-fast" as const };
      case "take-transfigured-nightmares":
        return {
          mechanicId: "transfigured-card-chooser" as const,
          policyId: "card-fit" as const,
        };
    }
  })();
  const offer = emptyOffer(
    input.action.id,
    mechanicAndPolicy.mechanicId,
    "policyId" in mechanicAndPolicy ? mechanicAndPolicy.policyId : undefined,
  );
  offer.selectionRulesVersion = preparation.selectionRulesVersion;
  offer.selectionContentRevision = preparation.selectionContentRevision;
  offer.selectionKey = preparation.selectionKey;
  offer.selectionSignature = preparation.planSignature;
  offer.selectionTraces = [...preparation.selectorTraces];
  offer.compoundActionPreparation = preparation;
  switch (preparation.kind) {
    case "all-card-transfiguration":
      offer.transfigurationByEntryId = Object.fromEntries(
        preparation.targets.map((target) => [
          target.entryId,
          target.transfiguration,
        ]),
      );
      break;
    case "purge-disclosed-transfigure-same-type":
      offer.offeredDeckEntryIds =
        preparation.target === null ? [] : [preparation.target.entryId];
      offer.transfigurationByEntryId = Object.fromEntries(
        preparation.companionTargets.map((target) => [
          target.entryId,
          target.transfiguration,
        ]),
      );
      break;
    case "predicate-fast-nightmares":
      break;
    case "take-transfigured-nightmares":
      offer.offeredCardIds = preparation.offeredCards.map(
        ({ cardId }) => cardId,
      );
      offer.transfigurationByCardId = Object.fromEntries(
        preparation.offeredCards.map(({ cardId, transfiguration }) => [
          cardId,
          transfiguration,
        ]),
      );
      break;
    case "purge-transfigure-copy":
      offer.offeredDeckEntryIds = preparation.targets.map(
        ({ entryId }) => entryId,
      );
      offer.transfigurationByEntryId = Object.fromEntries(
        preparation.targets.map(({ entryId, transfiguration }) => [
          entryId,
          transfiguration,
        ]),
      );
      break;
  }
  return offer;
}

function buildDisclosedDeckTargetOffer(input: {
  action: ExplorationActionContent;
  cardType: CardType;
  journey: JourneyState;
  content: JourneyContent;
  site: SiteState;
  encounterCardId: string;
}): ExplorationActionOfferRuntime {
  const preparation = prepareExplorationDisclosedDeckTargetPlan({
    effectKind: "change-card-type-selected",
    cardType: input.cardType,
    actionId: input.action.id,
    encounterCardId: input.encounterCardId,
    journey: input.journey,
    site: input.site,
    content: input.content,
  });
  return {
    ...emptyOffer(
      input.action.id,
      "change-entry-card-type",
      "deck-entry-centrality",
    ),
    selectionRulesVersion: preparation.selectionRulesVersion,
    selectionContentRevision: preparation.selectionContentRevision,
    selectionKey: preparation.selectionKey,
    selectionSignature: preparation.planSignature,
    ...(preparation.selectorTrace === undefined
      ? {}
      : { selectionTrace: preparation.selectorTrace }),
    disclosedDeckTargetPreparation: preparation,
    offeredDeckEntryIds:
      preparation.target === null ? [] : [preparation.target.entryId],
  };
}

function legacyShuffled<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function legacyCatalogCandidates(
  content: JourneyContent,
  predicate: ExplorationPredicate,
  excludedCardId: string,
): CardData[] {
  const customCardIds = new Set(
    (content.exploration?.customCards ?? []).map((card) =>
      card.id.toLowerCase(),
    ),
  );
  return [...content.cardDatabase.values()]
    .filter(
      (card) =>
        !customCardIds.has(card.id.toLowerCase()) &&
        card.id.toLowerCase() !== excludedCardId.toLowerCase() &&
        matchesPredicate(card, predicate, content),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function isLegacyDeckCardVariableTarget(
  action: ExplorationActionContent,
  entry: DeckEntry,
  card: CardData,
  content: JourneyContent,
): boolean {
  if (
    action.predicate !== undefined &&
    !matchesPredicate(card, action.predicate, content)
  ) {
    return false;
  }
  switch (action.effectKind) {
    case "change-subtype-selected":
      return (
        action.subtype !== undefined &&
        card.cardType === "Character" &&
        card.subtype !== action.subtype
      );
    case "transfigure-fixed-selected":
      return (
        entry.transfiguration === null &&
        action.transfiguration !== undefined &&
        offeredTransfigurationForms(
          content.transfigurationData,
          card,
          null,
        ).some((form) => form.type === action.transfiguration)
      );
    case "transfigure-selected":
      return (
        entry.transfiguration === null &&
        offeredTransfigurationForms(content.transfigurationData, card, null)
          .length > 0
      );
    default:
      return true;
  }
}

function buildLegacyActionOffer(
  action: ExplorationActionContent,
  journey: JourneyState,
  content: JourneyContent,
  rng: () => number,
  encounterCardId: string,
  site: SiteState,
): ExplorationActionOfferRuntime | null {
  const offer = emptyOffer(action.id);
  if (explorationCompoundActionKind(action.effectKind) !== null) {
    return buildCompoundActionOffer({
      action,
      journey,
      content,
      site,
      encounterCardId,
    });
  }
  if (
    action.effectKind === "free-next-shop" ||
    action.effectKind === "lose-half-essence-and-free-purchases"
  ) {
    return { ...offer, canonicalMechanicId: "shop-purchase-modifier" };
  }
  if (action.effectKind === "add-fixed-site") {
    if (action.siteType === undefined) return null;
    const selectionContentRevision = buildRewardSelectionContext({
      journeyState: journey,
      journeyContent: content,
      site,
    }).selectionContentRevision;
    const preparation = prepareExplorationSiteInsertion({
      journey,
      sourceSite: site,
      sourceActionId: action.id,
      encounterCardId,
      siteType: action.siteType,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision,
    });
    return preparation === null
      ? null
      : {
          ...offer,
          canonicalMechanicId: "add-site",
          selectionPolicyId: "fixed",
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selectionContentRevision,
          selectionKey: action.id,
          selectionSignature: preparation.planSignature,
          siteInsertionPreparation: preparation,
        };
  }
  if (action.effectKind === "choose-site-type") {
    if (action.offerCount !== 3) return null;
    const context = buildRewardSelectionContext({
      journeyState: journey,
      journeyContent: content,
      site,
    });
    const selected = selectReward(context, {
      mechanicId: "add-site",
      policyId: "site-uniform",
      scope: {
        journeySeed: journey.seed,
        siteUuid: site.id,
        selectionKey: action.id,
      },
      count: action.offerCount,
      constraints: {
        allowedSiteTypes: context.tuning.placeableSiteTypes,
      },
    });
    if (
      !selected.ok ||
      selected.bindings.siteTypes.length !== action.offerCount
    )
      return null;
    const siteTypes = explorationChoosableSiteTypes(
      selected.bindings.siteTypes,
    );
    if (siteTypes === null) return null;
    const preparation = prepareExplorationSiteTypeChoice({
      journey,
      sourceSite: site,
      sourceActionId: action.id,
      encounterCardId,
      siteTypes,
      selectorSignature: selected.signature,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
    });
    return preparation === null
      ? null
      : {
          ...withSelection(offer, selected),
          selectionSignature: preparation.planSignature,
          siteTypeChoicePreparation: preparation,
        };
  }
  if (
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered" &&
    action.cardType !== undefined
  ) {
    return buildDisclosedDeckTargetOffer({
      action,
      cardType: action.cardType,
      journey,
      content,
      site,
      encounterCardId,
    });
  }
  if (isExplorationRandomDeckTargetEffect(action)) {
    const preparation = prepareExplorationRandomDeckTargetPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      count: action.count,
      cardType: action.cardType,
      replacementCardId: action.cardId,
      actionId: action.id,
      encounterCardId,
      journey,
      site,
      content,
    });
    const mechanicId =
      action.effectKind === "copy-random-cards"
        ? "duplicate-deck-entry"
        : action.effectKind === "change-random-card-type"
          ? "change-entry-card-type"
          : "replace-deck-entry";
    return {
      ...offer,
      canonicalMechanicId: mechanicId,
      selectionPolicyId: "uniform",
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      ...(preparation.selectorTrace === undefined
        ? {}
        : { selectionTrace: preparation.selectorTrace }),
      randomDeckTargetPreparation: preparation,
      offeredDeckEntryIds: [],
    };
  }
  if (action.effectKind === "gain-random-dreamsign") {
    const availableIds = new Set(
      content.dreamsignTemplates.map((dreamsign) => dreamsign.id.toLowerCase()),
    );
    const candidates = journey.remainingDreamsignPool.filter((id) =>
      availableIds.has(id.toLowerCase()),
    );
    const selected = legacyShuffled(candidates, rng)[0];
    if (selected !== undefined) offer.offeredDreamsignIds = [selected];
    return offer;
  }
  if (action.effectKind === "copy-offered-deck-card") {
    offer.offeredDeckEntryIds = legacyShuffled(journey.deck, rng)
      .slice(0, action.offerCount ?? 4)
      .map((entry) => entry.entryId);
    return offer;
  }
  if (action.effectKind === "choose-dream-avatar") {
    const currentId = journey.dreamAvatar?.id.toLowerCase();
    const candidates = content.dreamAvatars
      .filter((dreamAvatar) => dreamAvatar.id.toLowerCase() !== currentId)
      .sort((left, right) => left.id.localeCompare(right.id));
    offer.offeredDreamAvatarIds = legacyShuffled(candidates, rng)
      .slice(0, action.offerCount ?? 3)
      .map((dreamAvatar) => dreamAvatar.id);
    return offer;
  }
  if (
    usesOfferedDeckTarget(action) &&
    action.effectKind !== "replace-selected"
  ) {
    const target = legacyShuffled(
      resolvedDeckCards(journey, content).filter(
        ({ entry, card }) =>
          card.id.toLowerCase() !== encounterCardId.toLowerCase() &&
          isLegacyDeckCardVariableTarget(action, entry, card, content),
      ),
      rng,
    )[0];
    if (target !== undefined)
      offer.offeredDeckEntryIds = [target.entry.entryId];
    return offer;
  }
  if (action.predicate === undefined) return offer;

  const candidates = legacyCatalogCandidates(
    content,
    action.predicate,
    encounterCardId,
  );
  if (
    action.effectKind === "gain-offered-card" ||
    action.effectKind === "draft-card" ||
    action.effectKind === "take-cards" ||
    action.effectKind === "gain-random-cards"
  ) {
    const offerCount =
      action.effectKind === "gain-offered-card"
        ? 1
        : action.effectKind === "gain-random-cards"
          ? (action.count ?? 1)
          : (action.offerCount ?? 4);
    offer.offeredCardIds = legacyShuffled(candidates, rng)
      .slice(0, offerCount)
      .map((card) => card.id);
  } else if (action.effectKind === "choose-pack") {
    const ordered = legacyShuffled(candidates, rng);
    const packCount = action.packCount ?? 2;
    const packSize = action.packSize ?? 3;
    offer.packCardIds = Array.from({ length: packCount }, (_, packIndex) =>
      ordered
        .slice(packIndex * packSize, (packIndex + 1) * packSize)
        .map((card) => card.id),
    ).filter((pack) => pack.length > 0);
  } else if (action.effectKind === "replace-selected") {
    const deckCards = resolvedDeckCards(journey, content).filter(({ card }) =>
      matchesPredicate(card, action.predicate as ExplorationPredicate, content),
    );
    for (const { entry, card } of deckCards) {
      const replacement = legacyShuffled(
        candidates.filter((candidate) => candidate.id !== card.id),
        rng,
      )[0];
      if (replacement !== undefined) {
        offer.replacementCardIdByEntryId[entry.entryId] = replacement.id;
      }
    }
  }
  return offer;
}

function canonicalSelectionForAction(action: ExplorationActionContent): {
  mechanicId: RewardMechanicId;
  policyId?: RewardSelectionPolicyId;
} {
  const compiledMechanic = action.canonicalMechanicId;
  const compiledPolicy = action.selectionPolicyId;
  if (compiledMechanic !== undefined) {
    return {
      mechanicId: compiledMechanic,
      ...(compiledPolicy === undefined ? {} : { policyId: compiledPolicy }),
    };
  }
  if (isExplorationDreamsignEffectKind(action.effectKind)) {
    return {
      mechanicId: "gain-dreamsign",
      policyId:
        action.effectKind === "gain-nightmare-and-dreamsign"
          ? "fixed"
          : action.effectKind === "gain-offered-dreamsign" ||
              action.effectKind === "gain-nightmare-and-offered-dreamsign" ||
              action.effectKind === "replace-selected-dreamsign-with-offered"
            ? "dreamsign-match"
            : "uniform",
    };
  }
  switch (action.effectKind) {
    case "gain-card":
      return { mechanicId: "gain-card", policyId: "fixed" };
    case "gain-offered-card":
      return { mechanicId: "gain-card", policyId: "card-fit-quality" };
    case "gain-random-cards":
      return { mechanicId: "gain-card", policyId: "card-bundle" };
    case "draft-card":
    case "take-cards":
      return { mechanicId: "catalog-card-chooser", policyId: "card-fit" };
    case "take-transfigured-cards-and-gain-nightmares":
      return { mechanicId: "transfigured-card-chooser", policyId: "card-fit" };
    case "choose-pack":
      return { mechanicId: "pack-chooser", policyId: "card-bundle" };
    case "gain-dreamsign":
      return { mechanicId: "gain-dreamsign", policyId: "fixed" };
    case "gain-random-dreamsign":
      return { mechanicId: "gain-dreamsign", policyId: "dreamsign-match" };
    case "transfigure-selected":
    case "transfigure-fixed-selected":
      return {
        mechanicId: "transfigure-deck-entry",
        policyId: "transfiguration-value",
      };
    case "transfigure-random-cards":
    case "transfigure-fixed-random-cards":
    case "transfigure-random-starter-cards":
    case "transfigure-all-starter-cards":
    case "transfigure-all-cards":
    case "purge-one-transfigure-and-copy-others":
      return {
        mechanicId: "transfigure-deck-entry",
        policyId: "uniform",
      };
    case "transfigure-all-for-essence":
      return { mechanicId: "transfigure-deck-for-essence" };
    case "purge-selected":
    case "purge-disclosed-and-transfigure-same-type":
      return { mechanicId: "purge-deck-entry", policyId: "purge-misfit" };
    case "purge-starter-card":
    case "purge-random-starter-card":
      return { mechanicId: "purge-deck-entry", policyId: "uniform" };
    case "purge-random-starter-and-gain-card":
    case "replace-all-starter-cards":
      return { mechanicId: "replace-deck-entry" };
    case "purge-for-essence":
      return { mechanicId: "purge-for-essence", policyId: "purge-misfit" };
    case "replace-selected":
      return { mechanicId: "replace-deck-entry", policyId: "card-fit-quality" };
    case "replace-selected-with-card":
      return { mechanicId: "replace-deck-entry", policyId: "fixed" };
    case "replace-random-with-card":
      return { mechanicId: "replace-deck-entry", policyId: "uniform" };
    case "copy-selected-card":
    case "copy-selected-cards":
    case "copy-random-cards":
    case "copy-offered-deck-card":
      return {
        mechanicId: "duplicate-deck-entry",
        policyId: "duplicate-value",
      };
    case "purge-and-copy":
      return { mechanicId: "purge-and-duplicate" };
    case "change-subtype-selected":
      return {
        mechanicId: "change-entry-subtype",
        policyId: "deck-entry-centrality",
      };
    case "change-random-card-type":
      return {
        mechanicId: "change-entry-card-type",
        policyId: "uniform",
      };
    case "change-card-type-selected":
      return {
        mechanicId: "change-entry-card-type",
        policyId: "deck-entry-centrality",
      };
    case "choose-dream-avatar":
      return { mechanicId: "choose-dream-avatar", policyId: "uniform" };
    case "transfigured-card-draft":
      return { mechanicId: "transfigured-card-chooser", policyId: "card-fit" };
    case "add-fixed-site":
      return { mechanicId: "add-site", policyId: "fixed" };
    case "add-site":
      return { mechanicId: "add-site", policyId: "site-uniform" };
    case "choose-site-type":
      return { mechanicId: "add-site", policyId: "site-uniform" };
    case "change-subtype-all":
      return { mechanicId: "change-deck-subtype" };
    case "gain-nightmare-and-card":
      return { mechanicId: "gain-nightmare-and-card", policyId: "fixed" };
    case "transfigure-next-draft-or-shop":
      return { mechanicId: "next-site-transfiguration" };
    case "free-next-shop":
    case "lose-half-essence-and-free-purchases":
      return { mechanicId: "shop-purchase-modifier" };
    case "gain-essence-per-card":
      return { mechanicId: "gain-essence-by-deck-predicate" };
    case "gain-essence":
    case "double-essence":
      return { mechanicId: "essence-mutation" };
    case "gain-random-essence":
      return { mechanicId: "essence-mutation", policyId: "uniform" };
    case "increase-spark-all":
      return { mechanicId: "increase-deck-spark" };
    case "purge-random-subtype-and-increase-spark":
      return { mechanicId: "purge-deck-entry", policyId: "uniform" };
    case "purge-dreamsign-for-essence":
      return { mechanicId: "purge-dreamsign-for-essence" };
    case "make-fast-all":
    case "make-predicate-fast-and-gain-nightmares":
      return { mechanicId: "make-deck-fast" };
    case "reduce-cost-all-and-gain-nightmares":
      return { mechanicId: "reduce-deck-cost-and-add-nightmares" };
    case "next-battle-opening-hand":
    case "next-battle-starting-energy":
    case "next-battle-smaller-hand-and-cost-discount":
      return { mechanicId: "next-battle-modifier" };
    case "purge-duplicates-and-grant-reclaim":
      return { mechanicId: "purge-duplicates-and-grant-reclaim" };
    default:
      return { mechanicId: "gain-card", policyId: "fixed" };
  }
}

function withSelection(
  offer: ExplorationActionOfferRuntime,
  selection: RewardSelectionResult,
): ExplorationActionOfferRuntime {
  return {
    ...offer,
    canonicalMechanicId: selection.mechanicId,
    selectionPolicyId: selection.policyId,
    selectionRulesVersion: selection.selectionRulesVersion,
    selectionContentRevision: selection.selectionContentRevision,
    selectionKey: selection.selectionKey,
    selectionSignature: selection.signature,
    selectionTrace: selection.trace,
  };
}

function essenceSelectionKey(
  encounterCardId: string,
  actionId: string,
): string {
  return `${encounterCardId}:${actionId}`;
}

function essenceSelectionRequest(input: {
  journey: JourneyState;
  site: SiteState;
  encounterCardId: string;
  actionId: string;
}): RewardSelectionRequest {
  return {
    mechanicId: "essence-mutation",
    policyId: "uniform",
    scope: {
      journeySeed: input.journey.seed,
      siteUuid: input.site.id,
      selectionKey: essenceSelectionKey(input.encounterCardId, input.actionId),
    },
    count: 1,
  };
}

function essenceSelectionSignature(
  action: ExplorationActionContent,
  encounterCardId: string,
  offer: ExplorationActionOfferRuntime,
): string {
  return stableDigest({
    mechanicId: offer.canonicalMechanicId,
    policyId: offer.selectionPolicyId ?? null,
    selectionRulesVersion: offer.selectionRulesVersion,
    selectionContentRevision: offer.selectionContentRevision,
    selectionKey: offer.selectionKey,
    encounterCardId,
    actionId: action.id,
    effectKind: action.effectKind,
    essence: action.essence ?? null,
    preparedEssenceAmount: offer.preparedEssenceAmount ?? null,
    essencePreparation: offer.essencePreparation ?? null,
  });
}

function buildEssenceMutationOffer(input: {
  action: ExplorationActionContent;
  journey: JourneyState;
  site: SiteState;
  encounterCardId: string;
  selectionContentRevision: string;
  offer: ExplorationActionOfferRuntime;
}): ExplorationActionOfferRuntime | null {
  const { action, journey, site, encounterCardId, selectionContentRevision } =
    input;
  const offer: ExplorationActionOfferRuntime = {
    ...input.offer,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision,
    selectionKey: essenceSelectionKey(encounterCardId, action.id),
  };
  if (
    action.effectKind === "gain-essence" &&
    (!Number.isInteger(action.essence) || (action.essence ?? 0) <= 0)
  ) {
    return null;
  }
  if (action.effectKind === "gain-random-essence") {
    const minimumEssence = action.minimumEssence;
    const maximumEssence = action.maximumEssence;
    if (
      !Number.isInteger(minimumEssence) ||
      !Number.isInteger(maximumEssence) ||
      (minimumEssence ?? 0) <= 0 ||
      (maximumEssence ?? -1) < (minimumEssence ?? 0)
    ) {
      return null;
    }
    const request = essenceSelectionRequest({
      journey,
      site,
      encounterCardId,
      actionId: action.id,
    });
    const stream = createRewardSelectionStream(request, ESSENCE_AMOUNT_PURPOSE);
    offer.preparedEssenceAmount = mapDeterministicDrawToInclusiveInteger(
      stream.draw(),
      minimumEssence as number,
      maximumEssence as number,
    );
    offer.essencePreparation = {
      minimumEssence: minimumEssence as number,
      maximumEssence: maximumEssence as number,
      purpose: ESSENCE_AMOUNT_PURPOSE,
      saltParts: [...stream.saltParts],
      drawsConsumed: stream.drawsConsumed(),
    };
  }
  offer.selectionSignature = essenceSelectionSignature(
    action,
    encounterCardId,
    offer,
  );
  return offer;
}

function buildActionOffer(
  action: ExplorationActionContent,
  journey: JourneyState,
  content: JourneyContent,
  site: SiteState,
  encounterCardId: string,
): ExplorationActionOfferRuntime | null {
  const canonical = canonicalSelectionForAction(action);
  const offer = emptyOffer(action.id, canonical.mechanicId, canonical.policyId);
  const context = buildRewardSelectionContext({
    journeyState: journey,
    journeyContent: content,
    site,
  });
  const select = (
    overrides: Partial<RewardSelectionRequest> = {},
  ): RewardSelectionResult | null => {
    if (canonical.policyId === undefined) return null;
    const request: RewardSelectionRequest = {
      mechanicId: canonical.mechanicId,
      policyId: canonical.policyId,
      scope: {
        journeySeed: journey.seed,
        siteUuid: site.id,
        selectionKey: action.id,
      },
      count: 1,
      ...overrides,
    };
    const outcome = selectReward(context, request);
    return outcome.ok ? outcome : null;
  };

  if (explorationCompoundActionKind(action.effectKind) !== null) {
    return buildCompoundActionOffer({
      action,
      journey,
      content,
      site,
      encounterCardId,
    });
  }

  if (action.effectKind === "add-fixed-site") {
    if (action.siteType === undefined) return null;
    const preparation = prepareExplorationSiteInsertion({
      journey,
      sourceSite: site,
      sourceActionId: action.id,
      encounterCardId,
      siteType: action.siteType,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
    });
    if (preparation === null) return null;
    return {
      ...offer,
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
      selectionKey: action.id,
      selectionSignature: preparation.planSignature,
      siteInsertionPreparation: preparation,
    };
  }

  if (action.effectKind === "choose-site-type") {
    if (action.offerCount !== 3) return null;
    const selected = select({
      count: action.offerCount,
      constraints: {
        allowedSiteTypes: context.tuning.placeableSiteTypes,
      },
    });
    if (selected === null || selected.bindings.siteTypes.length !== 3)
      return null;
    const siteTypes = explorationChoosableSiteTypes(
      selected.bindings.siteTypes,
    );
    if (siteTypes === null) return null;
    const preparation = prepareExplorationSiteTypeChoice({
      journey,
      sourceSite: site,
      sourceActionId: action.id,
      encounterCardId,
      siteTypes,
      selectorSignature: selected.signature,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
    });
    if (preparation === null) return null;
    return {
      ...withSelection(offer, selected),
      selectionSignature: preparation.planSignature,
      siteTypeChoicePreparation: preparation,
    };
  }

  if (isExplorationDreamsignEffectKind(action.effectKind)) {
    const planned = prepareExplorationDreamsignPlan({
      effectKind: action.effectKind,
      authoredCount: authoredDreamsignCount(action, action.effectKind),
      authoredNightmareCount: authoredNightmareCount(action),
      fixedDreamsignId: fixedDreamsignId(action),
      actionId: action.id,
      journey,
      site,
      content,
    });
    const preparedOffer = {
      ...offer,
      canonicalMechanicId: "gain-dreamsign" as const,
      selectionPolicyId:
        planned.preparation.kind === "fixed-gain"
          ? ("fixed" as const)
          : planned.preparation.kind === "offered-gain" ||
              planned.preparation.kind === "offered-replacement"
            ? ("dreamsign-match" as const)
            : ("uniform" as const),
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
      selectionKey: action.id,
      dreamsignPreparation: planned.preparation,
      offeredDreamsignIds:
        planned.preparation.kind === "offered-gain" ||
        planned.preparation.kind === "offered-replacement"
          ? [...planned.preparation.preparedDreamsignIds]
          : [],
    };
    return planned.selector === null
      ? preparedOffer
      : withSelection(preparedOffer, planned.selector);
  }

  if (isExplorationMultiCardTransfigurationEffect(action)) {
    const preparation = prepareExplorationMultiCardTransfigurationPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      count: action.count,
      transfiguration: action.transfiguration,
      actionId: action.id,
      encounterCardId,
      journey,
      site,
      content,
    });
    return {
      ...offer,
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId:
        action.effectKind === "transfigure-selected" ||
        action.effectKind === "transfigure-fixed-selected"
          ? "transfiguration-value"
          : "uniform",
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTraces: [...preparation.selectorTraces],
      multiCardTransfigurationPreparation: preparation,
      offeredDeckEntryIds: [],
      transfigurationByEntryId: Object.fromEntries(
        preparation.targets.map((target) => [
          target.entryId,
          target.transfiguration,
        ]),
      ),
    };
  }

  if (isExplorationMultiCardReplacementEffect(action)) {
    const preparation = prepareMultiCardReplacementPlan({
      actionId: action.id,
      encounterCardId,
      predicate: action.predicate,
      count: action.count,
      journey,
      site,
      content,
    });
    return {
      ...offer,
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "card-fit-quality",
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTraces: [...preparation.selectorTraces],
      multiCardReplacementPreparation: preparation,
      offeredDeckEntryIds: [],
      replacementCardIdByEntryId: {},
    };
  }

  if (
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered" &&
    action.cardType !== undefined
  ) {
    return buildDisclosedDeckTargetOffer({
      action,
      cardType: action.cardType,
      journey,
      content,
      site,
      encounterCardId,
    });
  }

  if (isExplorationRandomDeckTargetEffect(action)) {
    const preparation = prepareExplorationRandomDeckTargetPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      count: action.count,
      cardType: action.cardType,
      replacementCardId: action.cardId,
      actionId: action.id,
      encounterCardId,
      journey,
      site,
      content,
    });
    const mechanicId =
      action.effectKind === "copy-random-cards"
        ? "duplicate-deck-entry"
        : action.effectKind === "change-random-card-type"
          ? "change-entry-card-type"
          : "replace-deck-entry";
    return {
      ...offer,
      canonicalMechanicId: mechanicId,
      selectionPolicyId: "uniform",
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      ...(preparation.selectorTrace === undefined
        ? {}
        : { selectionTrace: preparation.selectorTrace }),
      randomDeckTargetPreparation: preparation,
      offeredDeckEntryIds: [],
    };
  }

  if (isExplorationStarterCardTransfigurationEffectKind(action.effectKind)) {
    const preparation = prepareExplorationStarterCardTransfigurationPlan({
      effectKind: action.effectKind,
      count: action.count,
      actionId: action.id,
      encounterCardId,
      journey,
      site,
      content,
    });
    return {
      ...offer,
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTraces: [...preparation.selectorTraces],
      starterCardTransfigurationPreparation: preparation,
      offeredDeckEntryIds: [],
      transfigurationByEntryId: Object.fromEntries(
        preparation.targets.map((target) => [
          target.entryId,
          target.transfiguration,
        ]),
      ),
    };
  }

  if (isExplorationStarterCardEffectKind(action.effectKind)) {
    const preparation = prepareExplorationStarterCardPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      actionId: action.id,
      encounterCardId,
      journey,
      site,
      content,
    });
    return {
      ...offer,
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTraces: [...preparation.selectorTraces],
      starterCardPreparation: preparation,
      offeredDeckEntryIds:
        action.effectKind === "purge-starter-card" &&
        preparation.unavailableReason === undefined
          ? [...preparation.purgedEntryIds]
          : [],
      replacementCardIdByEntryId: {
        ...preparation.replacementCardIdByEntryId,
      },
    };
  }

  if (
    action.effectKind === "gain-essence" ||
    action.effectKind === "gain-random-essence" ||
    action.effectKind === "double-essence"
  ) {
    return buildEssenceMutationOffer({
      action,
      journey,
      site,
      encounterCardId,
      selectionContentRevision: context.selectionContentRevision,
      offer,
    });
  }

  if (action.effectKind === "transfigure-all-for-essence") {
    offer.eligibleDeckEntryIds = transfigureAllEligibleEntryIds(
      action,
      journey,
      content,
    );
    offer.selectionKey = action.id;
    offer.selectionRulesVersion = SELECTION_RULES_VERSION;
    offer.selectionContentRevision = context.selectionContentRevision;
    offer.selectionSignature = stableDigest({
      mechanicId: canonical.mechanicId,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: context.selectionContentRevision,
      effectKind: action.effectKind,
      essence: action.essence ?? null,
      predicate: action.predicate ?? null,
      transfiguration: action.transfiguration ?? null,
      eligibleDeckEntryIds: offer.eligibleDeckEntryIds,
    });
    return offer;
  }

  if (action.effectKind === "gain-card" && action.cardId !== undefined) {
    const selected = select({
      constraints: { fixedCardUuid: action.cardId },
    });
    return selected === null ? null : withSelection(offer, selected);
  }
  if (
    action.effectKind === "gain-dreamsign" &&
    action.dreamsignId !== undefined
  ) {
    const selected = select({
      constraints: { fixedDreamsignId: action.dreamsignId },
    });
    return selected === null ? null : withSelection(offer, selected);
  }
  if (action.effectKind === "gain-random-dreamsign") {
    const selected = select();
    if (selected === null) return null;
    offer.offeredDreamsignIds = [...selected.bindings.dreamsignIds];
    return withSelection(offer, selected);
  }
  if (action.effectKind === "copy-offered-deck-card") {
    const selected = select({ count: action.offerCount ?? 4 });
    if (selected === null) return null;
    offer.offeredDeckEntryIds = [...selected.bindings.deckEntryIds];
    return withSelection(offer, selected);
  }
  if (action.effectKind === "choose-dream-avatar") {
    const selected = select({
      count: action.offerCount ?? 3,
      constraints: {
        excludedDreamAvatarIds:
          journey.dreamAvatar === null ? [] : [journey.dreamAvatar.id],
      },
    });
    if (selected === null) return null;
    offer.offeredDreamAvatarIds = [...selected.bindings.dreamAvatarIds];
    if (offer.offeredDreamAvatarIds.length !== (action.offerCount ?? 3))
      return null;
    return withSelection(offer, selected);
  }
  if (action.effectKind === "transfigured-card-draft") {
    const selected = select({
      count: action.offerCount ?? 4,
      constraints: {
        predicate: action.predicate ?? "character",
        cardScope: "draft-pool",
        excludeOwned: true,
        excludedCardUuids: [encounterCardId],
      },
    });
    if (selected === null) return null;
    offer.offeredCardIds = [...selected.bindings.cardUuids];
    offer.transfigurationByCardId = Object.fromEntries(
      selected.bindings.transfigurations.map((binding) => [
        binding.cardUuid,
        binding.transfiguration,
      ]),
    );
    return withSelection(offer, selected);
  }
  if (action.effectKind === "add-site") {
    const selected = select();
    const siteType = selected?.bindings.siteTypes[0];
    if (selected === null || siteType === undefined) return null;
    offer.offeredSiteType = siteType;
    return withSelection(offer, selected);
  }
  if (action.effectKind === "purge-random-subtype-and-increase-spark") {
    if (action.subtype === undefined) return null;
    const eligibleEntryIds = resolvedDeckCards(journey, content)
      .filter(
        ({ card }) =>
          card.cardType === "Character" &&
          card.subtype === action.subtype &&
          card.id.toLowerCase() !== encounterCardId.toLowerCase(),
      )
      .map(({ entry }) => entry.entryId)
      .sort((left, right) => left.localeCompare(right));
    if (eligibleEntryIds.length < 2) return offer;
    const eligible = new Set(eligibleEntryIds);
    const selected = select({
      constraints: {
        allowStarters: true,
        excludedDeckEntryIds: journey.deck
          .map((entry) => entry.entryId)
          .filter((entryId) => !eligible.has(entryId)),
      },
    });
    if (selected === null || selected.bindings.deckEntryIds.length !== 1)
      return null;
    offer.offeredDeckEntryIds = [...selected.bindings.deckEntryIds];
    return withSelection(offer, selected);
  }
  if (usesOfferedDeckTarget(action)) {
    const selected = select({
      constraints: {
        predicate: action.predicate ?? "any",
        ...(action.effectKind === "transfigure-fixed-selected" &&
        action.transfiguration !== undefined
          ? { fixedTransfiguration: action.transfiguration }
          : {}),
        ...(action.effectKind === "purge-selected" ||
        action.effectKind === "purge-for-essence"
          ? { allowStarters: true }
          : {}),
        excludedCardUuids: [encounterCardId],
        ...(action.effectKind === "change-subtype-selected" &&
        action.subtype !== undefined
          ? {
              excludedDeckEntryIds: resolvedDeckCards(journey, content)
                .filter(({ card }) => card.subtype === action.subtype)
                .map(({ entry }) => entry.entryId),
            }
          : {}),
      },
    });
    if (selected === null) return null;
    offer.offeredDeckEntryIds = [...selected.bindings.deckEntryIds];
    for (const binding of selected.bindings.transfigurations) {
      if (binding.entryId !== undefined) {
        offer.transfigurationByEntryId[binding.entryId] =
          binding.transfiguration;
      }
    }
    return withSelection(offer, selected);
  }
  if (
    action.effectKind === "gain-offered-card" ||
    action.effectKind === "draft-card" ||
    action.effectKind === "take-cards" ||
    action.effectKind === "gain-random-cards"
  ) {
    const offerCount =
      action.effectKind === "gain-offered-card"
        ? 1
        : action.effectKind === "gain-random-cards"
          ? (action.count ?? 1)
          : (action.offerCount ?? 4);
    const selected = select({
      count: offerCount,
      constraints: {
        predicate: action.predicate ?? "any",
        cardScope: "draft-pool",
        excludeOwned: true,
        excludedCardUuids: [encounterCardId],
      },
      ...(action.effectKind === "gain-offered-card" && (action.count ?? 1) > 1
        ? {
          }
        : {}),
    });
    if (selected === null) return null;
    offer.offeredCardIds = [...selected.bindings.cardUuids];
    return withSelection(offer, selected);
  } else if (action.effectKind === "choose-pack") {
    const packCount = action.packCount ?? 2;
    const packSize = action.packSize ?? 3;
    const selected = select({
      count: packCount,
      packSize,
      constraints: {
        predicate: action.predicate ?? "any",
        cardScope: "draft-pool",
        excludeOwned: true,
        excludedCardUuids: [encounterCardId],
        distinctCards: true,
      },
    });
    if (selected === null) return null;
    offer.packCardIds = selected.bindings.packs.map((pack) => [...pack]);
    return withSelection(offer, selected);
  } else if (action.effectKind === "replace-selected") {
    const deckCards = resolvedDeckCards(journey, content).filter(({ card }) =>
      matchesPredicate(card, action.predicate ?? "character", content),
    );
    const selections: RewardSelectionResult[] = [];
    for (const { entry, card } of deckCards) {
      const selected = select({
        mechanicId: "gain-card",
        policyId: "card-fit-quality",
        scope: {
          journeySeed: journey.seed,
          siteUuid: site.id,
          selectionKey: `${action.id}:replacement:${entry.entryId}`,
        },
        constraints: {
          predicate: action.predicate ?? "character",
          cardScope: "draft-pool",
          excludeOwned: true,
          excludedCardUuids: [encounterCardId, card.id],
        },
      });
      if (selected === null) continue;
      const replacement = selected.bindings.cardUuids[0];
      if (replacement !== undefined) {
        offer.replacementCardIdByEntryId[entry.entryId] = replacement;
        selections.push(selected);
      }
    }
    const first = selections[0];
    if (first === undefined) return null;
    return {
      ...withSelection(offer, first),
      selectionSignature: stableDigest(
        selections.map((selection) => selection.signature),
      ),
      selectionTraces: selections.map((selection) => selection.trace),
    };
  }
  return offer;
}

function explorationEncounterSignature(
  cardId: string,
  actionOffers: readonly ExplorationActionOfferRuntime[],
): string {
  return stableDigest({
    cardId,
    actionOffers: actionOffers.map((offer) => ({
      actionId: offer.actionId,
      signature:
        offer.dreamsignPreparation?.planSignature ??
        offer.starterCardPreparation?.planSignature ??
        offer.multiCardTransfigurationPreparation?.planSignature ??
        offer.multiCardReplacementPreparation?.planSignature ??
        offer.disclosedDeckTargetPreparation?.planSignature ??
        offer.randomDeckTargetPreparation?.planSignature ??
        offer.compoundActionPreparation?.planSignature ??
        offer.starterCardTransfigurationPreparation?.planSignature ??
        offer.siteInsertionPreparation?.planSignature ??
        offer.siteTypeChoicePreparation?.planSignature ??
        offer.selectionSignature ??
        null,
    })),
  });
}

/** Reproduce the prepared offers written by unversioned Exploration opens. */
export function buildLegacyExplorationRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  rng: () => number,
  encounterCardId?: string | null,
): ExplorationSiteRuntime | null {
  if (content.exploration === undefined) return null;
  const availableEncounters = content.exploration.encounters.filter(
    (encounter) => idIndex(content).has(encounter.cardId.toLowerCase()),
  );
  if (availableEncounters.length === 0) return null;
  const encounter =
    encounterCardId === undefined || encounterCardId === null
      ? availableEncounters[
          hashStringToSeed(`${journey.seed}:${site.id}:exploration-card`) %
            availableEncounters.length
        ]
      : availableEncounters.find(
          (candidate) =>
            candidate.cardId.toLowerCase() === encounterCardId.toLowerCase(),
        );
  if (encounter === undefined) return null;
  const offers = encounter.actions.map((action) =>
    buildLegacyActionOffer(
      action,
      journey,
      content,
      rng,
      encounter.cardId,
      site,
    ),
  );
  if (offers.some((offer) => offer === null)) return null;
  return {
    kind: "exploration",
    encounterCardId: encounter.cardId,
    actionOffers: offers as ExplorationActionOfferRuntime[],
    resolution: null,
  };
}

/** Build the shared source-card encounter and every randomized follow-up offer. */
export function buildExplorationRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  _rng: () => number,
  encounterCardId?: string | null,
): ExplorationSiteRuntime | null {
  if (content.exploration === undefined) return null;
  const availableEncounters = content.exploration.encounters.filter(
    (encounter) => idIndex(content).has(encounter.cardId.toLowerCase()),
  );
  if (availableEncounters.length === 0) return null;
  const ordered = [...availableEncounters].sort((left, right) =>
    left.cardId.localeCompare(right.cardId),
  );
  const forced =
    encounterCardId === undefined || encounterCardId === null
      ? null
      : (ordered.find(
          (candidate) =>
            candidate.cardId.toLowerCase() === encounterCardId.toLowerCase(),
        ) ?? null);
  if (
    encounterCardId !== undefined &&
    encounterCardId !== null &&
    forced === null
  ) {
    return null;
  }
  const encounterRequest: RewardSelectionRequest = {
    mechanicId: "catalog-card-chooser",
    policyId: "uniform",
    scope: {
      journeySeed: journey.seed,
      siteUuid: site.id,
      selectionKey: "exploration-encounter",
    },
    count: 1,
  };
  const stream = createRewardSelectionStream(encounterRequest, "encounter");
  if (forced === null) {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(stream.draw() * (index + 1));
      [ordered[index], ordered[swapIndex]] = [
        ordered[swapIndex],
        ordered[index],
      ];
    }
  }
  const attempts = forced === null ? ordered : [forced];
  for (const encounter of attempts) {
    const offers = encounter.actions.map((action) =>
      buildActionOffer(action, journey, content, site, encounter.cardId),
    );
    if (offers.some((offer) => offer === null)) continue;
    const actionOffers = offers as ExplorationActionOfferRuntime[];
    const selectionContentRevision = actionOffers.find(
      (offer) => offer.selectionContentRevision !== undefined,
    )?.selectionContentRevision;
    return {
      kind: "exploration",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      ...(selectionContentRevision === undefined
        ? {}
        : { selectionContentRevision }),
      encounterSignature: explorationEncounterSignature(
        encounter.cardId,
        actionOffers,
      ),
      encounterCardId: encounter.cardId,
      actionOffers,
      resolution: null,
    };
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    return null;
  }
  const strings = value as string[];
  return new Set(strings).size === strings.length ? strings : null;
}

function stringSequence(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    return null;
  }
  return value as string[];
}

function hasExactSelectionKeys(
  selection: ExplorationSelection,
  expected: readonly string[],
): boolean {
  return equalStrings(Object.keys(selection).sort(), [...expected].sort());
}

function cardForEntry(
  journey: JourneyState,
  content: JourneyContent,
  entryId: string,
): { entry: DeckEntry; card: CardData } | null {
  const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;
  const base = content.cardDatabase.get(entry.cardNumber);
  return base === undefined
    ? null
    : {
        entry,
        card: resolveDeckEntryCard(content.transfigurationData, base, entry),
      };
}

function cardIdForEntry(
  journey: JourneyState,
  content: JourneyContent,
  entryId: string,
): string | null {
  return cardForEntry(journey, content, entryId)?.card.id ?? null;
}

function addCardEffect(
  content: JourneyContent,
  cardId: string,
): JourneyRewardEffect | null {
  const card = idIndex(content).get(cardId.toLowerCase());
  if (card === undefined) return null;
  return {
    kind: "add_catalog_card",
    cardUuid: card.id,
    cardNumber: card.cardNumber,
  };
}

function deckTarget(
  journey: JourneyState,
  content: JourneyContent,
  entryId: string,
): { entryId: string; cardUuid: string; cardNumber: number } | null {
  const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;
  const card = content.cardDatabase.get(entry.cardNumber);
  return card === undefined
    ? null
    : { entryId, cardUuid: card.id, cardNumber: card.cardNumber };
}

function dreamsignForId(
  content: JourneyContent,
  dreamsignId: string,
): Dreamsign | null {
  const custom = content.exploration?.customDreamsigns.find(
    (dreamsign) => dreamsign.id?.toLowerCase() === dreamsignId.toLowerCase(),
  );
  const template = content.dreamsignTemplates.find(
    (dreamsign) => dreamsign.id.toLowerCase() === dreamsignId.toLowerCase(),
  );
  return custom ?? (template === undefined ? null : createDreamsign(template));
}

function addDreamsign(
  journey: JourneyState,
  content: JourneyContent,
  dreamsignId: string,
  replacedDreamsignId: string | null,
): JourneyState | null {
  const reward = dreamsignForId(content, dreamsignId);
  if (reward === null) return null;

  let dreamsigns: Dreamsign[];
  if (journey.dreamsigns.length >= journey.maxDreamsigns) {
    if (replacedDreamsignId === null) return null;
    const index = journey.dreamsigns.findIndex(
      (dreamsign) => dreamsign.id === replacedDreamsignId,
    );
    if (index < 0) return null;
    dreamsigns = journey.dreamsigns.map((dreamsign, candidateIndex) =>
      candidateIndex === index ? reward : dreamsign,
    );
  } else {
    dreamsigns = [...journey.dreamsigns, reward];
  }
  return {
    ...journey,
    dreamsigns,
    remainingDreamsignPool: journey.remainingDreamsignPool.filter(
      (id) => id.toLowerCase() !== dreamsignId.toLowerCase(),
    ),
  };
}

function typeChange(subtype: string) {
  return {
    predicateId: `exploration:subtype:${subtype.toLowerCase().split(" ").join("-")}`,
    cardType: "Character" as const,
    subtype,
    label: subtype,
  };
}

function cardTypeChange(cardType: CardType): CardTypeChange {
  return {
    predicateId: `exploration:card-type:${cardType.toLowerCase()}`,
    cardType,
    subtype: "",
    label: cardType,
  };
}

function baseResolution(actionId: string): ExplorationResolution {
  return {
    actionId,
    selection: {},
    gainedCardIds: [],
    gainedEntryIds: [],
    gainedDreamsignIds: [],
    purgedCardIds: [],
    purgedEntryIds: [],
    purgedEntrySnapshots: [],
    purgedDreamsignIds: [],
    starterCardReplacements: [],
    starterCardTransfigurations: [],
    cardTransfigurations: [],
    cardReplacements: [],
    cardCopies: [],
    cardTypeChanges: [],
    cardKeywordChanges: [],
    nightmareGains: [],
    affectedEntryIds: [],
    essenceGained: 0,
  };
}

function isEmptySelectionIntent(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  );
}

function equalStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validEssenceMutationOffer(input: {
  action: ExplorationActionContent;
  offer: ExplorationActionOfferRuntime;
  journey: JourneyState;
  site: SiteState;
  encounterCardId: string;
  content: JourneyContent;
}): boolean {
  const { action, offer, journey, site, encounterCardId, content } = input;
  const expectedRevision = buildRewardSelectionContext({
    journeyState: journey,
    journeyContent: content,
    site,
  }).selectionContentRevision;
  if (
    offer.canonicalMechanicId !== "essence-mutation" ||
    offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
    offer.selectionContentRevision !== expectedRevision ||
    offer.selectionKey !== essenceSelectionKey(encounterCardId, action.id)
  ) {
    return false;
  }
  if (action.effectKind === "gain-random-essence") {
    const minimumEssence = action.minimumEssence;
    const maximumEssence = action.maximumEssence;
    const preparation = offer.essencePreparation;
    const amount = offer.preparedEssenceAmount;
    if (
      offer.selectionPolicyId !== "uniform" ||
      !Number.isInteger(minimumEssence) ||
      !Number.isInteger(maximumEssence) ||
      preparation === undefined ||
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      preparation.minimumEssence !== minimumEssence ||
      preparation.maximumEssence !== maximumEssence ||
      minimumEssence <= 0 ||
      preparation.purpose !== ESSENCE_AMOUNT_PURPOSE ||
      preparation.drawsConsumed !== 1 ||
      amount < minimumEssence ||
      amount > maximumEssence
    ) {
      return false;
    }
    const expectedStream = createRewardSelectionStream(
      essenceSelectionRequest({
        journey,
        site,
        encounterCardId,
        actionId: action.id,
      }),
      ESSENCE_AMOUNT_PURPOSE,
    );
    if (!equalStrings(preparation.saltParts, expectedStream.saltParts)) {
      return false;
    }
  } else if (
    offer.selectionPolicyId !== undefined ||
    offer.preparedEssenceAmount !== undefined ||
    offer.essencePreparation !== undefined
  ) {
    return false;
  }
  return (
    offer.selectionSignature ===
    essenceSelectionSignature(action, encounterCardId, offer)
  );
}

function validShopPurchaseModifierOffer(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
): boolean {
  if (
    (action.effectKind !== "free-next-shop" &&
      action.effectKind !== "lose-half-essence-and-free-purchases") ||
    stableDigest(offer) !==
      stableDigest(emptyOffer(action.id, "shop-purchase-modifier"))
  ) {
    return false;
  }
  return action.effectKind === "free-next-shop"
    ? action.count === undefined
    : Number.isInteger(action.count) && (action.count ?? 0) > 0;
}

function withResolution(
  journey: JourneyState,
  siteId: string,
  runtime: ExplorationSiteRuntime,
  resolution: ExplorationResolution,
): JourneyState {
  return {
    ...journey,
    siteRuntime: {
      ...journey.siteRuntime,
      [siteId]: { ...runtime, resolution },
    },
  };
}

/** Apply one selected action atomically while keeping the site open for its response. */
export function resolveExplorationChoice(input: {
  journey: JourneyState;
  site: SiteState;
  payload: Record<string, unknown>;
  seq: number;
  content: JourneyContent;
}): JourneyState | null {
  const { journey, site, payload, seq, content } = input;
  if (site.type !== "Exploration" || journey.visitedSites.includes(site.id))
    return null;
  const runtime = journey.siteRuntime[site.id];
  if (runtime?.kind !== "exploration" || runtime.resolution !== null)
    return null;
  if (
    runtime.selectionRulesVersion !== undefined &&
    payload.selectionRulesVersion !== runtime.selectionRulesVersion
  )
    return null;
  if (content.exploration === undefined) return null;
  const actionId = stringValue(payload.actionId);
  if (actionId === null) return null;
  const encounter = explorationEncounterForCard(
    content.exploration,
    runtime.encounterCardId,
  );
  const action = encounter?.actions.find(
    (candidate) => candidate.id === actionId,
  );
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === actionId,
  );
  if (action === undefined || offer === undefined) return null;
  if (
    runtime.encounterSignature !== undefined &&
    runtime.encounterSignature !==
      explorationEncounterSignature(
        runtime.encounterCardId,
        runtime.actionOffers,
      )
  ) {
    return null;
  }
  const selection =
    typeof payload.selection === "object" && payload.selection !== null
      ? (payload.selection as ExplorationSelection)
      : {};
  if (usesOfferedDeckTarget(action)) {
    const entryIds = stringArray(selection.entryIds);
    if (
      entryIds === null ||
      entryIds.length !== 1 ||
      offer.offeredDeckEntryIds?.length !== 1 ||
      entryIds[0] !== offer.offeredDeckEntryIds[0]
    ) {
      return null;
    }
  }
  const result = baseResolution(actionId);
  if (runtime.selectionRulesVersion !== undefined) {
    result.selectionRulesVersion = runtime.selectionRulesVersion;
    result.selectionContentRevision =
      offer.selectionContentRevision ?? runtime.selectionContentRevision;
    result.encounterSignature = runtime.encounterSignature;
    if (offer.selectionSignature !== undefined) {
      result.selectionSignature = offer.selectionSignature;
    }
  }
  let next = journey;
  let mintIndex = 0;

  const applyReward = (effect: JourneyRewardEffect): boolean => {
    const applied = applyJourneyRewardEffect({
      state: next,
      journeyContent: content,
      effect,
      mintEntryId: (deck) => mintEntryId(deck, seq, mintIndex++),
    });
    if (applied === null) return false;
    next = applied;
    return true;
  };

  const addCardIds = (cardIds: readonly string[]): boolean => {
    const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
    const children = cardIds.map((cardId) => addCardEffect(content, cardId));
    if (children.some((child) => child === null)) return false;
    if (
      !applyReward({
        kind: "composite",
        children: children as JourneyRewardEffect[],
      })
    )
      return false;
    result.gainedCardIds.push(...cardIds);
    result.gainedEntryIds?.push(
      ...next.deck
        .filter((entry) => !beforeEntryIds.has(entry.entryId))
        .map((entry) => entry.entryId),
    );
    return true;
  };

  const duplicateEntry = (entryId: string, count: number): boolean => {
    if (!Number.isInteger(count) || count <= 0) return false;
    const target = deckTarget(next, content, entryId);
    const cardId = cardIdForEntry(next, content, entryId);
    if (target === null || cardId === null) return false;
    const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
    if (
      !applyReward({
        kind: "composite",
        children: Array.from({ length: count }, () => ({
          kind: "duplicate_deck_entry" as const,
          ...target,
        })),
      })
    ) {
      return false;
    }
    result.gainedCardIds.push(...Array.from({ length: count }, () => cardId));
    result.gainedEntryIds?.push(
      ...next.deck
        .filter((entry) => !beforeEntryIds.has(entry.entryId))
        .map((entry) => entry.entryId),
    );
    result.affectedEntryIds.push(entryId);
    return true;
  };

  const compoundKind = explorationCompoundActionKind(action.effectKind);
  if (compoundKind !== null) {
    const preparation = offer.compoundActionPreparation;
    const expectedOffer = buildCompoundActionOffer({
      action,
      journey,
      content,
      site,
      encounterCardId: runtime.encounterCardId,
    });
    const expectedPreparation = expectedOffer?.compoundActionPreparation;
    if (
      preparation === undefined ||
      expectedOffer === null ||
      expectedPreparation === undefined ||
      preparation.kind !== compoundKind ||
      preparation.unavailableReason !== undefined ||
      expectedPreparation.unavailableReason !== undefined ||
      stableDigest(offer) !== stableDigest(expectedOffer) ||
      !explorationCompoundActionPreparationsEqual(
        preparation,
        expectedPreparation,
      )
    ) {
      return null;
    }

    const validateTransfigurationTarget = (
      target: {
        entryId: string;
        cardId: string;
        transfiguration: TransfigurationType;
      },
      allowPerfected: boolean,
    ) => {
      const entry = journey.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      const baseCard =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      const effectiveCard = cardForEntry(
        journey,
        content,
        target.entryId,
      )?.card;
      const rewardTarget = deckTarget(journey, content, target.entryId);
      const eligibleForms =
        entry === undefined ||
        baseCard === undefined ||
        effectiveCard === undefined
          ? []
          : allowPerfected
            ? eligibleTransfigurations(
                content.transfigurationData,
                effectiveCard,
              )
            : offeredTransfigurationForms(
                content.transfigurationData,
                effectiveCard,
                null,
              ).map(({ type }) => type);
      return entry === undefined ||
        baseCard === undefined ||
        effectiveCard === undefined ||
        rewardTarget === null ||
        baseCard.id !== target.cardId ||
        entry.transfiguration !== null ||
        !eligibleForms.includes(target.transfiguration)
        ? null
        : { entry, baseCard, rewardTarget, target };
    };

    switch (preparation.kind) {
      case "all-card-transfiguration": {
        if (!isEmptySelectionIntent(payload.selection)) return null;
        const targets = preparation.targets.map((target) =>
          validateTransfigurationTarget(target, false),
        );
        const validTargets = targets.filter(
          (target): target is NonNullable<(typeof targets)[number]> =>
            target !== null,
        );
        if (
          validTargets.length !== journey.deck.length ||
          validTargets.length !== preparation.allCards.length ||
          new Set(validTargets.map(({ target }) => target.entryId)).size !==
            validTargets.length ||
          !applyReward({
            kind: "composite",
            children: validTargets.map(({ target, rewardTarget }) => ({
              kind: "transfigure_deck_entry" as const,
              ...rewardTarget,
              transfiguration: target.transfiguration,
            })),
          })
        ) {
          return null;
        }
        result.selection = {};
        result.affectedEntryIds.push(
          ...validTargets.map(({ target }) => target.entryId),
        );
        result.cardTransfigurations = validTargets.map(({ target }) => ({
          entryId: target.entryId,
          cardId: target.cardId,
          beforeTransfiguration: null,
          afterTransfiguration: target.transfiguration,
        }));
        break;
      }
      case "purge-disclosed-transfigure-same-type": {
        const entryIds = stringArray(selection.entryIds);
        const purgeTarget = preparation.target;
        if (
          !hasExactSelectionKeys(selection, ["entryIds"]) ||
          entryIds === null ||
          entryIds.length !== 1 ||
          purgeTarget === null ||
          entryIds[0] !== purgeTarget.entryId ||
          preparation.companionTargets.length === 0
        ) {
          return null;
        }
        const purgedEntry = journey.deck.find(
          (entry) => entry.entryId === purgeTarget.entryId,
        );
        const purgedBase =
          purgedEntry === undefined
            ? undefined
            : content.cardDatabase.get(purgedEntry.cardNumber);
        const purgedEffective = cardForEntry(
          journey,
          content,
          purgeTarget.entryId,
        );
        const purgeRewardTarget = deckTarget(
          journey,
          content,
          purgeTarget.entryId,
        );
        const companions = preparation.companionTargets.map((target) =>
          validateTransfigurationTarget(target, true),
        );
        const validCompanions = companions.filter(
          (target): target is NonNullable<(typeof companions)[number]> =>
            target !== null,
        );
        if (
          purgedEntry === undefined ||
          purgedBase === undefined ||
          purgedEffective === null ||
          purgeRewardTarget === null ||
          purgedBase.id !== purgeTarget.cardId ||
          purgedEffective.card.cardType !== purgeTarget.effectiveCardType ||
          validCompanions.length !== preparation.companionTargets.length ||
          validCompanions.some(
            ({ target }) => target.entryId === purgeTarget.entryId,
          ) ||
          !applyReward({
            kind: "composite",
            children: [
              { kind: "remove_deck_entry", ...purgeRewardTarget },
              ...validCompanions.map(({ target, rewardTarget }) => ({
                kind: "transfigure_deck_entry" as const,
                ...rewardTarget,
                transfiguration: target.transfiguration,
              })),
            ],
          })
        ) {
          return null;
        }
        result.selection = { entryIds };
        result.resolvedCardType = purgeTarget.effectiveCardType;
        result.purgedEntryIds?.push(purgeTarget.entryId);
        result.purgedCardIds.push(purgeTarget.cardId);
        result.purgedEntrySnapshots?.push(purgedEntry);
        result.affectedEntryIds.push(
          purgeTarget.entryId,
          ...validCompanions.map(({ target }) => target.entryId),
        );
        result.cardTransfigurations = validCompanions.map(({ target }) => ({
          entryId: target.entryId,
          cardId: target.cardId,
          beforeTransfiguration: null,
          afterTransfiguration: target.transfiguration,
        }));
        break;
      }
      case "predicate-fast-nightmares": {
        if (!isEmptySelectionIntent(payload.selection)) return null;
        const validatedTargets = preparation.targets.map((target) => {
          const resolved = cardForEntry(journey, content, target.entryId);
          const rewardTarget = deckTarget(journey, content, target.entryId);
          return resolved === null ||
            rewardTarget === null ||
            resolved.card.id !== target.cardId ||
            !matchesPredicate(resolved.card, preparation.predicate, content)
            ? null
            : { ...resolved, rewardTarget, target };
        });
        const validTargets = validatedTargets.filter(
          (target): target is NonNullable<(typeof validatedTargets)[number]> =>
            target !== null,
        );
        const nightmare = addCardEffect(content, NIGHTMARE_CARD_ID);
        if (
          validTargets.length !== preparation.targets.length ||
          nightmare === null ||
          !Number.isInteger(preparation.nightmareCount) ||
          preparation.nightmareCount <= 0
        ) {
          return null;
        }
        const beforeEntryIds = new Set(
          journey.deck.map(({ entryId }) => entryId),
        );
        const keywordChanges: ExplorationCardKeywordChange[] = validTargets.map(
          ({ entry, target }) => ({
            entryId: target.entryId,
            cardId: target.cardId,
            before: entry.keywordModification ?? null,
            after: mergeCardKeywordModification(entry.keywordModification, {
              fast: true,
            }),
          }),
        );
        if (
          !applyReward({
            kind: "composite",
            children: [
              ...validTargets.map(({ rewardTarget }) => ({
                kind: "change_deck_entry_keywords" as const,
                ...rewardTarget,
                keywords: { fast: true },
              })),
              ...Array.from(
                { length: preparation.nightmareCount },
                () => nightmare,
              ),
            ],
          })
        ) {
          return null;
        }
        const mintedNightmares = next.deck.filter(
          ({ entryId }) => !beforeEntryIds.has(entryId),
        );
        if (mintedNightmares.length !== preparation.nightmareCount) return null;
        result.selection = {};
        result.resolvedPredicate = preparation.predicate;
        result.affectedEntryIds.push(
          ...validTargets.map(({ target }) => target.entryId),
        );
        result.cardKeywordChanges = keywordChanges;
        result.gainedEntryIds?.push(
          ...mintedNightmares.map(({ entryId }) => entryId),
        );
        result.gainedCardIds.push(
          ...mintedNightmares.map(() => NIGHTMARE_CARD_ID),
        );
        result.nightmareGains = mintedNightmares.map(({ entryId }) => ({
          entryId,
          cardId: NIGHTMARE_CARD_ID,
        }));
        break;
      }
      case "take-transfigured-nightmares": {
        const cardIds = stringArray(selection.cardIds);
        if (
          !hasExactSelectionKeys(selection, ["cardIds"]) ||
          cardIds === null ||
          cardIds.length > preparation.offerCount ||
          cardIds.some(
            (cardId) =>
              !preparation.offeredCards.some(
                (offered) => offered.cardId === cardId,
              ),
          )
        ) {
          return null;
        }
        const selected = cardIds.map((cardId) =>
          preparation.offeredCards.find((offered) => offered.cardId === cardId),
        );
        if (selected.some((offered) => offered === undefined)) return null;
        const selectedCards = selected as Array<
          NonNullable<(typeof selected)[number]>
        >;
        const selectedEffects = selectedCards.map(
          ({ cardId, transfiguration }) => {
            const effect = addCardEffect(content, cardId);
            return effect?.kind === "add_catalog_card"
              ? { ...effect, transfiguration }
              : null;
          },
        );
        const nightmare = addCardEffect(content, NIGHTMARE_CARD_ID);
        if (
          selectedEffects.some((effect) => effect === null) ||
          nightmare === null ||
          !Number.isInteger(preparation.nightmareCount) ||
          preparation.nightmareCount <= 0
        ) {
          return null;
        }
        const beforeEntryIds = new Set(
          journey.deck.map(({ entryId }) => entryId),
        );
        if (
          !applyReward({
            kind: "composite",
            children: [
              ...(selectedEffects as JourneyRewardEffect[]),
              ...Array.from(
                { length: preparation.nightmareCount },
                () => nightmare,
              ),
            ],
          })
        ) {
          return null;
        }
        const minted = next.deck.filter(
          ({ entryId }) => !beforeEntryIds.has(entryId),
        );
        const gainedCards = minted.slice(0, selectedCards.length);
        const gainedNightmares = minted.slice(selectedCards.length);
        if (
          gainedCards.length !== selectedCards.length ||
          gainedNightmares.length !== preparation.nightmareCount
        ) {
          return null;
        }
        result.selection = { cardIds };
        result.resolvedPredicate = preparation.predicate;
        result.gainedEntryIds?.push(...minted.map(({ entryId }) => entryId));
        result.gainedCardIds.push(
          ...selectedCards.map(({ cardId }) => cardId),
          ...gainedNightmares.map(() => NIGHTMARE_CARD_ID),
        );
        result.affectedEntryIds.push(
          ...gainedCards.map(({ entryId }) => entryId),
        );
        result.cardTransfigurations = gainedCards.map((entry, index) => ({
          entryId: entry.entryId,
          cardId: selectedCards[index].cardId,
          beforeTransfiguration: null,
          afterTransfiguration: selectedCards[index].transfiguration,
        }));
        result.nightmareGains = gainedNightmares.map(({ entryId }) => ({
          entryId,
          cardId: NIGHTMARE_CARD_ID,
        }));
        break;
      }
      case "purge-transfigure-copy": {
        const entryIds = stringArray(selection.entryIds);
        if (
          !hasExactSelectionKeys(selection, ["entryIds"]) ||
          entryIds === null ||
          entryIds.length !== 1 ||
          !preparation.targets.some((target) => target.entryId === entryIds[0])
        ) {
          return null;
        }
        const purged = preparation.targets.find(
          (target) => target.entryId === entryIds[0],
        );
        const companions = preparation.targets.filter(
          (target) => target.entryId !== entryIds[0],
        );
        if (purged === undefined || companions.length !== 3) return null;
        const validated = preparation.targets.map((target) =>
          validateTransfigurationTarget(target, true),
        );
        const valid = validated.filter(
          (target): target is NonNullable<(typeof validated)[number]> =>
            target !== null,
        );
        const purgeValidated = valid.find(
          ({ target }) => target.entryId === purged.entryId,
        );
        const validCompanions = companions.map((companion) =>
          valid.find(({ target }) => target.entryId === companion.entryId),
        );
        if (
          valid.length !== preparation.targets.length ||
          purgeValidated === undefined ||
          validCompanions.some((target) => target === undefined)
        ) {
          return null;
        }
        const companionsToApply = validCompanions as Array<
          NonNullable<(typeof validCompanions)[number]>
        >;
        const beforeEntryIds = new Set(
          journey.deck.map(({ entryId }) => entryId),
        );
        if (
          !applyReward({
            kind: "composite",
            children: [
              {
                kind: "remove_deck_entry",
                ...purgeValidated.rewardTarget,
              },
              ...companionsToApply.map(({ target, rewardTarget }) => ({
                kind: "transfigure_deck_entry" as const,
                ...rewardTarget,
                transfiguration: target.transfiguration,
              })),
              ...companionsToApply.map(({ rewardTarget }) => ({
                kind: "duplicate_deck_entry" as const,
                ...rewardTarget,
              })),
            ],
          })
        ) {
          return null;
        }
        const minted = next.deck.filter(
          ({ entryId }) => !beforeEntryIds.has(entryId),
        );
        if (minted.length !== companionsToApply.length) return null;
        result.selection = { entryIds };
        result.purgedEntryIds?.push(purged.entryId);
        result.purgedCardIds.push(purged.cardId);
        result.purgedEntrySnapshots?.push(purgeValidated.entry);
        result.affectedEntryIds.push(
          purged.entryId,
          ...companionsToApply.map(({ target }) => target.entryId),
        );
        result.cardTransfigurations = companionsToApply.map(({ target }) => ({
          entryId: target.entryId,
          cardId: target.cardId,
          beforeTransfiguration: null,
          afterTransfiguration: target.transfiguration,
        }));
        result.gainedEntryIds?.push(...minted.map(({ entryId }) => entryId));
        result.gainedCardIds.push(
          ...companionsToApply.map(({ target }) => target.cardId),
        );
        result.cardCopies = companionsToApply.map(({ target }, index) => ({
          sourceEntryId: target.entryId,
          sourceCardId: target.cardId,
          mintedEntryId: minted[index].entryId,
          mintedCardId: target.cardId,
        }));
        break;
      }
    }
    return withResolution(next, site.id, runtime, result);
  }

  if (isExplorationMultiCardReplacementEffect(action)) {
    const preparation = offer.multiCardReplacementPreparation;
    const expectedPreparation = prepareMultiCardReplacementPlan({
      actionId: action.id,
      encounterCardId: runtime.encounterCardId,
      predicate: action.predicate,
      count: action.count,
      journey,
      site,
      content,
    });
    if (
      preparation === undefined ||
      preparation.unavailableReason !== undefined ||
      expectedPreparation.unavailableReason !== undefined ||
      offer.canonicalMechanicId !== "replace-deck-entry" ||
      offer.selectionPolicyId !== "card-fit-quality" ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !==
        expectedPreparation.selectionContentRevision ||
      offer.selectionKey !== action.id ||
      offer.selectionSignature !== preparation.planSignature ||
      !equalStrings(offer.offeredDeckEntryIds ?? [], []) ||
      stableDigest(offer.replacementCardIdByEntryId) !== stableDigest({}) ||
      stableDigest(offer.selectionTraces ?? []) !==
        stableDigest(expectedPreparation.selectorTraces) ||
      !multiCardReplacementPreparationsEqual(preparation, expectedPreparation)
    ) {
      return null;
    }

    const entryIds = stringArray(selection.entryIds);
    const maximum = Math.min(action.count, preparation.bindings.length);
    if (
      !hasExactSelectionKeys(selection, ["entryIds"]) ||
      entryIds === null ||
      entryIds.length < 1 ||
      entryIds.length > maximum
    ) {
      return null;
    }
    const selected = entryIds.map((entryId) => {
      const binding = preparation.bindings.find(
        (candidate) => candidate.sourceEntryId === entryId,
      );
      const entry = journey.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      const sourceCard =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      const sourceTarget = deckTarget(journey, content, entryId);
      const replacement =
        binding === undefined
          ? null
          : addCardEffect(content, binding.replacementCardId);
      return binding === undefined ||
        entry === undefined ||
        sourceCard === undefined ||
        sourceTarget === null ||
        replacement === null ||
        sourceCard.id !== binding.sourceCardId
        ? null
        : { binding, entry, sourceTarget, replacement };
    });
    if (selected.some((target) => target === null)) return null;
    const valid = selected as Array<NonNullable<(typeof selected)[number]>>;
    const beforeEntryIds = new Set(journey.deck.map((entry) => entry.entryId));
    if (
      !applyReward({
        kind: "composite",
        children: valid.flatMap(({ sourceTarget, replacement }) => [
          { kind: "remove_deck_entry" as const, ...sourceTarget },
          replacement,
        ]),
      })
    ) {
      return null;
    }
    const mintedEntries = next.deck.filter(
      (entry) => !beforeEntryIds.has(entry.entryId),
    );
    if (mintedEntries.length !== valid.length) return null;

    result.selection = { entryIds };
    result.resolvedPredicate = action.predicate;
    result.affectedEntryIds.push(...entryIds);
    result.purgedEntryIds?.push(...entryIds);
    result.purgedEntrySnapshots?.push(...valid.map(({ entry }) => entry));
    result.purgedCardIds.push(
      ...valid.map(({ binding }) => binding.sourceCardId),
    );
    result.gainedEntryIds?.push(...mintedEntries.map(({ entryId }) => entryId));
    result.gainedCardIds.push(
      ...valid.map(({ binding }) => binding.replacementCardId),
    );
    result.cardReplacements = valid.map(({ binding }, index) => ({
      sourceEntryId: binding.sourceEntryId,
      sourceCardId: binding.sourceCardId,
      replacementEntryId: mintedEntries[index].entryId,
      replacementCardId: binding.replacementCardId,
    }));
    return withResolution(next, site.id, runtime, result);
  }

  if (
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered"
  ) {
    const cardType = action.cardType;
    if (cardType !== "Character" && cardType !== "Event") return null;
    const preparation = offer.disclosedDeckTargetPreparation;
    const expectedPreparation = prepareExplorationDisclosedDeckTargetPlan({
      effectKind: action.effectKind,
      cardType,
      actionId: action.id,
      encounterCardId: runtime.encounterCardId,
      journey,
      site,
      content,
    });
    const entryIds = stringArray(selection.entryIds);
    if (
      preparation === undefined ||
      preparation.unavailableReason !== undefined ||
      preparation.target === null ||
      expectedPreparation.unavailableReason !== undefined ||
      expectedPreparation.target === null ||
      !hasExactSelectionKeys(selection, ["entryIds"]) ||
      entryIds === null ||
      entryIds.length !== 1 ||
      entryIds[0] !== preparation.target.entryId ||
      offer.canonicalMechanicId !== "change-entry-card-type" ||
      offer.selectionPolicyId !== "deck-entry-centrality" ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !==
        expectedPreparation.selectionContentRevision ||
      offer.selectionKey !== expectedPreparation.selectionKey ||
      offer.selectionSignature !== preparation.planSignature ||
      !equalStrings(offer.offeredDeckEntryIds ?? [], entryIds) ||
      stableDigest(offer.selectionTrace ?? null) !==
        stableDigest(expectedPreparation.selectorTrace ?? null) ||
      !explorationDisclosedDeckTargetPreparationsEqual(
        preparation,
        expectedPreparation,
      ) ||
      offer.randomDeckTargetPreparation !== undefined ||
      offer.multiCardReplacementPreparation !== undefined ||
      offer.multiCardTransfigurationPreparation !== undefined ||
      offer.starterCardPreparation !== undefined ||
      offer.starterCardTransfigurationPreparation !== undefined ||
      offer.dreamsignPreparation !== undefined ||
      offer.siteInsertionPreparation !== undefined ||
      offer.siteTypeChoicePreparation !== undefined ||
      offer.compoundActionPreparation !== undefined ||
      offer.offeredCardIds.length !== 0 ||
      offer.packCardIds.length !== 0 ||
      Object.keys(offer.replacementCardIdByEntryId).length !== 0 ||
      Object.keys(offer.transfigurationByEntryId).length !== 0
    ) {
      return null;
    }
    const entry = journey.deck.find(
      (candidate) => candidate.entryId === preparation.target?.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    const effective =
      entry === undefined
        ? null
        : cardForEntry(journey, content, entry.entryId);
    const rewardTarget =
      entry === undefined ? null : deckTarget(journey, content, entry.entryId);
    if (
      entry === undefined ||
      base === undefined ||
      effective === null ||
      rewardTarget === null ||
      base.id !== preparation.target.cardId ||
      effective.card.cardType === cardType
    ) {
      return null;
    }
    const afterTypeChange = cardTypeChange(cardType);
    if (
      !applyReward({
        kind: "change_deck_entry_type",
        ...rewardTarget,
        typeChange: afterTypeChange,
      })
    ) {
      return null;
    }
    result.selection = { entryIds };
    result.affectedEntryIds.push(entry.entryId);
    result.resolvedCardType = cardType;
    result.cardTypeChanges = [
      {
        entryId: entry.entryId,
        cardId: base.id,
        beforeCardType: effective.card.cardType,
        afterCardType: cardType,
        beforeTypeChange: entry.typeChange ?? null,
        afterTypeChange,
      },
    ];
    return withResolution(next, site.id, runtime, result);
  }

  if (isExplorationRandomDeckTargetEffect(action)) {
    const preparation = offer.randomDeckTargetPreparation;
    const expectedPreparation = prepareExplorationRandomDeckTargetPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      count: action.count,
      cardType: action.cardType,
      replacementCardId: action.cardId,
      actionId: action.id,
      encounterCardId: runtime.encounterCardId,
      journey,
      site,
      content,
    });
    const expectedMechanic =
      action.effectKind === "copy-random-cards"
        ? "duplicate-deck-entry"
        : action.effectKind === "change-random-card-type"
          ? "change-entry-card-type"
          : "replace-deck-entry";
    if (
      !isEmptySelectionIntent(payload.selection) ||
      preparation === undefined ||
      preparation.unavailableReason !== undefined ||
      expectedPreparation.unavailableReason !== undefined ||
      offer.canonicalMechanicId !== expectedMechanic ||
      offer.selectionPolicyId !== "uniform" ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !==
        expectedPreparation.selectionContentRevision ||
      offer.selectionKey !== expectedPreparation.selectionKey ||
      offer.selectionSignature !== preparation.planSignature ||
      !equalStrings(offer.offeredDeckEntryIds ?? [], []) ||
      offer.disclosedDeckTargetPreparation !== undefined ||
      offer.multiCardReplacementPreparation !== undefined ||
      offer.multiCardTransfigurationPreparation !== undefined ||
      offer.starterCardPreparation !== undefined ||
      offer.starterCardTransfigurationPreparation !== undefined ||
      offer.dreamsignPreparation !== undefined ||
      offer.siteInsertionPreparation !== undefined ||
      offer.siteTypeChoicePreparation !== undefined ||
      offer.compoundActionPreparation !== undefined ||
      offer.offeredCardIds.length !== 0 ||
      offer.packCardIds.length !== 0 ||
      Object.keys(offer.replacementCardIdByEntryId).length !== 0 ||
      Object.keys(offer.transfigurationByEntryId).length !== 0 ||
      stableDigest(offer.selectionTrace ?? null) !==
        stableDigest(expectedPreparation.selectorTrace ?? null) ||
      !explorationRandomDeckTargetPreparationsEqual(
        preparation,
        expectedPreparation,
      )
    ) {
      return null;
    }
    const validated = preparation.targets.map((target) => {
      const entry = journey.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      const baseCard =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      const effective = cardForEntry(journey, content, target.entryId);
      const rewardTarget = deckTarget(journey, content, target.entryId);
      return entry === undefined ||
        baseCard === undefined ||
        effective === null ||
        rewardTarget === null ||
        baseCard.id !== target.cardId
        ? null
        : { target, entry, effectiveCard: effective.card, rewardTarget };
    });
    const targets = validated.filter(
      (target): target is NonNullable<(typeof validated)[number]> =>
        target !== null,
    );
    if (
      targets.length !== preparation.count ||
      targets.length !== validated.length ||
      new Set(targets.map(({ target }) => target.entryId)).size !==
        targets.length
    ) {
      return null;
    }

    result.selection = {};
    result.affectedEntryIds.push(
      ...targets.map(({ target }) => target.entryId),
    );
    if (action.effectKind === "copy-random-cards") {
      const beforeEntryIds = new Set(
        journey.deck.map((entry) => entry.entryId),
      );
      if (
        !applyReward({
          kind: "composite",
          children: targets.map(({ rewardTarget }) => ({
            kind: "duplicate_deck_entry" as const,
            ...rewardTarget,
          })),
        })
      ) {
        return null;
      }
      const mintedEntries = next.deck.filter(
        (entry) => !beforeEntryIds.has(entry.entryId),
      );
      if (mintedEntries.length !== targets.length) return null;
      result.gainedEntryIds?.push(
        ...mintedEntries.map(({ entryId }) => entryId),
      );
      result.gainedCardIds.push(...targets.map(({ target }) => target.cardId));
      result.cardCopies = targets.map(({ target }, index) => ({
        sourceEntryId: target.entryId,
        sourceCardId: target.cardId,
        mintedEntryId: mintedEntries[index].entryId,
        mintedCardId: target.cardId,
      }));
      return withResolution(next, site.id, runtime, result);
    }

    if (action.effectKind === "replace-random-with-card") {
      const target = targets[0];
      const replacementCardId = action.cardId;
      const replacement =
        replacementCardId === undefined
          ? null
          : addCardEffect(content, replacementCardId);
      if (
        target === undefined ||
        replacementCardId === undefined ||
        preparation.replacementCardId !== replacementCardId ||
        action.predicate === undefined ||
        !matchesPredicate(target.effectiveCard, action.predicate, content) ||
        replacement === null
      ) {
        return null;
      }
      const beforeEntryIds = new Set(
        journey.deck.map((entry) => entry.entryId),
      );
      if (
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...target.rewardTarget },
            replacement,
          ],
        })
      ) {
        return null;
      }
      const mintedEntries = next.deck.filter(
        (entry) => !beforeEntryIds.has(entry.entryId),
      );
      if (mintedEntries.length !== 1) return null;
      const minted = mintedEntries[0];
      result.resolvedPredicate = action.predicate;
      result.purgedEntryIds?.push(target.target.entryId);
      result.purgedEntrySnapshots?.push(target.entry);
      result.purgedCardIds.push(target.target.cardId);
      result.gainedEntryIds?.push(minted.entryId);
      result.gainedCardIds.push(replacementCardId);
      result.cardReplacements = [
        {
          sourceEntryId: target.target.entryId,
          sourceCardId: target.target.cardId,
          replacementEntryId: minted.entryId,
          replacementCardId,
        },
      ];
      return withResolution(next, site.id, runtime, result);
    }

    const resolvedCardType = action.cardType;
    if (
      resolvedCardType === undefined ||
      targets.some(
        ({ effectiveCard }) => effectiveCard.cardType === resolvedCardType,
      )
    ) {
      return null;
    }
    const afterTypeChange = cardTypeChange(resolvedCardType);
    if (
      !applyReward({
        kind: "composite",
        children: targets.map(({ rewardTarget }) => ({
          kind: "change_deck_entry_type" as const,
          ...rewardTarget,
          typeChange: afterTypeChange,
        })),
      })
    ) {
      return null;
    }
    result.resolvedCardType = resolvedCardType;
    result.cardTypeChanges = targets.map(
      ({ target, entry, effectiveCard }) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeCardType: effectiveCard.cardType,
        afterCardType: resolvedCardType,
        beforeTypeChange: entry.typeChange ?? null,
        afterTypeChange,
      }),
    );
    return withResolution(next, site.id, runtime, result);
  }

  if (isExplorationMultiCardTransfigurationEffect(action)) {
    const preparation = offer.multiCardTransfigurationPreparation;
    const expectedPreparation = prepareExplorationMultiCardTransfigurationPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      count: action.count,
      transfiguration: action.transfiguration,
      actionId: action.id,
      encounterCardId: runtime.encounterCardId,
      journey,
      site,
      content,
    });
    const expectedTransfigurationByEntryId = Object.fromEntries(
      expectedPreparation.targets.map((target) => [
        target.entryId,
        target.transfiguration,
      ]),
    );
    const expectedPolicy =
      action.effectKind === "transfigure-selected" ||
      action.effectKind === "transfigure-fixed-selected"
        ? "transfiguration-value"
        : "uniform";
    if (
      preparation === undefined ||
      preparation.unavailableReason !== undefined ||
      expectedPreparation.unavailableReason !== undefined ||
      offer.canonicalMechanicId !== "transfigure-deck-entry" ||
      offer.selectionPolicyId !== expectedPolicy ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !==
        expectedPreparation.selectionContentRevision ||
      offer.selectionKey !== action.id ||
      offer.selectionSignature !== preparation.planSignature ||
      !equalStrings(offer.offeredDeckEntryIds ?? [], []) ||
      stableDigest(offer.transfigurationByEntryId) !==
        stableDigest(expectedTransfigurationByEntryId) ||
      stableDigest(offer.selectionTraces ?? []) !==
        stableDigest(expectedPreparation.selectorTraces) ||
      !explorationMultiCardTransfigurationPreparationsEqual(
        preparation,
        expectedPreparation,
      )
    ) {
      return null;
    }

    const authoredCount = action.count;
    if (!Number.isInteger(authoredCount) || (authoredCount as number) <= 0) {
      return null;
    }

    let requestedTargets: Array<{
      entryId: string;
      cardId: string;
      transfiguration: (typeof preparation.targets)[number]["transfiguration"];
    }>;
    if (action.effectKind === "transfigure-selected") {
      const entryIds = stringArray(selection.entryIds);
      const transfigurations = stringSequence(selection.transfigurations);
      if (
        !hasExactSelectionKeys(selection, ["entryIds", "transfigurations"]) ||
        entryIds === null ||
        transfigurations === null ||
        entryIds.length !== authoredCount ||
        transfigurations.length !== authoredCount ||
        preparation.targets.length !== 0
      ) {
        return null;
      }
      const selected = entryIds.map((entryId, index) => {
        const binding = preparation.eligibleCards.find(
          (candidate) => candidate.entryId === entryId,
        );
        const transfiguration = binding?.transfigurations.find(
          (candidate) => candidate === transfigurations[index],
        );
        return binding === undefined || transfiguration === undefined
          ? null
          : { entryId, cardId: binding.cardId, transfiguration };
      });
      if (selected.some((target) => target === null)) return null;
      requestedTargets = selected as typeof requestedTargets;
      result.selection = { entryIds, transfigurations };
    } else if (action.effectKind === "transfigure-fixed-selected") {
      const entryIds = stringArray(selection.entryIds);
      const fixedTransfiguration = action.transfiguration;
      if (
        !hasExactSelectionKeys(selection, ["entryIds"]) ||
        entryIds === null ||
        entryIds.length !== authoredCount ||
        preparation.targets.length !== 0 ||
        fixedTransfiguration === undefined
      ) {
        return null;
      }
      const selected = entryIds.map((entryId) => {
        const binding = preparation.eligibleCards.find(
          (candidate) => candidate.entryId === entryId,
        );
        return binding === undefined ||
          !binding.transfigurations.includes(fixedTransfiguration)
          ? null
          : {
              entryId,
              cardId: binding.cardId,
              transfiguration: fixedTransfiguration,
            };
      });
      if (selected.some((target) => target === null)) return null;
      requestedTargets = selected as typeof requestedTargets;
      result.selection = { entryIds };
    } else {
      if (!isEmptySelectionIntent(payload.selection)) return null;
      requestedTargets = preparation.targets.map((target) => ({ ...target }));
      result.selection = {};
    }

    if (
      requestedTargets.length !== authoredCount ||
      new Set(requestedTargets.map(({ entryId }) => entryId)).size !==
        requestedTargets.length
    ) {
      return null;
    }
    const validated = requestedTargets.map((target) => {
      const binding = preparation.eligibleCards.find(
        (candidate) =>
          candidate.entryId === target.entryId &&
          candidate.cardId === target.cardId &&
          candidate.transfigurations.includes(target.transfiguration),
      );
      const entry = journey.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      const card =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      const rewardTarget = deckTarget(journey, content, target.entryId);
      return binding === undefined ||
        entry === undefined ||
        card === undefined ||
        rewardTarget === null ||
        card.id !== target.cardId ||
        entry.transfiguration !== null
        ? null
        : { target, rewardTarget };
    });
    const validTargets = validated.filter(
      (target): target is NonNullable<(typeof validated)[number]> =>
        target !== null,
    );
    if (
      validTargets.length !== requestedTargets.length ||
      !applyReward({
        kind: "composite",
        children: validTargets.map(({ target, rewardTarget }) => ({
          kind: "transfigure_deck_entry" as const,
          ...rewardTarget,
          transfiguration: target.transfiguration,
        })),
      })
    ) {
      return null;
    }

    result.affectedEntryIds.push(
      ...validTargets.map(({ target }) => target.entryId),
    );
    result.cardTransfigurations = validTargets.map(({ target }) => ({
      entryId: target.entryId,
      cardId: target.cardId,
      beforeTransfiguration: null,
      afterTransfiguration: target.transfiguration,
    }));
    return withResolution(next, site.id, runtime, result);
  }

  if (isExplorationStarterCardTransfigurationEffectKind(action.effectKind)) {
    const preparation = offer.starterCardTransfigurationPreparation;
    const expectedPreparation =
      prepareExplorationStarterCardTransfigurationPlan({
        effectKind: action.effectKind,
        count: action.count,
        actionId: action.id,
        encounterCardId: runtime.encounterCardId,
        journey,
        site,
        content,
      });
    const expectedTransfigurationByEntryId = Object.fromEntries(
      expectedPreparation.targets.map((target) => [
        target.entryId,
        target.transfiguration,
      ]),
    );
    if (
      !isEmptySelectionIntent(payload.selection) ||
      preparation === undefined ||
      preparation.unavailableReason !== undefined ||
      expectedPreparation.unavailableReason !== undefined ||
      offer.canonicalMechanicId !== "transfigure-deck-entry" ||
      offer.selectionPolicyId !== "uniform" ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !==
        expectedPreparation.selectionContentRevision ||
      offer.selectionKey !== action.id ||
      offer.selectionSignature !== preparation.planSignature ||
      !equalStrings(offer.offeredDeckEntryIds ?? [], []) ||
      stableDigest(offer.transfigurationByEntryId) !==
        stableDigest(expectedTransfigurationByEntryId) ||
      stableDigest(offer.selectionTraces ?? []) !==
        stableDigest(expectedPreparation.selectorTraces) ||
      !explorationStarterCardTransfigurationPreparationsEqual(
        preparation,
        expectedPreparation,
      )
    ) {
      return null;
    }

    const targets = preparation.targets.map((target) => {
      const entry = journey.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      const card =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      const rewardTarget = deckTarget(journey, content, target.entryId);
      return entry === undefined ||
        card === undefined ||
        rewardTarget === null ||
        card.id !== target.cardId ||
        (card.isStarter !== true &&
          card.roles?.includes("starter-deck") !== true) ||
        entry.transfiguration !== null
        ? null
        : { target, rewardTarget };
    });
    const validTargets = targets.filter(
      (target): target is NonNullable<(typeof targets)[number]> =>
        target !== null,
    );
    if (
      targets.length === 0 ||
      validTargets.length !== targets.length ||
      new Set(validTargets.map(({ target }) => target.entryId)).size !==
        validTargets.length ||
      !applyReward({
        kind: "composite",
        children: validTargets.map(({ target, rewardTarget }) => ({
          kind: "transfigure_deck_entry" as const,
          ...rewardTarget,
          transfiguration: target.transfiguration,
        })),
      })
    ) {
      return null;
    }

    result.affectedEntryIds.push(
      ...validTargets.map(({ target }) => target.entryId),
    );
    result.starterCardTransfigurations = validTargets.map(({ target }) => ({
      entryId: target.entryId,
      cardId: target.cardId,
      beforeTransfiguration: null,
      afterTransfiguration: target.transfiguration,
    }));
    result.selection = {};
    return withResolution(next, site.id, runtime, result);
  }

  if (isExplorationStarterCardEffectKind(action.effectKind)) {
    const preparation = offer.starterCardPreparation;
    const expectedPreparation = prepareExplorationStarterCardPlan({
      effectKind: action.effectKind,
      predicate: action.predicate,
      actionId: action.id,
      encounterCardId: runtime.encounterCardId,
      journey,
      site,
      content,
    });
    const expectedMechanic =
      action.effectKind === "purge-starter-card" ||
      action.effectKind === "purge-random-starter-card"
        ? "purge-deck-entry"
        : "replace-deck-entry";
    const expectedPolicy =
      action.effectKind === "purge-starter-card" ||
      action.effectKind === "purge-random-starter-card"
        ? "uniform"
        : undefined;
    const expectedDisclosedEntryIds =
      action.effectKind === "purge-starter-card" &&
      expectedPreparation.unavailableReason === undefined
        ? expectedPreparation.purgedEntryIds
        : [];
    if (
      !isEmptySelectionIntent(payload.selection) ||
      preparation === undefined ||
      preparation.unavailableReason !== undefined ||
      expectedPreparation.unavailableReason !== undefined ||
      offer.canonicalMechanicId !== expectedMechanic ||
      offer.selectionPolicyId !== expectedPolicy ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !==
        expectedPreparation.selectionContentRevision ||
      offer.selectionKey !== action.id ||
      offer.selectionSignature !== preparation.planSignature ||
      !equalStrings(
        offer.offeredDeckEntryIds ?? [],
        expectedDisclosedEntryIds,
      ) ||
      stableDigest(offer.replacementCardIdByEntryId) !==
        stableDigest(preparation.replacementCardIdByEntryId) ||
      stableDigest(offer.selectionTraces ?? []) !==
        stableDigest(preparation.selectorTraces) ||
      !explorationStarterCardPreparationsEqual(preparation, expectedPreparation)
    ) {
      return null;
    }

    const purgedEntries = preparation.purgedEntryIds.map((entryId, index) => {
      const entry = journey.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      const card =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      return entry === undefined ||
        card === undefined ||
        card.id !== preparation.purgedCardIds[index] ||
        (card.isStarter !== true &&
          card.roles?.includes("starter-deck") !== true)
        ? null
        : { entry, card };
    });
    const targets = preparation.purgedEntryIds.map((entryId) =>
      deckTarget(journey, content, entryId),
    );
    const hasReplacements =
      action.effectKind === "purge-random-starter-and-gain-card" ||
      action.effectKind === "replace-all-starter-cards";
    const replacementCardIds = hasReplacements
      ? preparation.purgedEntryIds.map(
          (entryId) => preparation.replacementCardIdByEntryId[entryId],
        )
      : [];
    const replacementEffects = replacementCardIds.map((cardId) =>
      cardId === undefined ? null : addCardEffect(content, cardId),
    );
    const validPurgedEntries = purgedEntries.filter(
      (entry): entry is NonNullable<(typeof purgedEntries)[number]> =>
        entry !== null,
    );
    const validTargets = targets.filter(
      (target): target is NonNullable<(typeof targets)[number]> =>
        target !== null,
    );
    const validReplacementCardIds = replacementCardIds.filter(
      (cardId): cardId is string => cardId !== undefined,
    );
    const validReplacementEffects = replacementEffects.filter(
      (effect): effect is JourneyRewardEffect => effect !== null,
    );
    if (
      purgedEntries.length === 0 ||
      validPurgedEntries.length !== purgedEntries.length ||
      validTargets.length !== targets.length ||
      (hasReplacements &&
        (validReplacementCardIds.length !== purgedEntries.length ||
          new Set(validReplacementCardIds).size !== purgedEntries.length ||
          validReplacementEffects.length !== purgedEntries.length))
    ) {
      return null;
    }

    const beforeEntryIds = new Set(journey.deck.map((entry) => entry.entryId));
    if (
      !applyReward({
        kind: "composite",
        children: [
          ...validTargets.map((target) => ({
            kind: "remove_deck_entry" as const,
            ...target,
          })),
          ...validReplacementEffects,
        ],
      })
    ) {
      return null;
    }

    const gainedEntries = next.deck.filter(
      (entry) => !beforeEntryIds.has(entry.entryId),
    );
    if (gainedEntries.length !== replacementCardIds.length) return null;
    result.purgedEntryIds?.push(...preparation.purgedEntryIds);
    result.purgedCardIds.push(...preparation.purgedCardIds);
    result.purgedEntrySnapshots?.push(
      ...validPurgedEntries.map(({ entry }) => entry),
    );
    result.gainedCardIds.push(...validReplacementCardIds);
    result.gainedEntryIds?.push(...gainedEntries.map((entry) => entry.entryId));
    result.affectedEntryIds.push(
      ...preparation.purgedEntryIds,
      ...gainedEntries.map((entry) => entry.entryId),
    );
    result.starterCardReplacements = gainedEntries.map((entry, index) => ({
      purgedEntryId: preparation.purgedEntryIds[index],
      purgedCardId: preparation.purgedCardIds[index],
      gainedEntryId: entry.entryId,
      gainedCardId: validReplacementCardIds[index],
    }));
    if (hasReplacements && action.predicate !== undefined) {
      result.resolvedPredicate = action.predicate;
    }
    result.selection = {};
    return withResolution(next, site.id, runtime, result);
  }

  if (isExplorationDreamsignEffectKind(action.effectKind)) {
    const preparation = offer.dreamsignPreparation;
    const expectedPolicy =
      action.effectKind === "gain-nightmare-and-dreamsign"
        ? "fixed"
        : action.effectKind === "gain-offered-dreamsign" ||
            action.effectKind === "gain-nightmare-and-offered-dreamsign" ||
            action.effectKind === "replace-selected-dreamsign-with-offered"
          ? "dreamsign-match"
          : "uniform";
    const expectedRevision = buildRewardSelectionContext({
      journeyState: journey,
      journeyContent: content,
      site,
    }).selectionContentRevision;
    const expectedVisibleOffers =
      preparation?.kind === "offered-gain" ||
      preparation?.kind === "offered-replacement"
        ? preparation.preparedDreamsignIds
        : [];
    if (
      preparation === undefined ||
      offer.canonicalMechanicId !== "gain-dreamsign" ||
      offer.selectionPolicyId !== expectedPolicy ||
      offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
      offer.selectionContentRevision !== expectedRevision ||
      offer.selectionKey !== action.id ||
      offer.selectionSignature === undefined ||
      offer.selectionTrace === undefined ||
      offer.selectionTrace.mechanicId !== "gain-dreamsign" ||
      offer.selectionTrace.policyId !== expectedPolicy ||
      offer.selectionTrace.selectionKey !== action.id ||
      offer.selectionTrace.selectionContentRevision !== expectedRevision ||
      !equalStrings(offer.offeredDreamsignIds ?? [], expectedVisibleOffers)
    ) {
      return null;
    }
    const nightmareCount = authoredNightmareCount(action) ?? 0;
    if (
      isNightmareDreamsignEffect(action) &&
      (!Number.isInteger(nightmareCount) || nightmareCount <= 0)
    ) {
      return null;
    }
    const dreamsignMutation = resolveExplorationDreamsignPlan({
      effectKind: action.effectKind,
      authoredCount: authoredDreamsignCount(action, action.effectKind),
      authoredNightmareCount: authoredNightmareCount(action),
      fixedDreamsignId: fixedDreamsignId(action),
      actionId: action.id,
      preparation,
      selectorSignature: offer.selectionSignature,
      selectorTrace: offer.selectionTrace,
      journey,
      content,
      selection,
    });
    if (dreamsignMutation === null) return null;
    const existingById = new Map(
      journey.dreamsigns.flatMap((dreamsign) =>
        dreamsign.id === undefined
          ? []
          : [[dreamsign.id.toLowerCase(), dreamsign] as const],
      ),
    );
    const afterDreamsigns = dreamsignMutation.afterIds.map((dreamsignId) => {
      const existing = existingById.get(dreamsignId.toLowerCase());
      const resolved = existing ?? dreamsignForId(content, dreamsignId);
      return resolved === null ? null : { ...resolved, id: dreamsignId };
    });
    if (afterDreamsigns.some((dreamsign) => dreamsign === null)) return null;
    if (
      nightmareCount > 0 &&
      !addCardIds(
        Array.from({ length: nightmareCount }, () => NIGHTMARE_CARD_ID),
      )
    ) {
      return null;
    }
    next = {
      ...next,
      dreamsigns: afterDreamsigns as Dreamsign[],
      remainingDreamsignPool: [...dreamsignMutation.poolAfterIds],
    };
    result.gainedDreamsignIds.push(...dreamsignMutation.gainedIds);
    result.purgedDreamsignIds = [...dreamsignMutation.purgedIds];
    result.dreamsignMutation = dreamsignMutation;
    if (
      action.effectKind === "gain-offered-dreamsign" ||
      action.effectKind === "gain-nightmare-and-offered-dreamsign" ||
      action.effectKind === "replace-selected-dreamsign-with-offered"
    ) {
      const offeredDreamsignId = stringValue(selection.offeredDreamsignId);
      const replacedDreamsignId = stringValue(selection.replacedDreamsignId);
      if (offeredDreamsignId === null) return null;
      result.selection = {
        offeredDreamsignId,
        ...(replacedDreamsignId === null ? {} : { replacedDreamsignId }),
      };
    } else if (action.effectKind === "gain-nightmare-and-dreamsign") {
      const replacedDreamsignId = stringValue(selection.replacedDreamsignId);
      result.selection =
        replacedDreamsignId === null ? {} : { replacedDreamsignId };
    } else if (
      action.effectKind === "purge-selected-dreamsign-and-gain-random"
    ) {
      const purgedDreamsignId = stringValue(selection.purgedDreamsignId);
      const overflowReplacementDreamsignIds = stringArray(
        selection.overflowReplacementDreamsignIds,
      );
      if (
        purgedDreamsignId === null ||
        overflowReplacementDreamsignIds === null
      ) {
        return null;
      }
      result.selection = {
        purgedDreamsignId,
        overflowReplacementDreamsignIds,
      };
    } else {
      result.selection = {};
    }
    return withResolution(next, site.id, runtime, result);
  }

  switch (action.effectKind) {
    case "gain-essence": {
      const amount = action.essence;
      if (
        !isEmptySelectionIntent(payload.selection) ||
        !validEssenceMutationOffer({
          action,
          offer,
          journey,
          site,
          encounterCardId: runtime.encounterCardId,
          content,
        }) ||
        !Number.isInteger(amount) ||
        (amount ?? 0) <= 0 ||
        !Number.isFinite(next.essence)
      ) {
        return null;
      }
      const essenceBefore = next.essence;
      if (!applyReward({ kind: "add_essence", amount: amount as number })) {
        return null;
      }
      result.essenceBefore = essenceBefore;
      result.essenceGained = amount as number;
      result.essenceAfter = next.essence;
      break;
    }
    case "gain-random-essence": {
      const amount = offer.preparedEssenceAmount;
      if (
        !isEmptySelectionIntent(payload.selection) ||
        !validEssenceMutationOffer({
          action,
          offer,
          journey,
          site,
          encounterCardId: runtime.encounterCardId,
          content,
        }) ||
        !Number.isInteger(amount) ||
        !Number.isFinite(next.essence)
      ) {
        return null;
      }
      const essenceBefore = next.essence;
      if (!applyReward({ kind: "add_essence", amount: amount as number })) {
        return null;
      }
      result.essenceBefore = essenceBefore;
      result.essenceGained = amount as number;
      result.essenceAfter = next.essence;
      result.essencePreparation = {
        ...(offer.essencePreparation as ExplorationEssencePreparation),
        saltParts: [
          ...(offer.essencePreparation as ExplorationEssencePreparation)
            .saltParts,
        ],
      };
      break;
    }
    case "double-essence": {
      if (
        !isEmptySelectionIntent(payload.selection) ||
        !validEssenceMutationOffer({
          action,
          offer,
          journey,
          site,
          encounterCardId: runtime.encounterCardId,
          content,
        }) ||
        !Number.isFinite(next.essence)
      ) {
        return null;
      }
      const essenceBefore = next.essence;
      if (!applyReward({ kind: "add_essence", amount: essenceBefore })) {
        return null;
      }
      result.essenceBefore = essenceBefore;
      result.essenceGained = essenceBefore;
      result.essenceAfter = next.essence;
      break;
    }
    case "transfigure-all-for-essence": {
      const essence = action.essence;
      const transfiguration = action.transfiguration;
      const affectedEntryIds = offer.eligibleDeckEntryIds;
      if (
        essence === undefined ||
        !Number.isInteger(essence) ||
        essence <= 0 ||
        next.essence < essence ||
        action.predicate === undefined ||
        transfiguration === undefined ||
        affectedEntryIds === undefined ||
        affectedEntryIds.length === 0
      )
        return null;
      const expectedEntryIds = transfigureAllEligibleEntryIds(
        action,
        next,
        content,
      );
      if (
        expectedEntryIds.length !== affectedEntryIds.length ||
        expectedEntryIds.some(
          (entryId, index) => entryId !== affectedEntryIds[index],
        )
      )
        return null;
      const targets = affectedEntryIds.map((entryId) =>
        deckTarget(next, content, entryId),
      );
      if (targets.some((target) => target === null)) return null;
      if (
        !applyReward({
          kind: "composite",
          children: [
            ...(targets as Array<NonNullable<(typeof targets)[number]>>).map(
              (target) => ({
                kind: "transfigure_deck_entry" as const,
                ...target,
                transfiguration,
              }),
            ),
            { kind: "add_essence", amount: -essence },
          ],
        })
      )
        return null;
      result.affectedEntryIds.push(...affectedEntryIds);
      result.chosenTransfiguration = transfiguration;
      result.resolvedPredicate = action.predicate;
      result.essenceSpent = essence;
      break;
    }
    case "copy-selected-card": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (
        selected === null ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate, content)) ||
        !duplicateEntry(entryIds[0], action.count ?? 1)
      ) {
        return null;
      }
      result.selection = { entryIds };
      break;
    }
    case "copy-selected-cards": {
      const entryIds = stringArray(selection.entryIds);
      const count = action.count ?? 2;
      if (
        entryIds === null ||
        !Number.isInteger(count) ||
        count <= 0 ||
        entryIds.length !== count
      ) {
        return null;
      }
      for (const entryId of entryIds) {
        if (!duplicateEntry(entryId, 1)) return null;
      }
      result.selection = { entryIds };
      break;
    }
    case "copy-offered-deck-card": {
      const entryIds = stringArray(selection.entryIds);
      if (
        entryIds === null ||
        entryIds.length !== 1 ||
        !(offer.offeredDeckEntryIds ?? []).includes(entryIds[0]) ||
        !duplicateEntry(entryIds[0], 1)
      ) {
        return null;
      }
      result.selection = { entryIds };
      break;
    }
    case "next-battle-opening-hand": {
      const count = action.count ?? 1;
      if (!Number.isInteger(count) || count <= 0) return null;
      next = {
        ...next,
        battleModifiers: [
          ...next.battleModifiers,
          {
            kind: "opening_hand_bonus",
            count,
            battlesRemaining: 1,
            source: `exploration:${site.id}:${action.id}`,
          },
        ],
      };
      result.battleModifier = {
        kind: "opening-hand",
        amount: count,
        battlesRemaining: 1,
      };
      break;
    }
    case "next-battle-starting-energy": {
      const count = action.count ?? 1;
      if (!Number.isInteger(count) || count <= 0) return null;
      next = {
        ...next,
        battleModifiers: [
          ...next.battleModifiers,
          {
            kind: "starting_energy_bonus",
            count,
            battlesRemaining: 1,
            source: `exploration:${site.id}:${action.id}`,
          },
        ],
      };
      result.battleModifier = {
        kind: "starting-energy",
        amount: count,
        battlesRemaining: 1,
      };
      break;
    }
    case "next-battle-smaller-hand-and-cost-discount": {
      next = {
        ...next,
        battleModifiers: [
          ...next.battleModifiers,
          {
            kind: "smaller_hand_and_cost_discount",
            openingHandDelta: -1,
            energyCostReduction: 1,
            battlesRemaining: 1,
            source: `exploration:${site.id}:${action.id}`,
          },
        ],
      };
      result.battleModifier = {
        kind: "smaller-hand-and-cost-discount",
        openingHandDelta: -1,
        energyCostReduction: 1,
        battlesRemaining: 1,
      };
      break;
    }
    case "choose-dream-avatar": {
      const dreamAvatarId = stringValue(selection.dreamAvatarId);
      if (
        dreamAvatarId === null ||
        !(offer.offeredDreamAvatarIds ?? []).includes(dreamAvatarId)
      ) {
        return null;
      }
      const dreamAvatar = content.dreamAvatars.find(
        (candidate) =>
          candidate.id.toLowerCase() === dreamAvatarId.toLowerCase(),
      );
      if (dreamAvatar === undefined) return null;
      result.previousDreamAvatarId = next.dreamAvatar?.id;
      result.chosenDreamAvatarId = dreamAvatar.id;
      result.selection = { dreamAvatarId: dreamAvatar.id };
      next = {
        ...next,
        dreamAvatar: toJourneyDreamAvatar(dreamAvatar),
        resolvedPackage:
          next.resolvedPackage === null
            ? null
            : { ...next.resolvedPackage, dreamAvatar },
      };
      break;
    }
    case "purge-duplicates-and-grant-reclaim": {
      const resolved = resolvedDeckCards(next, content);
      const counts = new Map<string, number>();
      for (const { card } of resolved) {
        const key = card.id.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const purged = resolved.filter(
        ({ card }) => (counts.get(card.id.toLowerCase()) ?? 0) > 1,
      );
      const survivors = resolved.filter(
        ({ card }) => (counts.get(card.id.toLowerCase()) ?? 0) === 1,
      );
      const purgeTargets = purged.map(({ entry }) =>
        deckTarget(next, content, entry.entryId),
      );
      const survivorTargets = survivors.map(({ entry }) =>
        deckTarget(next, content, entry.entryId),
      );
      if (
        purgeTargets.some((target) => target === null) ||
        survivorTargets.some((target) => target === null)
      ) {
        return null;
      }
      const reclaimCostByEntryId = Object.fromEntries(
        survivors.map(({ entry, card }) => [
          entry.entryId,
          Math.max(0, card.energyCost ?? 0),
        ]),
      );
      if (
        !applyReward({
          kind: "composite",
          children: [
            ...(
              purgeTargets as Array<NonNullable<(typeof purgeTargets)[number]>>
            ).map((target) => ({
              kind: "remove_deck_entry" as const,
              ...target,
            })),
            ...(
              survivorTargets as Array<
                NonNullable<(typeof survivorTargets)[number]>
              >
            ).map((target) => ({
              kind: "change_deck_entry_keywords" as const,
              ...target,
              keywords: { setReclaim: reclaimCostByEntryId[target.entryId] },
            })),
          ],
        })
      ) {
        return null;
      }
      result.purgedCardIds.push(...purged.map(({ card }) => card.id));
      result.purgedEntryIds?.push(...purged.map(({ entry }) => entry.entryId));
      result.affectedEntryIds.push(
        ...survivors.map(({ entry }) => entry.entryId),
      );
      result.reclaimCostByEntryId = reclaimCostByEntryId;
      break;
    }
    case "purge-and-copy": {
      const purgeEntryId = stringValue(selection.purgeEntryId);
      const copyEntryId = stringValue(selection.copyEntryId);
      if (
        purgeEntryId === null ||
        copyEntryId === null ||
        purgeEntryId === copyEntryId
      )
        return null;
      const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
      const purged = next.deck.find((entry) => entry.entryId === purgeEntryId);
      const purgeCardId = cardIdForEntry(next, content, purgeEntryId);
      const copied = next.deck.find((entry) => entry.entryId === copyEntryId);
      const copiedCardId = cardIdForEntry(next, content, copyEntryId);
      const purgeTarget = deckTarget(next, content, purgeEntryId);
      const copyTarget = deckTarget(next, content, copyEntryId);
      if (
        purged === undefined ||
        purgeCardId === null ||
        copied === undefined ||
        copiedCardId === null ||
        purgeTarget === null ||
        copyTarget === null ||
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...purgeTarget },
            { kind: "duplicate_deck_entry", ...copyTarget },
          ],
        })
      )
        return null;
      result.purgedCardIds.push(purgeCardId);
      result.purgedEntryIds?.push(purgeEntryId);
      result.purgedEntrySnapshots?.push(purged);
      result.gainedCardIds.push(copiedCardId);
      result.gainedEntryIds?.push(
        ...next.deck
          .filter((entry) => !beforeEntryIds.has(entry.entryId))
          .map((entry) => entry.entryId),
      );
      result.affectedEntryIds.push(copyEntryId);
      result.selection = { purgeEntryId, copyEntryId };
      break;
    }
    case "gain-dreamsign": {
      if (action.dreamsignId === undefined) return null;
      const added = addDreamsign(
        next,
        content,
        action.dreamsignId,
        stringValue(selection.replacedDreamsignId),
      );
      if (added === null) return null;
      next = added;
      result.gainedDreamsignIds.push(action.dreamsignId);
      const replacedDreamsignId = stringValue(selection.replacedDreamsignId);
      result.selection =
        replacedDreamsignId === null ? {} : { replacedDreamsignId };
      break;
    }
    case "gain-random-dreamsign": {
      const dreamsignId = offer.offeredDreamsignIds?.[0];
      if (dreamsignId === undefined) return null;
      const added = addDreamsign(
        next,
        content,
        dreamsignId,
        stringValue(selection.replacedDreamsignId),
      );
      if (added === null) return null;
      next = added;
      result.gainedDreamsignIds.push(dreamsignId);
      const replacedDreamsignId = stringValue(selection.replacedDreamsignId);
      result.selection =
        replacedDreamsignId === null ? {} : { replacedDreamsignId };
      break;
    }
    case "gain-card": {
      if (action.cardId === undefined || !addCardIds([action.cardId]))
        return null;
      break;
    }
    case "gain-offered-card": {
      const cardIds = stringArray(selection.cardIds);
      const copies = action.count ?? 1;
      if (
        cardIds === null ||
        cardIds.length !== 1 ||
        !offer.offeredCardIds.includes(cardIds[0]) ||
        !Number.isInteger(copies) ||
        copies <= 0 ||
        !addCardIds(Array.from({ length: copies }, () => cardIds[0]))
      ) {
        return null;
      }
      result.selection = { cardIds };
      break;
    }
    case "transfigure-selected": {
      const entryIds = stringArray(selection.entryIds);
      const required = action.count ?? 1;
      if (required !== 1 || entryIds === null || entryIds.length !== 1)
        return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (selected === null) return null;
      if (
        action.predicate !== undefined &&
        !matchesPredicate(selected.card, action.predicate, content)
      )
        return null;
      const transfiguration = offeredTransfigurationForms(
        content.transfigurationData,
        selected.card,
        selected.entry.transfiguration,
      ).find((form) => form.type === selection.transfiguration)?.type;
      const target = deckTarget(next, content, entryIds[0]);
      if (
        transfiguration === undefined ||
        target === null ||
        !applyReward({
          kind: "transfigure_deck_entry",
          ...target,
          transfiguration,
        })
      )
        return null;
      result.affectedEntryIds.push(entryIds[0]);
      result.chosenTransfiguration = transfiguration;
      break;
    }
    case "purge-selected": {
      const entryIds = stringArray(selection.entryIds);
      const required = action.count ?? 1;
      const minimum = required > 1 ? 0 : 1;
      if (
        entryIds === null ||
        entryIds.length < minimum ||
        entryIds.length > required ||
        new Set(entryIds).size !== entryIds.length
      )
        return null;
      const predicate = action.predicate;
      const selected = entryIds.map((entryId) =>
        cardForEntry(next, content, entryId),
      );
      if (
        selected.some(
          (entry) =>
            entry === null ||
            (predicate !== undefined &&
              !matchesPredicate(entry.card, predicate, content)),
        )
      )
        return null;
      const targets = entryIds.map((entryId) =>
        deckTarget(next, content, entryId),
      );
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (
            targets as Array<NonNullable<(typeof targets)[number]>>
          ).map((target) => ({ kind: "remove_deck_entry", ...target })),
        })
      )
        return null;
      result.purgedCardIds.push(
        ...selected.map((entry) => (entry as { card: CardData }).card.id),
      );
      result.purgedEntryIds?.push(...entryIds);
      result.purgedEntrySnapshots?.push(
        ...selected.map((entry) => (entry as { entry: DeckEntry }).entry),
      );
      result.selection = { entryIds };
      break;
    }
    case "choose-pack": {
      const packIndex = selection.packIndex;
      if (typeof packIndex !== "number" || !Number.isInteger(packIndex))
        return null;
      const pack = offer.packCardIds[packIndex];
      if (pack === undefined || !addCardIds(pack)) return null;
      break;
    }
    case "draft-card": {
      const cardIds = stringArray(selection.cardIds);
      if (
        cardIds === null ||
        cardIds.length !== 1 ||
        !offer.offeredCardIds.includes(cardIds[0])
      )
        return null;
      const copies = action.count ?? 1;
      if (!Number.isInteger(copies) || copies <= 0) return null;
      if (!addCardIds(Array.from({ length: copies }, () => cardIds[0])))
        return null;
      result.selection = { cardIds };
      break;
    }
    case "transfigured-card-draft": {
      const cardIds = stringArray(selection.cardIds);
      if (
        cardIds === null ||
        cardIds.length !== 1 ||
        !offer.offeredCardIds.includes(cardIds[0])
      ) {
        return null;
      }
      const card = idIndex(content).get(cardIds[0].toLowerCase());
      const transfiguration = offer.transfigurationByCardId?.[cardIds[0]];
      const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
      if (
        card === undefined ||
        transfiguration === undefined ||
        !applyReward({
          kind: "add_catalog_card",
          cardUuid: card.id,
          cardNumber: card.cardNumber,
          transfiguration,
        })
      ) {
        return null;
      }
      result.gainedCardIds.push(card.id);
      result.gainedEntryIds?.push(
        ...next.deck
          .filter((entry) => !beforeEntryIds.has(entry.entryId))
          .map((entry) => entry.entryId),
      );
      result.chosenTransfiguration = transfiguration;
      result.selection = { cardIds };
      break;
    }
    case "add-site": {
      if (offer.offeredSiteType === undefined) return null;
      if (!applyReward({ kind: "add_site", siteType: offer.offeredSiteType }))
        return null;
      result.selection = { siteType: offer.offeredSiteType };
      break;
    }
    case "add-fixed-site": {
      const preparation = offer.siteInsertionPreparation;
      if (
        action.siteType === undefined ||
        !isEmptySelectionIntent(payload.selection) ||
        preparation === undefined ||
        offer.canonicalMechanicId !== "add-site" ||
        offer.selectionPolicyId !== "fixed" ||
        offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
        offer.selectionKey !== action.id ||
        offer.selectionTrace !== undefined ||
        offer.selectionTraces !== undefined ||
        offer.offeredSiteType !== undefined
      ) {
        return null;
      }
      const expectedRevision = buildRewardSelectionContext({
        journeyState: journey,
        journeyContent: content,
        site,
      }).selectionContentRevision;
      const expectedPreparation = prepareExplorationSiteInsertion({
        journey,
        sourceSite: site,
        sourceActionId: action.id,
        encounterCardId: runtime.encounterCardId,
        siteType: action.siteType,
        selectionRulesVersion: SELECTION_RULES_VERSION,
        selectionContentRevision: expectedRevision,
      });
      if (
        expectedPreparation === null ||
        offer.selectionContentRevision !== expectedRevision ||
        offer.selectionSignature !== preparation.planSignature ||
        !explorationSiteInsertionPreparationsEqual(
          preparation,
          expectedPreparation,
        )
      ) {
        return null;
      }
      if (
        !applyReward({
          kind: "insert_site",
          targetNodeId: preparation.targetNodeId,
          insertionIndex: preparation.insertionIndex,
          siblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
          site: preparation.insertedSite,
        })
      ) {
        return null;
      }
      result.selectionRulesVersion = SELECTION_RULES_VERSION;
      result.selectionContentRevision = expectedRevision;
      result.encounterSignature = runtime.encounterSignature;
      result.selectionSignature = preparation.planSignature;
      result.selection = {};
      result.siteInsertion = {
        targetNodeId: preparation.targetNodeId,
        insertionIndex: preparation.insertionIndex,
        siblingSiteIdsBefore: [...preparation.siblingSiteIdsBefore],
        insertedSite: { ...preparation.insertedSite },
      };
      break;
    }
    case "choose-site-type": {
      const preparation = offer.siteTypeChoicePreparation;
      const siteType = stringValue(selection.siteType);
      if (
        action.offerCount !== 3 ||
        !hasExactSelectionKeys(selection, ["siteType"]) ||
        siteType === null ||
        preparation === undefined ||
        offer.canonicalMechanicId !== "add-site" ||
        offer.selectionPolicyId !== "site-uniform" ||
        offer.selectionRulesVersion !== SELECTION_RULES_VERSION ||
        offer.selectionKey !== action.id ||
        offer.selectionTrace === undefined ||
        offer.selectionTraces !== undefined ||
        offer.offeredSiteType !== undefined ||
        offer.siteInsertionPreparation !== undefined
      ) {
        return null;
      }
      const context = buildRewardSelectionContext({
        journeyState: journey,
        journeyContent: content,
        site,
      });
      const selected = selectReward(context, {
        mechanicId: "add-site",
        policyId: "site-uniform",
        scope: {
          journeySeed: journey.seed,
          siteUuid: site.id,
          selectionKey: action.id,
        },
        count: action.offerCount,
        constraints: {
          allowedSiteTypes: context.tuning.placeableSiteTypes,
        },
      });
      if (!selected.ok || selected.bindings.siteTypes.length !== 3) return null;
      const selectedTypes = explorationChoosableSiteTypes(
        selected.bindings.siteTypes,
      );
      if (selectedTypes === null) return null;
      const expectedPreparation = prepareExplorationSiteTypeChoice({
        journey,
        sourceSite: site,
        sourceActionId: action.id,
        encounterCardId: runtime.encounterCardId,
        siteTypes: selectedTypes,
        selectorSignature: selected.signature,
        selectionRulesVersion: SELECTION_RULES_VERSION,
        selectionContentRevision: context.selectionContentRevision,
      });
      if (
        expectedPreparation === null ||
        offer.selectionContentRevision !== context.selectionContentRevision ||
        offer.selectionSignature !== preparation.planSignature ||
        preparation.selectorSignature !== selected.signature ||
        stableDigest(offer.selectionTrace) !== stableDigest(selected.trace) ||
        !explorationSiteTypeChoicePreparationsEqual(
          preparation,
          expectedPreparation,
        )
      ) {
        return null;
      }
      const chosen = preparation.choices.find(
        (choice) => choice.siteType === siteType,
      );
      if (chosen === undefined) return null;
      if (
        !applyReward({
          kind: "insert_site",
          targetNodeId: preparation.targetNodeId,
          insertionIndex: preparation.insertionIndex,
          siblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
          site: chosen.insertedSite,
        })
      ) {
        return null;
      }
      result.selectionRulesVersion = SELECTION_RULES_VERSION;
      result.selectionContentRevision = context.selectionContentRevision;
      result.encounterSignature = runtime.encounterSignature;
      result.selectionSignature = preparation.planSignature;
      result.selection = { siteType };
      result.siteInsertion = {
        targetNodeId: preparation.targetNodeId,
        insertionIndex: preparation.insertionIndex,
        siblingSiteIdsBefore: [...preparation.siblingSiteIdsBefore],
        insertedSite: { ...chosen.insertedSite },
      };
      break;
    }
    case "purge-dreamsign-for-essence": {
      const dreamsignId = stringValue(selection.dreamsignId);
      if (dreamsignId === null || action.essence === undefined) return null;
      const targetIndex = next.dreamsigns.findIndex(
        (dreamsign) =>
          dreamsign.id?.toLowerCase() === dreamsignId.toLowerCase(),
      );
      if (
        targetIndex < 0 ||
        !Number.isFinite(action.essence) ||
        action.essence <= 0
      ) {
        return null;
      }
      next = {
        ...next,
        dreamsigns: next.dreamsigns.filter(
          (_dreamsign, index) => index !== targetIndex,
        ),
      };
      if (!applyReward({ kind: "add_essence", amount: action.essence }))
        return null;
      result.purgedDreamsignIds = [
        ...(result.purgedDreamsignIds ?? []),
        dreamsignId,
      ];
      result.essenceGained = action.essence;
      result.selection = { dreamsignId };
      break;
    }
    case "purge-for-essence": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (selected === null) return null;
      const essenceGained =
        Math.max(0, selected.card.spark ?? 0) *
        (action.essencePerSpark ??
          input.content.economyData.exploration.defaultEssencePerSpark);
      const target = deckTarget(next, content, entryIds[0]);
      if (
        target === null ||
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...target },
            { kind: "add_essence", amount: essenceGained },
          ],
        })
      )
        return null;
      result.purgedCardIds.push(selected.card.id);
      result.purgedEntryIds?.push(entryIds[0]);
      result.purgedEntrySnapshots?.push(selected.entry);
      result.essenceGained = essenceGained;
      result.selection = { entryIds };
      break;
    }
    case "change-subtype-selected": {
      const entryIds = stringArray(selection.entryIds);
      if (
        entryIds === null ||
        entryIds.length !== 1 ||
        action.subtype === undefined
      )
        return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (
        selected === null ||
        selected.card.cardType !== "Character" ||
        selected.card.subtype === action.subtype ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate, content))
      )
        return null;
      const target = deckTarget(next, content, entryIds[0]);
      if (
        target === null ||
        !applyReward({
          kind: "change_deck_entry_type",
          ...target,
          typeChange: typeChange(action.subtype),
        })
      )
        return null;
      result.affectedEntryIds.push(entryIds[0]);
      result.chosenSubtype = action.subtype;
      result.selection = { entryIds };
      break;
    }
    case "change-card-type-selected": {
      if (action.deckTarget !== "chosen") return null;
      const entryIds = stringArray(selection.entryIds);
      const cardType = action.cardType;
      if (
        !hasExactSelectionKeys(selection, ["entryIds"]) ||
        entryIds === null ||
        entryIds.length !== 1 ||
        (cardType !== "Character" && cardType !== "Event") ||
        offer.disclosedDeckTargetPreparation !== undefined
      ) {
        return null;
      }
      const selected = cardForEntry(next, content, entryIds[0]);
      const target = deckTarget(next, content, entryIds[0]);
      if (
        selected === null ||
        target === null ||
        selected.card.cardType === cardType
      ) {
        return null;
      }
      const afterTypeChange = cardTypeChange(cardType);
      if (
        !applyReward({
          kind: "change_deck_entry_type",
          ...target,
          typeChange: afterTypeChange,
        })
      ) {
        return null;
      }
      result.affectedEntryIds.push(entryIds[0]);
      result.resolvedCardType = cardType;
      result.cardTypeChanges = [
        {
          entryId: entryIds[0],
          cardId: selected.card.id,
          beforeCardType: selected.card.cardType,
          afterCardType: cardType,
          beforeTypeChange: selected.entry.typeChange ?? null,
          afterTypeChange,
        },
      ];
      result.selection = { entryIds };
      break;
    }
    case "change-subtype-all": {
      const subtype = stringValue(selection.subtype);
      if (subtype === null || !action.subtypeOptions?.includes(subtype))
        return null;
      const affected = resolvedDeckCards(next, content)
        .filter(({ card }) => card.cardType === "Character")
        .map(({ entry }) => entry.entryId);
      const targets = affected.map((entryId) =>
        deckTarget(next, content, entryId),
      );
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (
            targets as Array<NonNullable<(typeof targets)[number]>>
          ).map((target) => ({
            kind: "change_deck_entry_type",
            ...target,
            typeChange: typeChange(subtype),
          })),
        })
      )
        return null;
      result.affectedEntryIds.push(...affected);
      result.chosenSubtype = subtype;
      break;
    }
    case "take-cards": {
      const cardIds = stringArray(selection.cardIds);
      if (
        cardIds === null ||
        cardIds.some((cardId) => !offer.offeredCardIds.includes(cardId))
      )
        return null;
      if (!addCardIds(cardIds)) return null;
      result.selection = { cardIds };
      break;
    }
    case "replace-selected-with-card": {
      const entryIds = stringArray(selection.entryIds);
      if (
        entryIds === null ||
        entryIds.length !== 1 ||
        action.cardId === undefined
      ) {
        return null;
      }
      const selected = cardForEntry(next, content, entryIds[0]);
      const target = deckTarget(next, content, entryIds[0]);
      const replacement = addCardEffect(content, action.cardId);
      if (
        selected === null ||
        target === null ||
        replacement === null ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate, content))
      ) {
        return null;
      }
      const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
      if (
        !applyReward({
          kind: "composite",
          children: [{ kind: "remove_deck_entry", ...target }, replacement],
        })
      ) {
        return null;
      }
      result.purgedCardIds.push(selected.card.id);
      result.purgedEntryIds?.push(entryIds[0]);
      result.gainedCardIds.push(action.cardId);
      result.gainedEntryIds?.push(
        ...next.deck
          .filter((entry) => !beforeEntryIds.has(entry.entryId))
          .map((entry) => entry.entryId),
      );
      result.selection = { entryIds };
      break;
    }
    case "replace-selected": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1) return null;
      const replacementId = offer.replacementCardIdByEntryId[entryIds[0]];
      const purgedCardId = cardIdForEntry(next, content, entryIds[0]);
      const target = deckTarget(next, content, entryIds[0]);
      const replacement =
        replacementId === undefined
          ? null
          : addCardEffect(content, replacementId);
      if (
        replacementId === undefined ||
        purgedCardId === null ||
        target === null ||
        replacement === null ||
        !applyReward({
          kind: "composite",
          children: [{ kind: "remove_deck_entry", ...target }, replacement],
        })
      )
        return null;
      result.purgedCardIds.push(purgedCardId);
      result.gainedCardIds.push(replacementId);
      break;
    }
    case "gain-nightmare-and-card": {
      if (action.cardId === undefined) return null;
      const nightmares = Array.from(
        { length: action.nightmareCount ?? 1 },
        () => NIGHTMARE_CARD_ID,
      );
      if (!addCardIds(nightmares) || !addCardIds([action.cardId])) return null;
      break;
    }
    case "gain-random-cards": {
      const expectedOffer = buildActionOffer(
        action,
        journey,
        content,
        site,
        runtime.encounterCardId,
      );
      if (
        !isEmptySelectionIntent(payload.selection) ||
        expectedOffer === null ||
        stableDigest(offer) !== stableDigest(expectedOffer) ||
        offer.offeredCardIds.length !== (action.count ?? 1) ||
        !addCardIds(offer.offeredCardIds)
      )
        return null;
      result.selection = {};
      break;
    }
    case "transfigure-fixed-selected": {
      const entryIds = stringArray(selection.entryIds);
      if (
        entryIds === null ||
        entryIds.length !== 1 ||
        action.transfiguration === undefined
      )
        return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (
        selected === null ||
        selected.entry.transfiguration !== null ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate, content)) ||
        !offeredTransfigurationForms(
          content.transfigurationData,
          selected.card,
          null,
        ).some((form) => form.type === action.transfiguration)
      )
        return null;
      const target = deckTarget(next, content, entryIds[0]);
      if (
        target === null ||
        !applyReward({
          kind: "transfigure_deck_entry",
          ...target,
          transfiguration: action.transfiguration,
        })
      )
        return null;
      result.affectedEntryIds.push(entryIds[0]);
      result.chosenTransfiguration = action.transfiguration;
      result.selection = { entryIds };
      break;
    }
    case "transfigure-next-draft-or-shop": {
      const modifier = {
        kind: "transfigure-next-draft-or-shop" as const,
        sourceSiteId: site.id,
        sourceActionId: action.id,
      };
      next = {
        ...next,
        siteOfferModifiers: [...next.siteOfferModifiers, modifier],
      };
      result.siteOfferModifier = modifier;
      break;
    }
    case "free-next-shop": {
      if (
        !isEmptySelectionIntent(payload.selection) ||
        !validShopPurchaseModifierOffer(action, offer)
      ) {
        return null;
      }
      const modifier = {
        kind: "free-next-shop" as const,
        sourceSiteId: site.id,
        sourceActionId: action.id,
      };
      next = {
        ...next,
        shopModifiers: {
          ...next.shopModifiers,
          freeNextShopModifiers: [
            ...(next.shopModifiers.freeNextShopModifiers ?? []),
            modifier,
          ],
        },
      };
      result.shopModifier = modifier;
      break;
    }
    case "lose-half-essence-and-free-purchases": {
      const count = action.count;
      if (
        !isEmptySelectionIntent(payload.selection) ||
        !validShopPurchaseModifierOffer(action, offer) ||
        !Number.isInteger(count) ||
        (count ?? 0) <= 0 ||
        !Number.isInteger(next.essence) ||
        next.essence < 0
      ) {
        return null;
      }
      const essenceBefore = next.essence;
      const essenceSpent = Math.floor(essenceBefore / 2);
      const modifier = {
        kind: "free-purchases" as const,
        sourceSiteId: site.id,
        sourceActionId: action.id,
        initialCount: count as number,
        remainingCount: count as number,
      };
      next = {
        ...next,
        essence: essenceBefore - essenceSpent,
        shopModifiers: {
          ...next.shopModifiers,
          freePurchaseModifiers: [
            ...(next.shopModifiers.freePurchaseModifiers ?? []),
            modifier,
          ],
        },
      };
      result.essenceBefore = essenceBefore;
      result.essenceSpent = essenceSpent;
      result.essenceAfter = next.essence;
      result.shopModifier = modifier;
      break;
    }
    case "gain-essence-per-card": {
      if (
        action.predicate === undefined ||
        action.essencePerCard === undefined
      ) {
        return null;
      }
      const matchingCards = resolvedDeckCards(next, content).filter(
        ({ card }) =>
          matchesPredicate(
            card,
            action.predicate as ExplorationPredicate,
            content,
          ),
      );
      const essenceGained = matchingCards.length * action.essencePerCard;
      if (!applyReward({ kind: "add_essence", amount: essenceGained }))
        return null;
      result.affectedEntryIds.push(
        ...matchingCards.map(({ entry }) => entry.entryId),
      );
      result.essenceGained = essenceGained;
      break;
    }
    case "increase-spark-all": {
      const sparkBonus = action.sparkBonus ?? 1;
      const affectedEntryIds = resolvedDeckCards(next, content)
        .filter(({ card }) => card.cardType === "Character")
        .map(({ entry }) => entry.entryId);
      const targets = affectedEntryIds.map((entryId) =>
        deckTarget(next, content, entryId),
      );
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (
            targets as Array<NonNullable<(typeof targets)[number]>>
          ).map((target) => ({
            kind: "add_deck_entry_spark_bonus",
            ...target,
            amount: sparkBonus,
          })),
        })
      )
        return null;
      result.affectedEntryIds.push(...affectedEntryIds);
      break;
    }
    case "purge-random-subtype-and-increase-spark": {
      const subtype = action.subtype;
      const sparkBonus = action.sparkBonus;
      const purgedEntryId = offer.offeredDeckEntryIds?.[0];
      if (
        subtype === undefined ||
        sparkBonus === undefined ||
        !Number.isInteger(sparkBonus) ||
        sparkBonus <= 0 ||
        purgedEntryId === undefined
      )
        return null;
      const resolved = resolvedDeckCards(next, content);
      const purged = resolved.find(
        ({ entry, card }) =>
          entry.entryId === purgedEntryId &&
          card.cardType === "Character" &&
          card.subtype === subtype,
      );
      const survivors = resolved.filter(
        ({ entry, card }) =>
          entry.entryId !== purgedEntryId &&
          card.cardType === "Character" &&
          card.subtype === subtype,
      );
      if (purged === undefined || survivors.length === 0) return null;
      const purgeTarget = deckTarget(next, content, purgedEntryId);
      const survivorTargets = survivors.map(({ entry }) =>
        deckTarget(next, content, entry.entryId),
      );
      if (
        purgeTarget === null ||
        survivorTargets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...purgeTarget },
            ...(
              survivorTargets as Array<
                NonNullable<(typeof survivorTargets)[number]>
              >
            ).map((target) => ({
              kind: "add_deck_entry_spark_bonus" as const,
              ...target,
              amount: sparkBonus,
            })),
          ],
        })
      )
        return null;
      const sparkBeforeByEntryId = Object.fromEntries(
        survivors.map(({ entry, card }) => [
          entry.entryId,
          Math.max(0, card.spark ?? 0),
        ]),
      );
      result.purgedCardIds.push(purged.card.id);
      result.purgedEntryIds?.push(purged.entry.entryId);
      result.purgedEntrySnapshots?.push(purged.entry);
      result.affectedEntryIds.push(
        ...survivors.map(({ entry }) => entry.entryId),
      );
      result.sparkBeforeByEntryId = sparkBeforeByEntryId;
      result.sparkAfterByEntryId = Object.fromEntries(
        Object.entries(sparkBeforeByEntryId).map(([entryId, spark]) => [
          entryId,
          spark + sparkBonus,
        ]),
      );
      result.selection = { entryIds: [purgedEntryId] };
      break;
    }
    case "make-fast-all": {
      const targets = next.deck.map((entry) =>
        deckTarget(next, content, entry.entryId),
      );
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (
            targets as Array<NonNullable<(typeof targets)[number]>>
          ).map((target) => ({
            kind: "change_deck_entry_keywords",
            ...target,
            keywords: { fast: true },
          })),
        })
      )
        return null;
      result.affectedEntryIds.push(...next.deck.map((entry) => entry.entryId));
      break;
    }
    case "reduce-cost-all-and-gain-nightmares": {
      if (
        action.energyCostReduction === undefined ||
        action.nightmareCount === undefined ||
        !Number.isInteger(action.nightmareCount) ||
        action.nightmareCount <= 0
      )
        return null;
      const affectedEntryIds = next.deck.map((entry) => entry.entryId);
      const targets = affectedEntryIds.map((entryId) =>
        deckTarget(next, content, entryId),
      );
      const nightmare = addCardEffect(content, NIGHTMARE_CARD_ID);
      if (
        nightmare === null ||
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: [
            ...(targets as Array<NonNullable<(typeof targets)[number]>>).map(
              (target) => ({
                kind: "reduce_deck_entry_energy_cost" as const,
                ...target,
                amount: action.energyCostReduction as number,
              }),
            ),
            ...Array.from({ length: action.nightmareCount }, () => nightmare),
          ],
        })
      )
        return null;
      result.affectedEntryIds.push(...affectedEntryIds);
      result.gainedCardIds.push(
        ...Array.from(
          { length: action.nightmareCount },
          () => NIGHTMARE_CARD_ID,
        ),
      );
      break;
    }
  }

  return withResolution(next, site.id, runtime, result);
}
