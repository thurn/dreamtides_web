import {
  applyDeckEntryCardModification,
  resolveDeckEntryCard,
} from "../../card-type-change";
import {
  applyTransfigurationToCard,
  buildTransfigurationDisplay,
  eligibleTransfigurations,
} from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { CardTypeChange, TransfigurationType } from "../../types/journey";
import type { RewardSelectionTuning } from "../../types/reward-selection-data";
import { auguryArchetype } from "../../data/augury-data";
import { MERCHANT_TUNING } from "../tuning";
import { centrality } from "../signals/fit";
import { bandSample, type MerchantRng } from "../signals/rng";
import {
  assembleOfferTrace,
  type TraceCandidateInput,
} from "../trace/buildTrace";
import type { MerchantOfferTrace } from "../trace/types";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantDeckCard,
  MerchantGameObject,
} from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";
import {
  selectionMetadata,
  selectMerchantCount,
  selectMerchantReward,
} from "./sharedSelection";

/**
 * Assembles the `entry_modification` trace shared by the improve family: an
 * (entry, modification) candidate set keyed by `${entryId}:${variant}`.
 */
function entryModificationTrace(params: {
  candidates: readonly TraceCandidateInput[];
  selectedKeys: readonly string[];
  bandFraction: number;
  bandMinimum?: number;
  blend?: Readonly<Record<string, number>>;
  notes?: readonly string[];
}): MerchantOfferTrace {
  return assembleOfferTrace({
    decision: "entry_modification",
    keyKind: "entryModification",
    candidates: params.candidates,
    selectedKeys: params.selectedKeys,
    selectedCount: params.selectedKeys.length,
    bandFraction: params.bandFraction,
    ...(params.bandMinimum === undefined
      ? {}
      : { bandMinimum: params.bandMinimum }),
    ...(params.blend === undefined ? {} : { blend: params.blend }),
    ...(params.notes === undefined ? {} : { notes: params.notes }),
  });
}

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes the EFFECTIVE card of a deck entry: the base card with the entry's
 * transfiguration applied first, then its type change, then its keyword
 * modification (the `getEffectiveCard` ordering). The improve archetypes read
 * this so they respect modifications already on the entry (e.g. an existing
 * Reclaim grant) rather than the base card.
 */
function effectiveCardFor(deckCard: MerchantDeckCard): CardData {
  return resolveDeckEntryCard(deckCard.card, deckCard.deckEntry);
}

/**
 * The single source of truth for the v3 transfiguration benefit table.
 *
 * Benefit is mechanical where the effect is numeric (Empowered halves an energy
 * cost, Kindled doubles a character's spark) and a flat constant where the
 * effect is textual. `preview` is the result of
 * `applyTransfigurationToCard(card, transfiguration)`; the mechanical types read
 * the before/after fields off `card` and `preview` so they never re-derive the
 * transfiguration math.
 *
 * Consumed by both the `transfigured_draft` grant archetype and the improve
 * archetypes (`transfigure`, `starter_transfigure`) added in later tasks.
 */
export function transfigurationBenefit(
  card: CardData,
  transfiguration: TransfigurationType,
  preview: CardData,
  tuning: RewardSelectionTuning["transfigurationBenefit"] = MERCHANT_TUNING.transfigurationBenefit,
): number {
  switch (transfiguration) {
    case "Empowered": {
      const oldCost = card.energyCost ?? 0;
      const newCost = preview.energyCost ?? 0;
      return clamp01((oldCost - newCost) / tuning.empoweredCostDivisor);
    }
    case "Kindled": {
      const oldSpark = card.spark ?? 0;
      const newSpark = preview.spark ?? 0;
      return clamp01((newSpark - oldSpark) / tuning.kindledSparkDivisor);
    }
    case "Amplified":
    case "Inspired":
    case "Enduring":
    case "Hastened":
    case "Resonant":
    case "Attuned":
    case "Perfected":
      return tuning.flat[transfiguration] ?? 0;
  }
}

/**
 * The transfigurations the Dream Merchant may offer for a card: every eligible
 * type except Perfected. Perfected (which chains every other applicable
 * transfiguration) is reserved for other surfaces and never offered on a Dream
 * Journey, so both the improve and grant families filter through this helper.
 */
export function merchantTransfigurations(
  card: CardData,
  allowed: readonly TransfigurationType[] = MERCHANT_TUNING.allowedTransfigurations,
): readonly TransfigurationType[] {
  const allowedSet = new Set(allowed);
  return eligibleTransfigurations(card).filter((type) => allowedSet.has(type));
}

// --- transfigure --------------------------------------------------------------

