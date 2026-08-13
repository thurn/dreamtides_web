import {
  buildTransfigurationDisplay,
  type CardTransfigurationDisplay,
} from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/journey";
import { auguryArchetype } from "../../data/augury-data";
import type {
  MerchantApplyPayload,
  MerchantCatalogCard,
  MerchantContext,
} from "../types";
import type { MerchantRng } from "../signals/rng";
import { buildCategoryUniverse, type MerchantCategory } from "./categories";
import type {
  MerchantArchetypeBuilder,
  MerchantChoiceCandidateDraft,
  MerchantOfferDraft,
} from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectMerchantCount,
  selectMerchantReward,
} from "./sharedSelection";
import { selectionBandSize } from "../../selection/tide-affinity";

function catalogGameObject(card: MerchantCatalogCard): MerchantCatalogCard {
  return card;
}

function selectedCatalogCards(
  context: MerchantContext,
  cardUuids: readonly string[],
): MerchantCatalogCard[] {
  const byUuid = new Map(
    context.candidateGrantCards.map((candidate) => [candidate.cardUuid, candidate]),
  );
  return cardUuids.flatMap((cardUuid) => {
    const card = byUuid.get(cardUuid);
    return card === undefined ? [] : [card];
  });
}

/** The ordinary unowned card pool used by every Augury grant. */
export function grantCandidatePool(
  context: MerchantContext,
): readonly MerchantCatalogCard[] {
  const unowned = context.candidateGrantCards.filter(
    (card) => !context.ownedCardUuids.has(card.cardUuid),
  );
  if (context.draftPoolCardUuids.size === 0) return unowned;
  return unowned.filter((card) => context.draftPoolCardUuids.has(card.cardUuid));
}

function bandCanFill(context: MerchantContext, poolSize: number, count: number): boolean {
  const { bandFraction, bandMinimum } = context.rewardSelection.tuning;
  return selectionBandSize(poolSize, bandFraction, bandMinimum) >= count;
}

function addCatalogCardPayload(card: MerchantCatalogCard): MerchantApplyPayload {
  return {
    kind: "add_catalog_card",
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
  };
}

function repeatedPayload(
  payload: MerchantApplyPayload,
  count: number,
): MerchantApplyPayload {
  return count === 1
    ? payload
    : { kind: "composite", children: Array.from({ length: count }, () => payload) };
}

function grantedCopies(
  context: MerchantContext,
  archetypeId: "fit_card_grant" | "fit_card_draft" | "copies_draft" |
    "strong_card" | "category_draft_known" | "transfigured_draft",
): number {
  return auguryArchetype(
    context.rewardSelection.content.auguryData,
    archetypeId,
  ).quantities.grantedCopies;
}

function catalogChoiceCandidate(
  card: MerchantCatalogCard,
  payload: MerchantApplyPayload,
): MerchantChoiceCandidateDraft {
  return {
    choiceId: card.cardUuid,
    gameObjects: [catalogGameObject(card)],
    applyPayload: payload,
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
  };
}

function directGrantBuilder(
  archetypeId: "strong_card" | "fit_card_grant",
): MerchantArchetypeBuilder {
  return {
    archetypeId,
    family: "grant",
    eligible: (context) => grantCandidatePool(context).length > 0,
    build(context): MerchantOfferDraft | null {
      const selection = selectMerchantReward({
        context,
        archetypeId,
        mechanicId: "gain-card",
        policyId: augurySelectionPolicy(context, archetypeId),
        request: { constraints: { excludeOwned: true } },
      });
      const target = selectedCatalogCards(
        context,
        selection?.bindings.cardUuids ?? [],
      )[0];
      if (selection === null || target === undefined) return null;
      return {
        archetypeId,
        family: "grant",
        gameObjects: [target],
        applyPayload: repeatedPayload(
          addCatalogCardPayload(target),
          grantedCopies(context, archetypeId),
        ),
        targetKey: target.cardUuid,
        ...selectionMetadata(selection),
      };
    },
  };
}

