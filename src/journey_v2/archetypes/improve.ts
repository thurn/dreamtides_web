import {
  applyTransfigurationToCard,
  buildTransfigurationDisplay,
  eligibleTransfigurations,
} from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/journey";
import type { TransfigurationData } from "../../types/transfiguration-data";
import { transfigurationForm } from "../../data/transfiguration-data";
import { auguryArchetype } from "../../data/augury-data";
import type { AuguryRng } from "../signals/rng";
import type {
  AuguryApplyPayload,
  AuguryContext,
  AuguryDeckCard,
  AuguryGameObject,
} from "../types";
import type { AuguryArchetypeBuilder, AuguryOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectAuguryCount,
  selectAuguryReward,
} from "./sharedSelection";
import type { DeckEntryId } from "../../types/identifiers";
import { parseAuguryTargetKey } from "../../types/identifiers";

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
  data: TransfigurationData,
  card: CardData,
  transfiguration: TransfigurationType,
  preview: CardData,
): number {
  const form = transfigurationForm(data, transfiguration);
  switch (form.rewardScore.kind) {
    case "statDelta": {
      if (transfiguration === "Empowered") {
        const oldCost = card.energyCost ?? 0;
        const newCost = preview.energyCost ?? 0;
        return clamp01((oldCost - newCost) / form.rewardScore.divisor);
      }
      if (transfiguration !== "Kindled") {
        throw new Error(
          `Invalid stat-delta reward score for ${transfiguration}`,
        );
      }
      const oldSpark = card.spark ?? 0;
      const newSpark = preview.spark ?? 0;
      return clamp01((newSpark - oldSpark) / form.rewardScore.divisor);
    }
    case "flat":
      return form.rewardScore.value;
  }
}

/**
 * The transfigurations a generated reward may offer for a card: every eligible
 * type except Perfected. Perfected chains every other applicable form and is
 * reserved for authored rewards.
 */
export function rewardTransfigurations(
  data: TransfigurationData,
  card: CardData,
): readonly TransfigurationType[] {
  return eligibleTransfigurations(data, card).filter(
    (type) => type !== "Perfected",
  );
}

// --- transfigure --------------------------------------------------------------