/** A single (deck entry, eligible transfiguration) candidate pair. */
export interface TransfigureCandidatePair {
  deckCard: MerchantDeckCard;
  entryId: string;
  transfiguration: TransfigurationType;
  benefit: number;
  preview: CardData;
}

/**
 * Enumerates EVERY (untransfigured deck entry, eligible transfiguration) pair
 * with positive benefit. An entry eligible for three transfigurations
 * contributes three candidates — the anti-argmax fix at the heart of v3.
 *
 * Starter entries are excluded while at least one non-starter pair exists;
 * when the deck offers no non-starter pair, starter pairs are the candidates.
 * Already-transfigured entries are never enumerated (a `DeckEntry` holds at
 * most one transfiguration). Eligibility/benefit are read off the entry's base
 * card, since transfiguration applies to the base.
 */
export function transfigureCandidatePairs(
  context: MerchantContext,
): readonly TransfigureCandidatePair[] {
  const all: TransfigureCandidatePair[] = [];
  for (const deckCard of context.deckCards) {
    if (deckCard.deckEntry.transfiguration !== null) continue;
    const base = deckCard.card;
    for (const transfiguration of merchantTransfigurations(
      base,
      context.rewardSelection.tuning.allowedTransfigurations,
    )) {
      const preview = applyTransfigurationToCard(base, transfiguration);
      const benefit = transfigurationBenefit(
        base,
        transfiguration,
        preview,
        context.rewardSelection.tuning.transfigurationBenefit,
      );
      if (benefit <= 0) continue;
      all.push({
        deckCard,
        entryId: deckCard.entryId,
        transfiguration,
        benefit,
        preview,
      });
    }
  }

  const nonStarter = all.filter((pair) => !pair.deckCard.card.isStarter);
  return nonStarter.length > 0 ? nonStarter : all;
}

function transfigurePreviewObject(
  pair: TransfigureCandidatePair,
): MerchantGameObject {
  // Build the display descriptor off the entry's base card so the "after" card
  // paints the change in the transfiguration tint (e.g. a green energy orb for
  // Empowered, the added "Reclaim."/"Fast" marked text). The descriptor's card
  // equals `pair.preview` (an equivalence test guards this), so the visible
  // result matches the benefit math.
  const built = buildTransfigurationDisplay(
    pair.deckCard.card,
    pair.transfiguration,
  );
  return {
    objectType: "deckCard",
    entryId: pair.entryId,
    cardUuid: pair.deckCard.cardUuid,
    cardNumber: pair.deckCard.cardNumber,
    deckEntry: pair.deckCard.deckEntry,
    card: built.card,
    displayName: pair.deckCard.displayName,
    badge: { label: pair.transfiguration },
    previewCard: built.card,
    transfiguration: built.display,
  };
}

function transfigurePayload(
  pair: TransfigureCandidatePair,
): MerchantApplyPayload {
  return {
    kind: "transfigure_deck_entry",
    entryId: pair.entryId,
    cardUuid: pair.deckCard.cardUuid,
    cardNumber: pair.deckCard.cardNumber,
    transfiguration: pair.transfiguration,
    previewCard: pair.preview,
    description: `${pair.deckCard.displayName}: ${pair.transfiguration}`,
  };
}

/**
 * `transfigure` — *Permanently improve a deck card.*
 *
 * Candidates: every (untransfigured entry, eligible transfiguration) pair with
 * positive benefit (starters excluded while non-starter pairs exist). Signal:
 * `transfigureBlend.benefit * benefit + transfigureBlend.centrality *
 * centrality(card, deck)`. Band-sample one pair. Face-up with a before/after
 * preview. Eligible when >= 1 pair exists.
 */
export const transfigureBuilder: MerchantArchetypeBuilder = {
  archetypeId: "transfigure",
  family: "improve",
  eligible(context: MerchantContext): boolean {
    return transfigureCandidatePairs(context).length > 0;
  },
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const pairs = transfigureCandidatePairs(context);
    if (pairs.length === 0) return null;
    const selection = selectMerchantReward({
      context,
      archetypeId: "transfigure",
      mechanicId: "transfigure-deck-entry",
      policyId: "transfiguration-value",
    });
    const binding = selection?.bindings.transfigurations[0];
    const target = binding === undefined
      ? undefined
      : pairs.find((pair) =>
          pair.entryId === binding.entryId &&
          pair.transfiguration === binding.transfiguration,
        );
    if (selection === null || target === undefined) return null;

    return {
      archetypeId: "transfigure",
      family: "improve",
      gameObjects: [transfigurePreviewObject(target)],
      applyPayload: transfigurePayload(target),
      targetKey: `${target.entryId}:${target.transfiguration}`,
      ...selectionMetadata(selection),
    };
  },
};