export const strongCardBuilder = directGrantBuilder("strong_card");
export const fitCardGrantBuilder = directGrantBuilder("fit_card_grant");

function chooserBuilder(
  archetypeId: "fit_card_draft" | "copies_draft",
): MerchantArchetypeBuilder {
  return {
    archetypeId,
    family: "grant",
    eligible(context): boolean {
      const count = auguryArchetype(
        context.rewardSelection.content.auguryData,
        archetypeId,
      ).quantities.chooserSize;
      return bandCanFill(context, grantCandidatePool(context).length, count);
    },
    build(context): MerchantOfferDraft | null {
      const archetype = auguryArchetype(
        context.rewardSelection.content.auguryData,
        archetypeId,
      );
      const count = archetype.quantities.chooserSize;
      const selection = selectMerchantReward({
        context,
        archetypeId,
        mechanicId: "catalog-card-chooser",
        policyId: augurySelectionPolicy(context, archetypeId),
        request: { count, constraints: { excludeOwned: true } },
      });
      const sampled = selectedCatalogCards(
        context,
        selection?.bindings.cardUuids ?? [],
      );
      if (selection === null || sampled.length < count) return null;
      const candidates = sampled.map((card) =>
        catalogChoiceCandidate(
          card,
          repeatedPayload(
            addCatalogCardPayload(card),
            archetype.quantities.grantedCopies,
          ),
        ),
      );
      return {
        archetypeId,
        family: "grant",
        gameObjects: [],
        choiceRequest: { choiceType: "catalogCard", candidates },
        targetKey: sampled.map((card) => card.cardUuid).join(","),
        ...selectionMetadata(selection),
      };
    },
  };
}

export const fitCardDraftBuilder = chooserBuilder("fit_card_draft");
export const copiesDraftBuilder = chooserBuilder("copies_draft");

function categoryCandidatePool(
  context: MerchantContext,
  category: MerchantCategory,
): readonly MerchantCatalogCard[] {
  const memberSet = new Set(category.memberUuids);
  return grantCandidatePool(context).filter((card) => memberSet.has(card.cardUuid));
}

function offerableCategories(context: MerchantContext): readonly MerchantCategory[] {
  const chooserSize = auguryArchetype(
    context.rewardSelection.content.auguryData,
    "category_draft_known",
  ).quantities.chooserSize;
  return buildCategoryUniverse(context).filter(
    (category) => categoryCandidatePool(context, category).length >= chooserSize,
  );
}

export const categoryDraftKnownBuilder: MerchantArchetypeBuilder = {
  archetypeId: "category_draft_known",
  family: "grant",
  eligible: (context) => offerableCategories(context).length > 0,
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const categories = offerableCategories(context);
    if (categories.length === 0) return null;
    const category = categories[Math.min(Math.floor(rng() * categories.length), categories.length - 1)];
    const archetype = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "category_draft_known",
    );
    const pool = categoryCandidatePool(context, category);
    const selection = selectMerchantReward({
      context,
      archetypeId: "category_draft_known",
      mechanicId: "catalog-card-chooser",
      policyId: augurySelectionPolicy(context, "category_draft_known"),
      request: {
        count: archetype.quantities.chooserSize,
        constraints: {
          allowedCardUuids: pool.map((card) => card.cardUuid),
          excludeOwned: true,
        },
      },
    });
    const sampled = selectedCatalogCards(context, selection?.bindings.cardUuids ?? []);
    if (selection === null || sampled.length < archetype.quantities.chooserSize) return null;
    const candidates = sampled.map((card) =>
      catalogChoiceCandidate(
        card,
        repeatedPayload(
          addCatalogCardPayload(card),
          archetype.quantities.grantedCopies,
        ),
      ),
    );
    return {
      archetypeId: "category_draft_known",
      family: "grant",
      gameObjects: [],
      choiceRequest: { choiceType: "catalogCard", candidates },
      targetKey: `${category.id}:${sampled.map((card) => card.cardUuid).join(",")}`,
      ...selectionMetadata(selection),
    };
  },
};

