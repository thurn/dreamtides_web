// Shared content-resolution helpers.
//
// Predicate templates, rewards, and viability checks call these helpers to
// project journey content (cards, dreamsigns, resources) through the
// JourneyContext. The module also re-exports the journey-wide vocabularies
// (bane names, site types, transfigurations) so consumers do not need to
// reach directly into effects.

import {
  BANE_NAMES,
  SITE_TYPES,
  JOURNEY_REPLACEABLE_SITE_TYPES,
  JOURNEY_REWARDABLE_SITE_TYPES,
  JOURNEY_TRANSFIGURATIONS,
  isCardEligibleForTransfiguration,
  resolveCardTargets,
  resolveDreamsignTargets,
  type CardTargetPredicate,
  type DreamsignTargetPredicate,
} from "../effects";
import type { CardContent, DreamsignContent } from "../../content/types";
import type { JourneyContext } from "../context";
import { drawInt, type DrawContext } from "../../util/rng";

export {
  BANE_NAMES,
  SITE_TYPES,
  JOURNEY_REPLACEABLE_SITE_TYPES,
  JOURNEY_REWARDABLE_SITE_TYPES,
  JOURNEY_TRANSFIGURATIONS,
  isCardEligibleForTransfiguration,
};

export function transfigurationsEligibleForPredicate(
  ctx: JourneyContext,
  predicate: CardTargetPredicate,
): readonly string[] {
  // A named transfiguration may be paired with a predicate-keyed reward only
  // if every card in the predicate's match set is eligible for that
  // transfiguration. Using the subset criterion (rather than overlap) means
  // a reward like "Apply Bronze to 3 chosen cards with a 'discard' ability"
  // is rejected, because the discard predicate matches both events and
  // characters and the player could pick a character — for which Bronze
  // cannot be applied. The events predicate is the only predicate whose
  // match set is strictly a subset of the Bronze/Azure eligibility set.
  const matches = cardMatches(ctx, predicate);
  if (matches.length === 0) {
    return JOURNEY_TRANSFIGURATIONS;
  }
  return JOURNEY_TRANSFIGURATIONS.filter((transfiguration) =>
    matches.every((card) => isCardEligibleForTransfiguration(transfiguration, card)),
  );
}

export function cardMatches(
  ctx: JourneyContext,
  predicate: CardTargetPredicate,
): readonly CardContent[] {
  return resolveCardTargets(ctx.content, ctx.state.quest, predicate);
}

export function dreamsignMatches(
  ctx: JourneyContext,
  predicate: DreamsignTargetPredicate = {},
): readonly DreamsignContent[] {
  return resolveDreamsignTargets(ctx.content, ctx.state.quest, predicate);
}

export function activeDreamsignCount(ctx: JourneyContext): number {
  return ctx.state.quest.activeDreamsigns.length;
}

export function starterCardCount(ctx: JourneyContext): number {
  return ctx.state.quest.deck.summary.starterCards;
}

export function essenceAmount(ctx: JourneyContext): number {
  return ctx.state.quest.resources.essence;
}

export function omenAmount(ctx: JourneyContext): number {
  return ctx.state.quest.resources.omens;
}

export function maxEssence(ctx: JourneyContext): number {
  return ctx.state.quest.resources.maxEssence;
}

export function baneCount(ctx: JourneyContext): number {
  return ctx.state.quest.banes.length;
}

export function pickFromList<T>(
  draw: DrawContext,
  label: string,
  list: readonly T[],
): T {
  if (list.length === 0) {
    throw new Error(`pickFromList: empty list for label ${label}`);
  }
  const index = drawInt(draw, label, 0, list.length - 1);
  return list[index];
}