// --- starter_transfigure ------------------------------------------------------

/**
 * Returns untransfigured starter deck entries that have at least one
 * positive-benefit eligible transfiguration.
 */
function transfigurableStarters(
  context: MerchantContext,
): readonly MerchantDeckCard[] {
  return context.deckCards.filter((deckCard) => {
    if (!deckCard.card.isStarter) return false;
    if (deckCard.deckEntry.transfiguration !== null) return false;
    return positiveBenefitTransfigurations(context, deckCard.card).length > 0;
  });
}

/** Eligible transfigurations of a card whose benefit is strictly positive. */
function positiveBenefitTransfigurations(
  context: MerchantContext,
  card: CardData,
): readonly TransfigurationType[] {
  return merchantTransfigurations(
    card,
    context.rewardSelection.tuning.allowedTransfigurations,
  ).filter((transfiguration) => {
    const preview = applyTransfigurationToCard(card, transfiguration);
    return transfigurationBenefit(
      card,
      transfiguration,
      preview,
      context.rewardSelection.tuning.transfigurationBenefit,
    ) > 0;
  });
}

/**
 * `starter_transfigure` — *Improve 1–2 of your starter cards.*
 *
 * Candidates: untransfigured starter entries with >= 1 positive-benefit
 * eligible transfiguration. Seeded-sample 1–2 entries uniformly; each gets a
 * uniformly seeded-sampled eligible transfiguration of positive benefit.
 * Composite payload. Face-up with previews. Eligible when >= 1 such starter
 * exists.
 */
export const starterTransfigureBuilder: MerchantArchetypeBuilder = {
  archetypeId: "starter_transfigure",
  family: "improve",
  eligible(context: MerchantContext): boolean {
    return transfigurableStarters(context).length > 0;
  },
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const starters = transfigurableStarters(context);
    if (starters.length === 0) return null;
    const maximumTargets = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "starter_transfigure",
    ).quantities.maximumTargets;

    const desired = selectMerchantCount({
      context,
      archetypeId: "starter_transfigure",
      mechanicId: "transfigure-deck-entry",
      policyId: "uniform",
      minimum: 1,
      maximum: Math.min(maximumTargets, starters.length),
    });
    const selection = selectMerchantReward({
      context,
      archetypeId: "starter_transfigure",
      mechanicId: "transfigure-deck-entry",
      policyId: "uniform",
      request: {
        count: desired,
        upTo: true,
        constraints: { starterOnly: true, distinctDeckEntries: true },
      },
    });
    if (selection === null) return null;

    const children: MerchantApplyPayload[] = [];
    const gameObjects: MerchantGameObject[] = [];
    for (const binding of selection.bindings.transfigurations) {
      const deckCard = binding.entryId === undefined
        ? undefined
        : context.deckEntryById.get(binding.entryId);
      const chosen = binding.transfiguration;
      if (deckCard === undefined) continue;
      const preview = applyTransfigurationToCard(deckCard.card, chosen);
      const pair: TransfigureCandidatePair = {
        deckCard,
        entryId: deckCard.entryId,
        transfiguration: chosen,
        benefit: transfigurationBenefit(
          deckCard.card,
          chosen,
          preview,
          context.rewardSelection.tuning.transfigurationBenefit,
        ),
        preview,
      };
      children.push(transfigurePayload(pair));
      gameObjects.push(transfigurePreviewObject(pair));
    }
    if (children.length === 0) return null;

    const payload: MerchantApplyPayload = { kind: "composite", children };

    return {
      archetypeId: "starter_transfigure",
      family: "improve",
      gameObjects,
      applyPayload: payload,
      targetKey: gameObjects
        .map((obj) =>
          obj.objectType === "deckCard"
            ? `${obj.entryId}:${obj.badge?.label ?? ""}`
            : "",
        )
        .join(","),
      ...selectionMetadata(selection),
    };
  },
};

// --- keyword_mod --------------------------------------------------------------

/**
 * Keyword-modification variants offered for deck Events. Granting Reclaim is the
 * Enduring transfiguration and granting Fast is the Hastened transfiguration, so
 * this archetype covers the one keyword change with no transfiguration: reducing
 * an existing Reclaim cost.
 */
export type KeywordModVariant = "reduce_reclaim";

/** A single (deck entry, keyword variant) candidate with its built payload. */
export interface KeywordModCandidatePair {
  deckCard: MerchantDeckCard;
  entryId: string;
  variant: KeywordModVariant;
  payload: MerchantApplyPayload;
  preview: CardData;
}