export const cardBundleBuilder: MerchantArchetypeBuilder = {
  archetypeId: "card_bundle",
  family: "grant",
  eligible: (context) => grantCandidatePool(context).length > 0,
  build(context): MerchantOfferDraft | null {
    const quantities = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "card_bundle",
    ).quantities;
    const bundleSize = selectMerchantCount({
      context,
      archetypeId: "card_bundle",
      mechanicId: "gain-card",
      policyId: augurySelectionPolicy(context, "card_bundle"),
      minimum: quantities.minimumBundleSize,
      maximum: quantities.bundleSize,
    });
    const selection = selectMerchantReward({
      context,
      archetypeId: "card_bundle",
      mechanicId: "gain-card",
      policyId: augurySelectionPolicy(context, "card_bundle"),
      request: {
        count: bundleSize,
        upTo: true,
        constraints: { excludeOwned: true },
      },
    });
    const cards = selectedCatalogCards(context, selection?.bindings.cardUuids ?? []);
    if (selection === null || cards.length === 0) return null;
    return {
      archetypeId: "card_bundle",
      family: "grant",
      gameObjects: cards,
      applyPayload: {
        kind: "composite",
        children: cards.map(addCatalogCardPayload),
      },
      targetKey: cards.map((card) => card.cardUuid).join(","),
      ...selectionMetadata(selection),
    };
  },
};

interface TransfiguredChoice {
  card: MerchantCatalogCard;
  transfiguration: TransfigurationType;
  preview: CardData;
  display: CardTransfigurationDisplay;
}

export const transfiguredDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "transfigured_draft",
  family: "grant",
  eligible(context): boolean {
    const count = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "transfigured_draft",
    ).quantities.chooserSize;
    return bandCanFill(context, grantCandidatePool(context).length, count);
  },
  build(context): MerchantOfferDraft | null {
    const archetype = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "transfigured_draft",
    );
    const count = archetype.quantities.chooserSize;
    const selection = selectMerchantReward({
      context,
      archetypeId: "transfigured_draft",
      mechanicId: "transfigured-card-chooser",
      policyId: augurySelectionPolicy(context, "transfigured_draft"),
      request: { count, constraints: { excludeOwned: true } },
    });
    if (selection === null) return null;
    const forms = new Map(
      selection.bindings.transfigurations.map((entry) => [entry.cardUuid, entry.transfiguration]),
    );
    const choices: TransfiguredChoice[] = selectedCatalogCards(
      context,
      selection.bindings.cardUuids,
    ).flatMap((card) => {
      const transfiguration = forms.get(card.cardUuid);
      if (transfiguration === undefined) return [];
      const built = buildTransfigurationDisplay(
        context.rewardSelection.content.transfigurationData,
        card.card,
        transfiguration,
      );
      return [{
        card,
        transfiguration,
        preview: built.card,
        display: built.display,
      }];
    });
    if (choices.length < count) return null;
    const candidates: MerchantChoiceCandidateDraft[] = choices.map((choice) => ({
      choiceId: choice.card.cardUuid,
      gameObjects: [{
        ...choice.card,
        card: choice.preview,
        badge: { label: choice.transfiguration },
        transfiguration: choice.display,
      }],
      applyPayload: repeatedPayload({
        kind: "add_catalog_card",
        cardUuid: choice.card.cardUuid,
        cardNumber: choice.card.cardNumber,
        transfiguration: choice.transfiguration,
      }, archetype.quantities.grantedCopies),
      cardUuid: choice.card.cardUuid,
      cardNumber: choice.card.cardNumber,
    }));
    return {
      archetypeId: "transfigured_draft",
      family: "grant",
      gameObjects: [],
      choiceRequest: { choiceType: "catalogCard", candidates },
      targetKey: choices
        .map((choice) => `${choice.card.cardUuid}:${choice.transfiguration}`)
        .join(","),
      ...selectionMetadata(selection),
    };
  },
};
