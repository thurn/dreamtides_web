import {
  applyTransfigurationToCard,
  eligibleTransfigurations,
} from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { TransfigurationType } from "../../types/quest";
import { centrality } from "../signals/fit";
import { bandSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantDeckCard,
  MerchantGameObject,
} from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * The single source of truth for the v3 transfiguration benefit table.
 *
 * Benefit is mechanical where the effect is numeric (Viridian halves an energy
 * cost, Scarlet doubles a character's spark) and a flat constant where the
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
): number {
  switch (transfiguration) {
    case "Viridian": {
      const oldCost = card.energyCost ?? 0;
      const newCost = preview.energyCost ?? 0;
      return clamp01((oldCost - newCost) / 2);
    }
    case "Scarlet": {
      const oldSpark = card.spark ?? 0;
      const newSpark = preview.spark ?? 0;
      return clamp01((newSpark - oldSpark) / 4);
    }
    case "Golden":
      return 0.4;
    case "Azure":
      return 0.55;
    case "Bronze":
      return 0.55;
    case "Magenta":
      return 0.5;
    case "Rose":
      return 0.5;
    case "Prismatic":
      return 0.65;
  }
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
    for (const transfiguration of eligibleTransfigurations(base)) {
      const preview = applyTransfigurationToCard(base, transfiguration);
      const benefit = transfigurationBenefit(base, transfiguration, preview);
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
  return {
    objectType: "deckCard",
    entryId: pair.entryId,
    cardUuid: pair.deckCard.cardUuid,
    cardNumber: pair.deckCard.cardNumber,
    deckEntry: pair.deckCard.deckEntry,
    card: pair.preview,
    displayName: pair.deckCard.displayName,
    badge: { label: pair.transfiguration },
    previewCard: pair.preview,
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
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pairs = transfigureCandidatePairs(context);
    if (pairs.length === 0) return null;

    const deck = context.deckCards.map((deckCard) => deckCard.card);
    const blend = MERCHANT_TUNING.transfigureBlend;
    const sampled = bandSample(
      pairs,
      (pair) =>
        blend.benefit * pair.benefit +
        blend.centrality * centrality(pair.deckCard.card, deck, context.fitModel),
      1,
      rng,
    );
    const target = sampled[0];
    if (target === undefined) return null;

    return {
      archetypeId: "transfigure",
      family: "improve",
      title: `${target.deckCard.displayName}: ${target.transfiguration}`,
      summary: "Permanently improve a deck card.",
      gameObjects: [transfigurePreviewObject(target)],
      hiddenUntilCommit: false,
      applyPayload: transfigurePayload(target),
      targetKey: `${target.entryId}:${target.transfiguration}`,
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
    return positiveBenefitTransfigurations(deckCard.card).length > 0;
  });
}

/** Eligible transfigurations of a card whose benefit is strictly positive. */
function positiveBenefitTransfigurations(
  card: CardData,
): readonly TransfigurationType[] {
  return eligibleTransfigurations(card).filter((transfiguration) => {
    const preview = applyTransfigurationToCard(card, transfiguration);
    return transfigurationBenefit(card, transfiguration, preview) > 0;
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
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const starters = transfigurableStarters(context);
    if (starters.length === 0) return null;

    // Sample 1–2 entries uniformly (a flat band over the whole list).
    const desired = starters.length >= 2 && rng() < 0.5 ? 2 : 1;
    const sampledStarters = bandSample(starters, () => 0, desired, rng, {
      bandFraction: 1,
      bandMinimum: starters.length,
    });
    if (sampledStarters.length === 0) return null;

    const children: MerchantApplyPayload[] = [];
    const gameObjects: MerchantGameObject[] = [];
    for (const deckCard of sampledStarters) {
      const options = positiveBenefitTransfigurations(deckCard.card);
      const chosen = bandSample(options, () => 0, 1, rng, {
        bandFraction: 1,
        bandMinimum: options.length,
      })[0];
      if (chosen === undefined) continue;
      const preview = applyTransfigurationToCard(deckCard.card, chosen);
      const pair: TransfigureCandidatePair = {
        deckCard,
        entryId: deckCard.entryId,
        transfiguration: chosen,
        benefit: transfigurationBenefit(deckCard.card, chosen, preview),
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
      title: `Improve ${String(children.length)} starter card${children.length === 1 ? "" : "s"}`,
      summary: "Polish your starter cards.",
      gameObjects,
      hiddenUntilCommit: false,
      applyPayload: payload,
      targetKey: gameObjects
        .map((obj) =>
          obj.objectType === "deckCard"
            ? `${obj.entryId}:${obj.badge?.label ?? ""}`
            : "",
        )
        .join(","),
    };
  },
};