/** Effective Reclaim cost of a card; 0 when the card has no Reclaim. */
function effectiveReclaimCost(card: CardData): number {
  const cost = card.reclaimCost;
  return cost === null || cost === undefined ? 0 : cost;
}

/**
 * Enumerates the flat (deck Event entry, keyword variant) candidate list,
 * reading each entry's EFFECTIVE card so modifications already on the entry are
 * respected: a `reduce_reclaim` candidate for each Event whose effective Reclaim
 * cost is > 1.
 */
export function keywordModCandidatePairs(
  context: MerchantContext,
): readonly KeywordModCandidatePair[] {
  const pairs: KeywordModCandidatePair[] = [];
  for (const deckCard of context.deckCards) {
    const effective = effectiveCardFor(deckCard);
    if (effective.cardType !== "Event") continue;

    const reclaimCost = effectiveReclaimCost(effective);
    if (reclaimCost > 1) {
      pairs.push(
        buildKeywordModPair(deckCard, "reduce_reclaim", {
          setReclaim: reclaimCost - 1,
        }),
      );
    }
  }
  return pairs;
}

function buildKeywordModPair(
  deckCard: MerchantDeckCard,
  variant: KeywordModVariant,
  keywords: { reclaim?: number; fast?: boolean; setReclaim?: number },
): KeywordModCandidatePair {
  const previewBase = applyDeckEntryCardModification(
    effectiveCardFor(deckCard),
    { keywords },
  );
  return {
    deckCard,
    entryId: deckCard.entryId,
    variant,
    preview: previewBase,
    payload: {
      kind: "change_deck_entry_keywords",
      entryId: deckCard.entryId,
      cardUuid: deckCard.cardUuid,
      cardNumber: deckCard.cardNumber,
      keywords,
    },
  };
}

/**
 * `keyword_mod` — *Reduce a Reclaim cost.*
 *
 * Builds the flat (entry, variant) candidate list off each Event's effective
 * card, then seeded-samples one pair uniformly — no Legendary/cost argmax.
 * Face-up with a preview. Eligible when >= 1 pair exists.
 */
export const keywordModBuilder: MerchantArchetypeBuilder = {
  archetypeId: "keyword_mod",
  family: "improve",
  eligible(context: MerchantContext): boolean {
    return keywordModCandidatePairs(context).length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pairs = keywordModCandidatePairs(context);
    if (pairs.length === 0) return null;
    // Uniform seeded sample: a flat band over the whole list.
    const target = bandSample(pairs, () => 0, 1, rng, {
      bandFraction: 1,
      bandMinimum: pairs.length,
    })[0];
    if (target === undefined) return null;

    return {
      archetypeId: "keyword_mod",
      family: "improve",
      gameObjects: [
        {
          objectType: "deckCard",
          entryId: target.entryId,
          cardUuid: target.deckCard.cardUuid,
          cardNumber: target.deckCard.cardNumber,
          deckEntry: target.deckCard.deckEntry,
          card: target.preview,
          displayName: target.deckCard.displayName,
          previewCard: target.preview,
        },
      ],
      applyPayload: target.payload,
      targetKey: `${target.entryId}:${target.variant}`,
      trace: entryModificationTrace({
        candidates: pairs.map((pair) => ({
          key: `${pair.entryId}:${pair.variant}`,
          displayName: `${pair.deckCard.displayName}: ${pair.variant}`,
          cardUuid: pair.deckCard.cardUuid,
          cardNumber: pair.deckCard.cardNumber,
          entryId: pair.entryId,
          score: 0,
        })),
        selectedKeys: [`${target.entryId}:${target.variant}`],
        bandFraction: 1,
        bandMinimum: pairs.length,
        notes: ["uniform"],
      }),
    };
  },
};

// --- tribal_change ------------------------------------------------------------

/** The four main tribes a deck can commit to. */
export type Tribe = string;

/** Generated compatibility view of the TOML-authored tribe list. */
export const TRIBES = MERCHANT_TUNING.tribes;

/** A (off-tribe Character entry, active tribe) candidate pair. */
export interface TribalChangeCandidatePair {
  deckCard: MerchantDeckCard;
  entryId: string;
  tribe: Tribe;
}