/** A single (deck entry, eligible transfiguration) candidate pair. */
export interface TransfigureCandidatePair {
  transfigurationData: TransfigurationData;
  deckCard: AuguryDeckCard;
  entryId: DeckEntryId;
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
  context: AuguryContext,
): readonly TransfigureCandidatePair[] {
  const all: TransfigureCandidatePair[] = [];
  for (const deckCard of context.deckCards) {
    if (deckCard.deckEntry.transfiguration !== null) continue;
    const base = deckCard.card;
    for (const transfiguration of rewardTransfigurations(
      context.rewardSelection.content.transfigurationData,
      base,
    )) {
      const preview = applyTransfigurationToCard(
        context.rewardSelection.content.transfigurationData,
        base,
        transfiguration,
      );
      const benefit = transfigurationBenefit(
        context.rewardSelection.content.transfigurationData,
        base,
        transfiguration,
        preview,
      );
      if (benefit <= 0) continue;
      all.push({
        transfigurationData:
          context.rewardSelection.content.transfigurationData,
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
): AuguryGameObject {
  // Build the display descriptor off the entry's base card so the "after" card
  // paints the change in the transfiguration tint (e.g. a green energy orb for
  // Empowered, the added "Reclaim."/"Fast" marked text). The descriptor's card
  // equals `pair.preview` (an equivalence test guards this), so the visible
  // result matches the benefit math.
  const built = buildTransfigurationDisplay(
    pair.transfigurationData,
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
): AuguryApplyPayload {
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
 * positive benefit (starters excluded while non-starter pairs exist). Mechanical
 * benefit leads; leave-one-out affinity breaks ties. Face-up with a before/after
 * preview. Eligible when at least one pair exists.
 */
export const transfigureBuilder: AuguryArchetypeBuilder = {
  archetypeId: "transfigure",
  family: "improve",
  eligible(context: AuguryContext): boolean {
    return transfigureCandidatePairs(context).length > 0;
  },
  build(
    context: AuguryContext,
    _rng: AuguryRng,
  ): AuguryOfferDraft | null {
    const pairs = transfigureCandidatePairs(context);
    if (pairs.length === 0) return null;
    const selection = selectAuguryReward({
      context,
      archetypeId: "transfigure",
      mechanicId: "transfigure-deck-entry",
      policyId: augurySelectionPolicy(context, "transfigure"),
    });
    const binding = selection?.bindings.transfigurations[0];
    const target =
      binding === undefined
        ? undefined
        : pairs.find(
            (pair) =>
              pair.entryId === binding.entryId &&
              pair.transfiguration === binding.transfiguration,
          );
    if (selection === null || target === undefined) return null;

    return {
      archetypeId: "transfigure",
      family: "improve",
      gameObjects: [transfigurePreviewObject(target)],
      applyPayload: transfigurePayload(target),
      targetKey: parseAuguryTargetKey(
        `${target.entryId}:${target.transfiguration}`,
      ),
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
  context: AuguryContext,
): readonly AuguryDeckCard[] {
  return context.deckCards.filter((deckCard) => {
    if (!deckCard.card.isStarter) return false;
    if (deckCard.deckEntry.transfiguration !== null) return false;
    return positiveBenefitTransfigurations(context, deckCard.card).length > 0;
  });
}

/** Eligible transfigurations of a card whose benefit is strictly positive. */
function positiveBenefitTransfigurations(
  context: AuguryContext,
  card: CardData,
): readonly TransfigurationType[] {
  return rewardTransfigurations(
    context.rewardSelection.content.transfigurationData,
    card,
  ).filter((transfiguration) => {
    const preview = applyTransfigurationToCard(
      context.rewardSelection.content.transfigurationData,
      card,
      transfiguration,
    );
    return (
      transfigurationBenefit(
        context.rewardSelection.content.transfigurationData,
        card,
        transfiguration,
        preview,
      ) > 0
    );
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
export const starterTransfigureBuilder: AuguryArchetypeBuilder = {
  archetypeId: "starter_transfigure",
  family: "improve",
  eligible(context: AuguryContext): boolean {
    return transfigurableStarters(context).length > 0;
  },
  build(
    context: AuguryContext,
    _rng: AuguryRng,
  ): AuguryOfferDraft | null {
    const starters = transfigurableStarters(context);
    if (starters.length === 0) return null;
    const maximumTargets = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "starter_transfigure",
    ).quantities.maximumTargets;

    const desired = selectAuguryCount({
      context,
      archetypeId: "starter_transfigure",
      mechanicId: "transfigure-deck-entry",
      policyId: augurySelectionPolicy(context, "starter_transfigure"),
      minimum: 1,
      maximum: Math.min(maximumTargets, starters.length),
    });
    const selection = selectAuguryReward({
      context,
      archetypeId: "starter_transfigure",
      mechanicId: "transfigure-deck-entry",
      policyId: augurySelectionPolicy(context, "starter_transfigure"),
      request: {
        count: desired,
        upTo: true,
        constraints: { starterOnly: true, distinctDeckEntries: true },
      },
    });
    if (selection === null) return null;

    const children: AuguryApplyPayload[] = [];
    const gameObjects: AuguryGameObject[] = [];
    for (const binding of selection.bindings.transfigurations) {
      const deckCard =
        binding.entryId === undefined
          ? undefined
          : context.deckEntryById.get(binding.entryId);
      const chosen = binding.transfiguration;
      if (deckCard === undefined) continue;
      const preview = applyTransfigurationToCard(
        context.rewardSelection.content.transfigurationData,
        deckCard.card,
        chosen,
      );
      const pair: TransfigureCandidatePair = {
        transfigurationData:
          context.rewardSelection.content.transfigurationData,
        deckCard,
        entryId: deckCard.entryId,
        transfiguration: chosen,
        benefit: transfigurationBenefit(
          context.rewardSelection.content.transfigurationData,
          deckCard.card,
          chosen,
          preview,
        ),
        preview,
      };
      children.push(transfigurePayload(pair));
      gameObjects.push(transfigurePreviewObject(pair));
    }
    if (children.length === 0) return null;

    const payload: AuguryApplyPayload = { kind: "composite", children };

    return {
      archetypeId: "starter_transfigure",
      family: "improve",
      gameObjects,
      applyPayload: payload,
      targetKey: parseAuguryTargetKey(
        gameObjects
          .map((obj) =>
            obj.objectType === "deckCard"
              ? `${obj.entryId}:${obj.badge?.label ?? ""}`
              : "",
          )
          .join(","),
      ),
      ...selectionMetadata(selection),
    };
  },
};