/** Tribes the deck is committed to: >= `tribalThreshold` effective Characters. */
function activeTribes(context: MerchantContext): ReadonlySet<Tribe> {
  const counts = new Map<Tribe, number>();
  for (const deckCard of context.deckCards) {
    const effective = effectiveCardFor(deckCard);
    if (effective.cardType !== "Character") continue;
    const tribe = context.rewardSelection.tuning.tribes.find(
      (candidate) => candidate === effective.subtype,
    );
    if (tribe === undefined) continue;
    counts.set(tribe, (counts.get(tribe) ?? 0) + 1);
  }
  const active = new Set<Tribe>();
  for (const [tribe, count] of counts) {
    if (count >= context.rewardSelection.tuning.tribalThreshold) {
      active.add(tribe);
    }
  }
  return active;
}

/**
 * Enumerates (off-tribe Character entry with no prior type change, active
 * tribe) pairs. The entry's effective subtype must differ from the tribe.
 */
export function tribalChangeCandidatePairs(
  context: MerchantContext,
): readonly TribalChangeCandidatePair[] {
  const active = activeTribes(context);
  if (active.size === 0) return [];
  const pairs: TribalChangeCandidatePair[] = [];
  for (const deckCard of context.deckCards) {
    if (deckCard.deckEntry.typeChange != null) continue;
    const effective = effectiveCardFor(deckCard);
    if (effective.cardType !== "Character") continue;
    for (const tribe of active) {
      if (effective.subtype === tribe) continue;
      pairs.push({ deckCard, entryId: deckCard.entryId, tribe });
    }
  }
  return pairs;
}

function tribalTypeChange(tribe: Tribe): CardTypeChange {
  return {
    predicateId: `merchant:tribal:${tribe}`,
    cardType: "Character",
    subtype: tribe,
    label: `Becomes a ${tribe}`,
  };
}

/**
 * `tribal_change` — *Change a character's subtype to your tribe.*
 *
 * Candidates: (off-tribe Character entry with no prior type change, active
 * tribe) pairs. A tribe is active at >= `tribalThreshold` effective Characters
 * of that subtype. Signal: the entry's `centrality` — converting your better
 * off-tribe characters matters more. Band-sample one pair. Face-up with a
 * preview. Eligible when >= 1 pair exists.
 */
export const tribalChangeBuilder: MerchantArchetypeBuilder = {
  archetypeId: "tribal_change",
  family: "improve",
  eligible(context: MerchantContext): boolean {
    return tribalChangeCandidatePairs(context).length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pairs = tribalChangeCandidatePairs(context);
    if (pairs.length === 0) return null;

    const deck = context.deckCards.map((deckCard) => deckCard.card);
    const scoreFor = (pair: TribalChangeCandidatePair): number =>
      centrality(
        pair.deckCard.card,
        deck,
        context.fitModel,
        context.rewardSelection.tuning.centrality,
      );
    const target = bandSample(pairs, scoreFor, 1, rng, {
      bandFraction: context.rewardSelection.tuning.tribalBandFraction,
      bandMinimum: context.rewardSelection.tuning.tribalBandMinimum,
    })[0];
    if (target === undefined) return null;

    const typeChange = tribalTypeChange(target.tribe);
    const preview = applyDeckEntryCardModification(
      effectiveCardFor(target.deckCard),
      { typeChange },
    );

    return {
      archetypeId: "tribal_change",
      family: "improve",
      gameObjects: [
        {
          objectType: "deckCard",
          entryId: target.entryId,
          cardUuid: target.deckCard.cardUuid,
          cardNumber: target.deckCard.cardNumber,
          deckEntry: target.deckCard.deckEntry,
          card: preview,
          displayName: target.deckCard.displayName,
          badge: { label: `Becomes a ${target.tribe}` },
          previewCard: preview,
        },
      ],
      applyPayload: {
        kind: "change_deck_entry_type",
        entryId: target.entryId,
        cardUuid: target.deckCard.cardUuid,
        cardNumber: target.deckCard.cardNumber,
        typeChange,
      },
      targetKey: `${target.entryId}:${target.tribe}`,
      trace: entryModificationTrace({
        candidates: pairs.map((pair) => ({
          key: `${pair.entryId}:${pair.tribe}`,
          displayName: `${pair.deckCard.displayName} → ${pair.tribe}`,
          cardUuid: pair.deckCard.cardUuid,
          cardNumber: pair.deckCard.cardNumber,
          entryId: pair.entryId,
          score: scoreFor(pair),
          components: { centrality: scoreFor(pair) },
        })),
        selectedKeys: [`${target.entryId}:${target.tribe}`],
        bandFraction: context.rewardSelection.tuning.tribalBandFraction,
        bandMinimum: context.rewardSelection.tuning.tribalBandMinimum,
        notes: [`activeTribes=${[...activeTribes(context)].join(",")}`],
      }),
    };
  },
};
