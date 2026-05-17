// Cost templates.
//
// Ported from the CLI's `src/journey/shared/costs.ts` with one structural
// addition: every template carries a `locked(params, ctx)` predicate that
// reports whether the cost is currently unaffordable. Assembly code reads
// this directly to fill `JourneyOption.locked`; the `[LOCKED]` text prefix
// continues to be applied inside `render` via `withLockedPrefix`.
//
// The viability audit (Task 8) walked every template and tightened `viable`
// where the CLI shipped a stand-in:
//
//   - Named-card templates (purge_named_card, transform_card_to_random_pool)
//     route through `deckContainsCardByName(ctx, p.cardName)`. The chosen card
//     is rolled from the deck, but viability must independently verify the
//     deck still holds a card with that name; otherwise a stale rollParams
//     value would surface a no-op option. remove_transfiguration_from_card
//     additionally requires a named entry with active transfiguration state.
//   - `purge_all_duplicate_cards` gates on `deckHasDuplicateStack`. A deck
//     of N unique cards has no duplicate stack to purge, so the CLI's
//     `totalCards >= 2` smell offered a no-op option.
//   - Deck-size-N templates (draw_X_purge_chosen) route through
//     `deckHasMinSize(ctx, p.drawCount)`.
//   - Predicate-keyed templates (purge_random_predicate_card,
//     purge_chosen_predicate_card, remove_transfigurations_from_random_
//     predicate) route through deck-entry-aware predicate helpers and pin the
//     `source: "deck"` scope, so catalog-only predicate matches are excluded.
//   - Dreamsign templates use `activeDreamsignCount(ctx) >= 1` via the
//     `activeDreamsignCount` import from content.
//   - Dreamwell-keyed templates (set_starting_dreamwell_negative,
//     shuffle_negative_dreamwell_cards) gate on
//     `NEGATIVE_DREAMWELL_CARDS.length >= 1`. While dreamwell content is a
//     stub list (Task 17), these templates correctly hide themselves until
//     content lands.
//   - `lose_max_essence` is classified as a Resource cost: viable is
//     `() => true`, with `locked` flipping when the loss would consume the
//     entire max-essence pool.
//   - `meta_pay_2_costs` ANDs its sub-cost viabilities and projects
//     guaranteed resource spend in sub-cost order for compound locking; the
//     compound test pins the [LOCKED]-prefix-exactly-once property.

import type { DrawContext } from "../../util/rng";
import { drawInt, weightedChoice } from "../../util/rng";
import type { JourneyMutations } from "../../apply/JourneyMutations";
import { logSkippedVisualTemplate } from "../../apply/skipLog";
import type { CardContent, DreamsignContent } from "../../content/types";
import type { JourneyContext } from "../context";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "./cec";
import {
  BANE_NAMES,
  activeDreamsignCount,
  cardMatches,
  essenceAmount,
  maxEssence,
  omenAmount,
  pickFromList,
} from "./content";
import {
  findDeckEntriesByName,
  findDeckEntriesByPredicate,
  findDeckEntryTransfiguration,
  findFirstDeckEntryIdByCardName,
  projectedDeckEntries,
} from "./deckEntries";
import { NEGATIVE_DREAMWELL_CARDS } from "./dreamwell";
import { PREDICATES, getPredicate } from "./predicates";
import { quoteName, withLockedPrefix } from "./text";
import type { Cost, Predicate } from "./types";
import {
  deckContainsCardByName,
  deckContainsPredicate,
  deckContainsTransfiguredCardByName,
  deckContainsTransfiguredPredicate,
  deckHasDuplicateStack,
  deckHasMinSize,
} from "./viability";

const MINOR_RANDOM_TRADE_COST_WEIGHT = 1;
const RARE_RANDOM_TRADE_COST_WEIGHT = 0.25;
const RESOURCE_RANDOM_TRADE_COST_WEIGHT = 13;
const BANE_GAIN_RANDOM_TRADE_COST_WEIGHT = 6;

type DreamsignForApply = Parameters<JourneyMutations["addDreamsign"]>[0];

function nextBattlePhrase(battles: number): string {
  return battles === 1 ? "the next battle" : `the next ${battles} battles`;
}

function applyDrawContext(ctx: JourneyContext): DrawContext {
  return {
    seed: ctx.state.quest.seed,
    contentVersion: ctx.contentVersion,
    rootJourneyIndex: 0,
  };
}

// Inclusive integer roll for resource-range apply. Wave 1 does not plumb a
// deterministic RNG through the apply path; the option-level seed governs
// rollParams (generation), and apply is a one-shot resolution event. A future
// task can swap this for a labeled-RNG roll if determinism at apply time
// becomes a requirement; the surrounding tests assert the rolled value lies
// in [min, max] rather than pinning a literal.
function rollIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Resolve a bane name to its catalog cardId by scanning the content bundle.
// Bane cards are identified by `name === baneName` because `CardContent` does
// not carry an `isBane` flag — the per-deck-entry `isBane` boolean is set by
// `addBaneCardById` at the QuestMutations layer. This mirrors
// `pushTemporaryBaneGrant`'s name-based catalog scan in `quest-context.tsx`.
// Returns `undefined` when no card with that name is present; the bane apply
// bodies log a warn and skip the missing iteration.
function resolveBaneCardId(ctx: JourneyContext, baneName: string): string | undefined {
  return ctx.content.cards.find((card) => card.name === baneName)?.id;
}

// Roll a bane name from the controlled vocabulary. Wave 1's `gain_random_banes`
// apply rolls per-iteration via `Math.random` for the same reason
// `rollIntInclusive` does (the option-level seed governs rollParams, not the
// apply step). Future tasks may plumb a labeled-RNG through the apply path.
function rollBaneName(): string {
  return BANE_NAMES[Math.floor(Math.random() * BANE_NAMES.length)];
}

export function pickUniqueCardIds(
  draw: DrawContext,
  label: string,
  pool: readonly CardContent[],
  count: number,
): string[] {
  const remaining = [...pool];
  const picked: string[] = [];

  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const card = pickFromList(draw, `${label}:${i}`, remaining);
    picked.push(card.id);
    remaining.splice(remaining.findIndex((candidate) => candidate.id === card.id), 1);
  }

  return picked;
}

function pickUniqueDeckEntryIds(
  draw: DrawContext,
  label: string,
  entryIds: readonly string[],
  count: number,
): string[] {
  const remaining = [...entryIds];
  const picked: string[] = [];

  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const entryId = pickFromList(draw, `${label}:${i}`, remaining);
    picked.push(entryId);
    remaining.splice(remaining.indexOf(entryId), 1);
  }

  return picked;
}

function warnSkippedCardApply(templateId: string, reason: string): void {
  console.warn(`[journeys/apply] ${templateId} skipped: ${reason}`);
}

function warnSkippedDreamsignApply(templateId: string, reason: string): void {
  console.warn(`[journeys/apply] ${templateId} skipped: ${reason}`);
}

function selectedDeckEntryId(
  templateId: string,
  ctx: JourneyContext,
  chooserResolution: Parameters<Cost["apply"]>[3],
  eligibleEntryIds?: readonly string[],
): string | undefined {
  if (chooserResolution?.kind !== "card") {
    warnSkippedCardApply(templateId, "missing card chooser resolution");
    return undefined;
  }

  if (chooserResolution.entryIds.length !== 1) {
    warnSkippedCardApply(
      templateId,
      `expected exactly one selected card entry, got ${String(chooserResolution.entryIds.length)}`,
    );
    return undefined;
  }

  if (chooserResolution.cardIds !== undefined && chooserResolution.cardIds.length !== 1) {
    warnSkippedCardApply(
      templateId,
      `expected exactly one selected card id, got ${String(chooserResolution.cardIds.length)}`,
    );
    return undefined;
  }

  const entryId = chooserResolution.entryIds[0];
  if (entryId === undefined) {
    warnSkippedCardApply(templateId, "card chooser resolution did not include an entry id");
    return undefined;
  }

  const entry = projectedDeckEntries(ctx).find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) {
    warnSkippedCardApply(templateId, `deck entry ${JSON.stringify(entryId)} was not found`);
    return undefined;
  }

  const selectedCardId = chooserResolution.cardIds?.[0];
  if (selectedCardId !== undefined && entry.card.id !== selectedCardId) {
    warnSkippedCardApply(
      templateId,
      `chooser card ${JSON.stringify(selectedCardId)} did not match deck entry ${JSON.stringify(entryId)}`,
    );
    return undefined;
  }

  if (eligibleEntryIds !== undefined && !eligibleEntryIds.includes(entryId)) {
    warnSkippedCardApply(
      templateId,
      `deck entry ${JSON.stringify(entryId)} was not eligible for this chooser`,
    );
    return undefined;
  }

  return entryId;
}

function selectedDreamsignIndex(
  templateId: string,
  ctx: JourneyContext,
  chooserResolution: Parameters<Cost["apply"]>[3],
): number | undefined {
  if (chooserResolution?.kind !== "dreamsign") {
    warnSkippedDreamsignApply(templateId, "missing dreamsign chooser resolution");
    return undefined;
  }

  if (chooserResolution.indices.length !== 1) {
    warnSkippedDreamsignApply(
      templateId,
      `expected exactly one selected dreamsign index, got ${String(chooserResolution.indices.length)}`,
    );
    return undefined;
  }

  if (chooserResolution.dreamsignIds !== undefined && chooserResolution.dreamsignIds.length !== 1) {
    warnSkippedDreamsignApply(
      templateId,
      `expected exactly one selected dreamsign id, got ${String(chooserResolution.dreamsignIds.length)}`,
    );
    return undefined;
  }

  const index = chooserResolution.indices[0];
  if (!Number.isInteger(index)) {
    warnSkippedDreamsignApply(templateId, "dreamsign chooser resolution did not include an index");
    return undefined;
  }

  const activeDreamsign = ctx.state.quest.activeDreamsigns[index];
  if (activeDreamsign === undefined) {
    warnSkippedDreamsignApply(templateId, `active dreamsign index ${String(index)} was not found`);
    return undefined;
  }

  const expectedDreamsignId = chooserResolution.dreamsignIds?.[0];
  if (expectedDreamsignId !== undefined && activeDreamsign.dreamsignId !== expectedDreamsignId) {
    warnSkippedDreamsignApply(
      templateId,
      `active dreamsign index ${String(index)} is ${JSON.stringify(activeDreamsign.dreamsignId)}, not ${JSON.stringify(expectedDreamsignId)}`,
    );
    return undefined;
  }

  return index;
}

function rawString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "string" ? value : undefined;
}

function projectDreamsignForApply(source: DreamsignContent): DreamsignForApply {
  const imageName = rawString(source.raw, "image-name");
  const imageAlt = rawString(source.raw, "image-alt");
  return {
    id: source.id,
    name: source.name,
    effectDescription: source.renderedText,
    ...(imageName === undefined ? {} : { imageName }),
    ...(imageAlt === undefined ? {} : { imageAlt }),
    isBane: false,
  };
}

function poolDreamsignsById(ctx: JourneyContext): DreamsignContent[] {
  const byId = new Map(ctx.content.dreamsigns.map((dreamsign) => [dreamsign.id, dreamsign]));
  return ctx.state.quest.dreamsignPoolIds.flatMap((id) => {
    const dreamsign = byId.get(id);
    return dreamsign === undefined ? [] : [dreamsign];
  });
}

function pickedDrawPurgeEntryIds(ctx: JourneyContext, drawCount: number): string[] {
  return pickUniqueDeckEntryIds(
    applyDrawContext(ctx),
    "draw_X_purge_chosen:entry",
    projectedDeckEntries(ctx).map((entry) => entry.entryId),
    drawCount,
  );
}

function resolveDrawPurgeEntryId(
  ctx: JourneyContext,
  drawCount: number,
  chooserResolution: Parameters<Cost["apply"]>[3],
): string | undefined {
  if (chooserResolution?.kind !== "card") {
    warnSkippedCardApply("draw_X_purge_chosen", "missing card chooser resolution");
    return undefined;
  }

  if (chooserResolution.entryIds.length !== 1) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `expected exactly one selected card entry, got ${String(chooserResolution.entryIds.length)}`,
    );
    return undefined;
  }

  if (chooserResolution.cardIds !== undefined && chooserResolution.cardIds.length !== 1) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `expected exactly one selected card id, got ${String(chooserResolution.cardIds.length)}`,
    );
    return undefined;
  }

  const selectedEntryId = chooserResolution.entryIds[0];
  if (selectedEntryId === undefined) {
    warnSkippedCardApply("draw_X_purge_chosen", "card chooser resolution did not include an entry id");
    return undefined;
  }

  const entries = projectedDeckEntries(ctx);
  const pickedEntryIds = pickedDrawPurgeEntryIds(ctx, drawCount);
  const concreteEntry = entries.find((entry) => entry.entryId === selectedEntryId);
  if (concreteEntry !== undefined) {
    if (!pickedEntryIds.includes(concreteEntry.entryId)) {
      warnSkippedCardApply(
        "draw_X_purge_chosen",
        `deck entry ${JSON.stringify(concreteEntry.entryId)} was not in the rolled choices`,
      );
      return undefined;
    }

    const selectedCardId = chooserResolution.cardIds?.[0];
    if (selectedCardId !== undefined && concreteEntry.card.id !== selectedCardId) {
      warnSkippedCardApply(
        "draw_X_purge_chosen",
        `chooser card ${JSON.stringify(selectedCardId)} did not match deck entry ${JSON.stringify(concreteEntry.entryId)}`,
      );
      return undefined;
    }

    return concreteEntry.entryId;
  }

  const rolledMatch = /^rolled:([^:]+):(\d+)$/.exec(selectedEntryId);
  if (rolledMatch === null) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `deck entry ${JSON.stringify(selectedEntryId)} was not found`,
    );
    return undefined;
  }

  const [, encodedCardId, rolledIndexText] = rolledMatch;
  const rolledIndex = Number.parseInt(rolledIndexText, 10);
  const entryId = pickedEntryIds[rolledIndex];
  if (entryId === undefined) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `rolled chooser index ${String(rolledIndex)} was not found`,
    );
    return undefined;
  }

  const selectedCardId = chooserResolution.cardIds?.[0];
  const entry = entries.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `rolled deck entry ${JSON.stringify(entryId)} was not found`,
    );
    return undefined;
  }
  if (entry.card.id !== encodedCardId) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `rolled chooser card ${JSON.stringify(encodedCardId)} did not match deck entry ${JSON.stringify(entryId)}`,
    );
    return undefined;
  }
  if (selectedCardId !== undefined && entry.card.id !== selectedCardId) {
    warnSkippedCardApply(
      "draw_X_purge_chosen",
      `rolled chooser card ${JSON.stringify(selectedCardId)} did not match deck entry ${JSON.stringify(entryId)}`,
    );
    return undefined;
  }

  return entryId;
}

type PayEssenceParams = { x: number };
const payEssence: Cost<PayEssenceParams> = {
  id: "pay_essence",
  weight: RESOURCE_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "pay_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  locked: (p, ctx) => p.x > essenceAmount(ctx),
  render: (p, ctx) => withLockedPrefix(`Lose ${p.x} essence`, p.x > essenceAmount(ctx)),
  apply: (p, _ctx, mut) => {
    mut.changeEssence(-p.x, "dream_journey:pay_essence");
  },
};

type PayOmensParams = { x: number };
const payOmens: Cost<PayOmensParams> = {
  id: "pay_omens",
  weight: RESOURCE_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "pay_omens:x", 1, 2) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  locked: (p, ctx) => p.x > omenAmount(ctx),
  render: (p, ctx) =>
    withLockedPrefix(`Lose ${p.x} omen${p.x === 1 ? "" : "s"}`, p.x > omenAmount(ctx)),
  apply: (p, _ctx, mut) => {
    mut.changeOmens(-p.x, "dream_journey:pay_omens");
  },
};

type PayMaxEssenceParams = Record<string, never>;
const payMaxEssence: Cost<PayMaxEssenceParams> = {
  id: "pay_max_essence",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: (_p, ctx) => maxEssence(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  locked: () => false,
  render: () => "Lose maximum essence",
  apply: (_p, ctx, mut) => {
    mut.changeMaxEssence(-maxEssence(ctx), "dream_journey:pay_max_essence");
  },
};

type PayEssenceRangeParams = { min: number; max: number };
const payEssenceRandomRange: Cost<PayEssenceRangeParams> = {
  id: "pay_essence_random_range",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "pay_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "pay_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  // The range cost rolls randomly at resolve time; we cannot know the actual
  // roll. Treat the option as locked only when even the minimum cannot be
  // paid — a guaranteed failure — to match the CLI's resource-cost stance
  // of "lock only on certain unaffordability".
  locked: (p, ctx) => p.min > essenceAmount(ctx),
  render: (p, ctx) =>
    withLockedPrefix(
      `Lose ${p.min}-${p.max} essence (random roll)`,
      p.min > essenceAmount(ctx),
    ),
  apply: (p, _ctx, mut) => {
    const roll = rollIntInclusive(p.min, p.max);
    mut.changeEssence(-roll, "dream_journey:pay_essence_random_range");
  },
};

type PayPercentEssenceParams = { percent: number };
const payPercentEssence: Cost<PayPercentEssenceParams> = {
  id: "pay_percent_essence",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => {
    const choices = [25, 50, 75];
    return { percent: choices[drawInt(draw, "pay_pct:i", 0, choices.length - 1)] };
  },
  cec: (p, ctx) => essenceAmount(ctx) * (p.percent / 100) * STAGE_MULTIPLIER,
  viable: () => true,
  // Percentage-of-current costs are payable trivially at zero essence (lose
  // 50% of zero is zero); never lock.
  locked: () => false,
  render: (p) => `Lose ${p.percent}% of your essence`,
  apply: (p, ctx, mut) => {
    const cost = Math.floor((essenceAmount(ctx) * p.percent) / 100);
    mut.changeEssence(-cost, "dream_journey:pay_percent_essence");
  },
};

type PayAllRemainingParams = Record<string, never>;
const payAllRemainingEssence: Cost<PayAllRemainingParams> = {
  id: "pay_all_remaining_essence",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: (_p, ctx) => essenceAmount(ctx) * STAGE_MULTIPLIER,
  viable: () => true,
  locked: () => false,
  render: () => "Lose all remaining essence",
  apply: (_p, _ctx, mut) => {
    mut.setEssence(0, "dream_journey:pay_all_remaining_essence");
  },
};

type BattleRedFlatParams = { amount: number; battles: number };
const battleRewardReductionFlat: Cost<BattleRedFlatParams> = {
  id: "battle_reward_reduction_flat",
  weight: RARE_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    amount: 10 + 10 * drawInt(draw, "br_flat:a", 0, 4),
    battles: drawInt(draw, "br_flat:b", 1, 3),
  }),
  cec: (p) => p.amount * p.battles,
  viable: () => true,
  locked: () => false,
  render: (p) =>
    `Battle essence rewards are reduced by ${p.amount} for ${nextBattlePhrase(p.battles)}`,
  apply: (p, _ctx, mut) => {
    mut.pushBattleRewardModifier(
      "flat",
      p.amount,
      p.battles,
      "dream_journey:battle_reward_reduction_flat",
    );
  },
};

type BattleRedPctParams = { percent: number; battles: number };
const battleRewardReductionPercent: Cost<BattleRedPctParams> = {
  id: "battle_reward_reduction_percent",
  weight: RARE_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    percent: 10 + 10 * drawInt(draw, "br_pct:a", 0, 4),
    battles: drawInt(draw, "br_pct:b", 1, 3),
  }),
  cec: (p) => p.percent * p.battles * 0.5,
  viable: () => true,
  locked: () => false,
  render: (p) =>
    `Battle essence rewards are reduced by ${p.percent}% for ${nextBattlePhrase(p.battles)}`,
  apply: (p, _ctx, mut) => {
    mut.pushBattleRewardModifier(
      "percent",
      p.percent,
      p.battles,
      "dream_journey:battle_reward_reduction_percent",
    );
  },
};

function rollPredicate(draw: DrawContext, label: string): Predicate {
  return weightedChoice(
    draw,
    label,
    PREDICATES.map((p) => ({ item: p, weight: 1 })),
  );
}

type PurgeNamedCardParams = { cardName: string };
const purgeNamedCard: Cost<PurgeNamedCardParams> = {
  id: "purge_named_card",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "purge_named:c", deckCards).name
        : "Placeholder Card",
    };
  },
  cec: () => CARD_CEC * 0.5,
  // The template purges a specific named card, so viability requires the deck
  // to actually contain a card with that name. Using `deckHasMinSize(ctx, 1)`
  // would surface a no-op option whenever the deck is non-empty but lacks the
  // named card (e.g. after a state transition between rollParams and
  // viable).
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  locked: () => false,
  render: (p) => `Purge ${quoteName(p.cardName)}`,
  apply: (p, ctx, mut) => {
    const entryId = findDeckEntriesByName(ctx, p.cardName)[0];
    if (entryId === undefined) {
      warnSkippedCardApply(
        "purge_named_card",
        `deck entry for card name ${JSON.stringify(p.cardName)} was not found`,
      );
      return;
    }
    mut.removeDeckEntry(entryId, "dream_journey:purge_named_card");
  },
};

type PurgeRandomPredCardParams = { predicateId: string };
const purgeRandomPredicateCard: Cost<PurgeRandomPredCardParams> = {
  id: "purge_random_predicate_card",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_random_pred:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, 1, getPredicate(p.predicateId)),
  // Upgrades the CLI's `cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {})`
  // pattern, which silently resolved over the catalog when the predicate
  // omitted `source`. `deckContainsPredicate` pins `source: "deck"`.
  viable: (p, ctx) => deckContainsPredicate(ctx, p.predicateId),
  locked: () => false,
  render: (p) => `Purge a random ${getPredicate(p.predicateId).text.singular}`,
  apply: (p, ctx, mut) => {
    const entryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "purge_random_predicate_card",
        `no deck entries matched predicate ${JSON.stringify(p.predicateId)}`,
      );
      return;
    }
    const entryId = pickFromList(
      applyDrawContext(ctx),
      "purge_random_predicate_card:entry",
      entryIds,
    );
    mut.removeDeckEntry(entryId, "dream_journey:purge_random_predicate_card");
  },
};

type PurgeChosenPredCardParams = { predicateId: string };
const purgeChosenPredicateCard: Cost<PurgeChosenPredCardParams> = {
  id: "purge_chosen_predicate_card",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ predicateId: rollPredicate(draw, "purge_chosen_pred_c:p").id }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) => deckContainsPredicate(ctx, p.predicateId),
  locked: () => false,
  render: (p) => `Purge a chosen ${getPredicate(p.predicateId).text.singular}`,
  choosePlan: (p, ctx, planning) => {
    if (findDeckEntriesByPredicate(ctx, p.predicateId).length === 0) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { predicateId: p.predicateId },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to purge",
    };
  },
  apply: (_p, ctx, mut, chooserResolution) => {
    const entryId = selectedDeckEntryId(
      "purge_chosen_predicate_card",
      ctx,
      chooserResolution,
      findDeckEntriesByPredicate(ctx, _p.predicateId),
    );
    if (entryId === undefined) return;
    mut.removeDeckEntry(entryId, "dream_journey:purge_chosen_predicate_card");
  },
};

type GainRandomFromPoolParams = { count: number };
const gainRandomCardsFromPool: Cost<GainRandomFromPoolParams> = {
  id: "gain_random_cards_from_pool",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "gain_random_pool:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.4 * p.count,
  // Gains from the card pool consult the content catalog rather than deck
  // state, so they remain viable on an empty quest. Lock-status is not
  // meaningful (the player does not "pay" anything from current state).
  viable: () => true,
  locked: () => false,
  render: (p) => `Gain ${p.count} random card${p.count === 1 ? "" : "s"} from the card pool`,
  apply: (p, ctx, mut) => {
    const allCatalogCards = cardMatches(ctx, {});
    const cardIds = pickUniqueCardIds(
      applyDrawContext(ctx),
      "gain_random_cards_from_pool:card",
      allCatalogCards,
      p.count,
    );
    if (cardIds.length < p.count) {
      warnSkippedCardApply(
        "gain_random_cards_from_pool",
        `only ${cardIds.length} catalog cards available for count=${p.count}`,
      );
    }
    for (const cardId of cardIds) {
      mut.addCardById(cardId, "dream_journey:gain_random_cards_from_pool");
    }
  },
};

type TransformCardToRandomParams = { cardName: string };
const transformCardToRandomPool: Cost<TransformCardToRandomParams> = {
  id: "transform_card_to_random_pool",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "xform_random:c", deckCards).name
        : "Placeholder Card",
    };
  },
  cec: () => CARD_CEC * 0.5,
  // The chosen card is named by params; viability requires the deck to
  // contain a card with that name. `deckHasMinSize(ctx, 1)` would surface a
  // no-op option whenever the deck holds different cards.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  locked: () => false,
  render: (p) => `Transform ${quoteName(p.cardName)} into a random card from the pool`,
  apply: (p, ctx, mut) => {
    const entryId = findFirstDeckEntryIdByCardName(ctx, p.cardName);
    if (entryId === undefined) {
      warnSkippedCardApply(
        "transform_card_to_random_pool",
        `deck entry for card name ${JSON.stringify(p.cardName)} was not found`,
      );
      return;
    }
    const allCatalogCards = cardMatches(ctx, {});
    const cardId = pickUniqueCardIds(
      applyDrawContext(ctx),
      "transform_card_to_random_pool:card",
      allCatalogCards,
      1,
    )[0];
    if (cardId === undefined) {
      warnSkippedCardApply("transform_card_to_random_pool", "catalog card pool is empty");
      return;
    }
    mut.removeDeckEntry(entryId, "dream_journey:transform_card_to_random_pool");
    mut.addCardById(cardId, "dream_journey:transform_card_to_random_pool");
  },
};

type PurgeAllDuplicatesParams = Record<string, never>;
const purgeAllDuplicateCards: Cost<PurgeAllDuplicatesParams> = {
  id: "purge_all_duplicate_cards",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.5,
  // The CLI shipped `deck.summary.totalCards >= 2`, which is true for any
  // deck with at least two *different* cards. A purge_all_duplicates
  // template with no duplicates would offer a no-op cost; pin to an actual
  // duplicate stack instead.
  viable: (_p, ctx) => deckHasDuplicateStack(ctx),
  locked: () => false,
  render: () => "Purge all duplicate cards from your deck",
  apply: (_p, ctx, mut) => {
    let removed = 0;
    for (const entry of ctx.state.quest.deck.entries) {
      const entryIds = entry.entryIds ?? [];
      for (const entryId of entryIds.slice(1)) {
        mut.removeDeckEntry(entryId, "dream_journey:purge_all_duplicate_cards");
        removed += 1;
      }
    }
    if (removed === 0) {
      warnSkippedCardApply(
        "purge_all_duplicate_cards",
        "no duplicate deck entry ids were available",
      );
    }
  },
};

const DREAMSIGN_CEC = 80;
const RANDOM_DREAMSIGN_PURGE_CEC = 200;
const UNKNOWN_DREAMSIGN_NAME = "Unknown Dreamsign";

function activeDreamsignDisplayName(ctx: JourneyContext, dreamsignId: string): string {
  return ctx.content.dreamsigns.find((dreamsign) => dreamsign.id === dreamsignId)?.name
    ?? UNKNOWN_DREAMSIGN_NAME;
}

// Resolve a Dreamsign `name` against the player's active-dreamsign list,
// returning the active-list index of the first match (which is the index
// `JourneyMutations.removeDreamsign` expects). Returns `-1` when no active
// dreamsign carries the requested name, so the caller can warn and skip.
function findActiveDreamsignIndexByName(
  ctx: JourneyContext,
  name: string,
): number {
  const nameById = new Map(
    ctx.content.dreamsigns.map((dreamsign) => [dreamsign.id, dreamsign.name]),
  );
  return ctx.state.quest.activeDreamsigns.findIndex(
    (entry) => nameById.get(entry.dreamsignId) === name,
  );
}

type PurgeNamedDreamsignParams = { name: string };
const purgeNamedDreamsign: Cost<PurgeNamedDreamsignParams> = {
  id: "purge_named_dreamsign",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (ctx, draw) => {
    const pool = ctx.state.quest.activeDreamsigns;
    return {
      name: pool.length > 0
        ? activeDreamsignDisplayName(ctx, pickFromList(draw, "purge_named_ds:c", pool).dreamsignId)
        : "Placeholder Dreamsign",
    };
  },
  cec: () => DREAMSIGN_CEC * 0.6,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  locked: () => false,
  render: (p) => `Purge ${quoteName(p.name)}`,
  apply: (p, ctx, mut) => {
    const index = findActiveDreamsignIndexByName(ctx, p.name);
    if (index < 0) {
      console.warn(
        `[dream-journey] purge_named_dreamsign: no active dreamsign matches name '${p.name}'`,
      );
      return;
    }
    mut.removeDreamsign(index, "dream_journey:purge_named_dreamsign");
  },
};

type PurgeRandomDreamsignParams = Record<string, never>;
const purgeRandomDreamsign: Cost<PurgeRandomDreamsignParams> = {
  id: "purge_random_dreamsign",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: () => RANDOM_DREAMSIGN_PURGE_CEC,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  locked: () => false,
  render: () => "Purge a random Dreamsign",
  apply: (_p, ctx, mut) => {
    const count = ctx.state.quest.activeDreamsigns.length;
    if (count === 0) {
      console.warn(
        "[dream-journey] purge_random_dreamsign: no active dreamsigns to purge",
      );
      return;
    }
    const index = drawInt(
      applyDrawContext(ctx),
      "purge_random_dreamsign:index",
      0,
      count - 1,
    );
    mut.removeDreamsign(index, "dream_journey:purge_random_dreamsign");
  },
};

type PurgeChosenDreamsignParams = Record<string, never>;
const purgeChosenDreamsign: Cost<PurgeChosenDreamsignParams> = {
  id: "purge_chosen_dreamsign",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.7,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  locked: () => false,
  render: () => "Purge a chosen Dreamsign",
  choosePlan: (_p, ctx, planning) => {
    if (ctx.state.quest.activeDreamsigns.length === 0) return undefined;
    return {
      kind: "dreamsign",
      requestId: planning.requestIdForSlot(0),
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to purge",
    };
  },
  apply: (_p, ctx, mut, chooserResolution) => {
    const index = selectedDreamsignIndex(
      "purge_chosen_dreamsign",
      ctx,
      chooserResolution,
    );
    if (index === undefined) return;
    mut.removeDreamsign(index, "dream_journey:purge_chosen_dreamsign");
  },
};

type XformDreamsignParams = Record<string, never>;
const transformDreamsignToRandom: Cost<XformDreamsignParams> = {
  id: "transform_dreamsign_to_random",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.4,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1 && poolDreamsignsById(ctx).length >= 1,
  locked: () => false,
  render: () => "Transform a chosen dreamsign into a random dreamsign",
  choosePlan: (_p, ctx, planning) => {
    if (ctx.state.quest.activeDreamsigns.length === 0) return undefined;
    return {
      kind: "dreamsign",
      requestId: planning.requestIdForSlot(0),
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to transform",
    };
  },
  apply: (_p, ctx, mut, chooserResolution) => {
    const index = selectedDreamsignIndex(
      "transform_dreamsign_to_random",
      ctx,
      chooserResolution,
    );
    if (index === undefined) return;

    const pool = poolDreamsignsById(ctx);
    if (pool.length === 0) {
      warnSkippedDreamsignApply("transform_dreamsign_to_random", "dreamsign pool is empty");
      return;
    }

    const source = pickFromList(
      applyDrawContext(ctx),
      "transform_dreamsign_to_random:dreamsign",
      pool,
    );
    mut.removeDreamsign(index, "dream_journey:transform_dreamsign_to_random");
    mut.addDreamsign(
      projectDreamsignForApply(source),
      "dream_journey:transform_dreamsign_to_random",
    );
  },
};

type GainRandomBanesParams = { count: number };
const gainRandomBanes: Cost<GainRandomBanesParams> = {
  id: "gain_random_banes",
  weight: BANE_GAIN_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "gain_random_banes:n", 1, 3) }),
  cec: (p) => p.count * 30,
  // Bane-gain costs never lock or vanish: BANE_NAMES is a controlled
  // vocabulary that always has entries, and a player cannot refuse to
  // accept a bane.
  viable: () => true,
  locked: () => false,
  render: (p) => `Gain ${p.count} random bane${p.count === 1 ? "" : "s"}`,
  apply: (p, ctx, mut) => {
    for (let i = 0; i < p.count; i += 1) {
      const baneName = rollBaneName();
      const cardId = resolveBaneCardId(ctx, baneName);
      if (cardId === undefined) {
        console.warn(
          `[dream-journey] gain_random_banes: no content card matches bane name '${baneName}'`,
        );
        continue;
      }
      mut.addBaneCardById(cardId, "dream_journey:gain_random_banes");
    }
  },
};

type GainNamedBanesParams = { baneName: string; count: number };
const gainNamedBanes: Cost<GainNamedBanesParams> = {
  id: "gain_named_banes",
  weight: BANE_GAIN_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    baneName: pickFromList(draw, "gain_named_banes:b", BANE_NAMES),
    count: drawInt(draw, "gain_named_banes:n", 1, 3),
  }),
  cec: (p) => p.count * 30,
  viable: () => true,
  locked: () => false,
  render: (p) => `Gain ${p.count} ${quoteName(p.baneName)}`,
  apply: (p, ctx, mut) => {
    for (let i = 0; i < p.count; i += 1) {
      const cardId = resolveBaneCardId(ctx, p.baneName);
      if (cardId === undefined) {
        console.warn(
          `[dream-journey] gain_named_banes: no content card matches bane name '${p.baneName}'`,
        );
        continue;
      }
      mut.addBaneCardById(cardId, "dream_journey:gain_named_banes");
    }
  },
};

type GainNamedBanesXBattlesParams = { baneName: string; count: number; battles: number };
const gainNamedBanesForXBattles: Cost<GainNamedBanesXBattlesParams> = {
  id: "gain_named_banes_for_X_battles",
  weight: BANE_GAIN_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    baneName: pickFromList(draw, "gain_named_banes_t:b", BANE_NAMES),
    count: drawInt(draw, "gain_named_banes_t:n", 1, 2),
    battles: drawInt(draw, "gain_named_banes_t:t", 1, 3),
  }),
  cec: (p) => p.count * 25 * p.battles * 0.5,
  viable: () => true,
  locked: () => false,
  render: (p) =>
    `Gain ${p.count} ${quoteName(p.baneName)} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: (p, _ctx, mut) => {
    // The underlying mutation looks up the bane card by name AND records the
    // battle-window modifier in one reducer; the apply layer is a passthrough.
    mut.pushTemporaryBaneGrant(
      p.baneName,
      p.count,
      p.battles,
      "dream_journey:gain_named_banes_for_X_battles",
    );
  },
};

type GainAdditionalStartersParams = { count: number };
const gainAdditionalStarters: Cost<GainAdditionalStartersParams> = {
  id: "gain_additional_starters",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "extra_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  viable: () => true,
  locked: () => false,
  render: (p) =>
    p.count === 1 ? "Gain a random starter card" : `Gain ${p.count} random starter cards`,
  apply: (p, ctx, mut) => {
    const starterCards = cardMatches(ctx, { rarity: "Starter" });
    const cardIds = pickUniqueCardIds(
      applyDrawContext(ctx),
      "gain_additional_starters:card",
      starterCards,
      p.count,
    );
    if (cardIds.length < p.count) {
      warnSkippedCardApply(
        "gain_additional_starters",
        `only ${cardIds.length} starter cards available for count=${p.count}`,
      );
    }
    for (const cardId of cardIds) {
      mut.addCardById(cardId, "dream_journey:gain_additional_starters");
    }
  },
};

type StartingDreamwellNegParams = { cardName: string; battles: number };
const setStartingDreamwellNegative: Cost<StartingDreamwellNegParams> = {
  id: "set_starting_dreamwell_negative",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    cardName: NEGATIVE_DREAMWELL_CARDS.length > 0
      ? pickFromList(draw, "start_dw_neg:c", NEGATIVE_DREAMWELL_CARDS)
      : "Placeholder Dreamwell Card",
    battles: drawInt(draw, "start_dw_neg:b", 1, 3),
  }),
  cec: (p) => 60 * p.battles * 0.5,
  // Dreamwell-keyed templates self-hide until `NEGATIVE_DREAMWELL_CARDS`
  // lands (Task 17). The CLI shipped `() => true`, which would offer a
  // "Placeholder Dreamwell Card" option until content arrived.
  viable: () => NEGATIVE_DREAMWELL_CARDS.length >= 1,
  locked: () => false,
  render: (p) =>
    `Your starting dreamwell card is ${quoteName(p.cardName)} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("set_starting_dreamwell_negative", "dreamwell");
  },
};

type ShuffleNegDreamwellParams = { cardName: string; count: number; battles: number };
const shuffleNegativeDreamwellCards: Cost<ShuffleNegDreamwellParams> = {
  id: "shuffle_negative_dreamwell_cards",
  weight: RARE_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    cardName: NEGATIVE_DREAMWELL_CARDS.length > 0
      ? pickFromList(draw, "shuffle_dw_neg:c", NEGATIVE_DREAMWELL_CARDS)
      : "Placeholder Dreamwell Card",
    count: drawInt(draw, "shuffle_dw_neg:n", 1, 3),
    battles: drawInt(draw, "shuffle_dw_neg:b", 1, 3),
  }),
  cec: (p) => 25 * p.count * p.battles * 0.5,
  viable: () => NEGATIVE_DREAMWELL_CARDS.length >= 1,
  locked: () => false,
  render: (p) =>
    `Shuffle ${p.count} ${quoteName(p.cardName)} into your dreamwell for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("shuffle_negative_dreamwell_cards", "dreamwell");
  },
};

type RemoveTransfigCardParams = { cardName: string };
const removeTransfigurationFromCard: Cost<RemoveTransfigCardParams> = {
  id: "remove_transfiguration_from_card",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "rem_transfig:c", deckCards).name
        : "Placeholder Card",
    };
  },
  cec: () => CARD_CEC * 0.6,
  viable: (p, ctx) => deckContainsTransfiguredCardByName(ctx, p.cardName),
  locked: () => false,
  render: (p) => `Remove the transfiguration from ${quoteName(p.cardName)}`,
  apply: (p, ctx, mut) => {
    const matchingEntryIds = findDeckEntriesByName(ctx, p.cardName);
    const entryId = matchingEntryIds.find((candidate) =>
      findDeckEntryTransfiguration(ctx, candidate) != null
    );
    if (entryId === undefined) {
      warnSkippedCardApply(
        "remove_transfiguration_from_card",
        matchingEntryIds.length === 0
          ? `deck entry for card name ${JSON.stringify(p.cardName)} was not found`
          : `no named deck entries for card name ${JSON.stringify(p.cardName)} have a transfiguration`,
      );
      return;
    }
    mut.transfigureDeckEntry(entryId, null, "dream_journey:remove_transfiguration_from_card");
  },
};

type RemoveTransfigRandomPredParams = { predicateId: string; count: number };
const removeTransfigurationsFromRandomPredicate: Cost<RemoveTransfigRandomPredParams> = {
  id: "remove_transfigurations_from_random_predicate",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "rem_transfig_rand:p").id,
    count: drawInt(draw, "rem_transfig_rand:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.5, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) => deckContainsTransfiguredPredicate(ctx, p.predicateId, p.count),
  locked: () => false,
  render: (p) => {
    const noun = p.count === 1
      ? getPredicate(p.predicateId).text.singular
      : getPredicate(p.predicateId).text.plural;
    return `Remove the transfiguration${p.count === 1 ? "" : "s"} from ${p.count} random ${noun}`;
  },
  apply: (p, ctx, mut) => {
    const entryIds = findDeckEntriesByPredicate(ctx, p.predicateId).filter(
      (entryId) => findDeckEntryTransfiguration(ctx, entryId) != null,
    );
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "remove_transfigurations_from_random_predicate",
        `no deck entries matched predicate ${JSON.stringify(p.predicateId)}`,
      );
      return;
    }
    const pickedEntryIds = pickUniqueDeckEntryIds(
      applyDrawContext(ctx),
      "remove_transfigurations_from_random_predicate:entry",
      entryIds,
      p.count,
    );
    if (pickedEntryIds.length < p.count) {
      warnSkippedCardApply(
        "remove_transfigurations_from_random_predicate",
        `only ${pickedEntryIds.length} deck entries matched predicate ${JSON.stringify(p.predicateId)} for count=${p.count}`,
      );
    }
    for (const entryId of pickedEntryIds) {
      mut.transfigureDeckEntry(
        entryId,
        null,
        "dream_journey:remove_transfigurations_from_random_predicate",
      );
    }
  },
};

type DrawXPurgeChosenParams = { drawCount: number };
const drawXPurgeChosen: Cost<DrawXPurgeChosenParams> = {
  id: "draw_X_purge_chosen",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ drawCount: drawInt(draw, "draw_purge:n", 2, 4) }),
  cec: () => CARD_CEC * 0.6,
  // Inline `deck.summary.totalCards >= p.drawCount` upgraded to the helper.
  viable: (p, ctx) => deckHasMinSize(ctx, p.drawCount),
  locked: () => false,
  render: (p) =>
    `Draw ${p.drawCount} cards from your deck and purge one of them of your choice`,
  choosePlan: (p, ctx, planning) => {
    const entries = projectedDeckEntries(ctx);
    const pickedEntryIds = pickedDrawPurgeEntryIds(ctx, p.drawCount);
    if (pickedEntryIds.length < p.drawCount) return undefined;

    const cardIdByEntryId = new Map(entries.map((entry) => [entry.entryId, entry.card.id]));
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds: pickedEntryIds.flatMap((entryId) => {
        const cardId = cardIdByEntryId.get(entryId);
        return cardId === undefined ? [] : [cardId];
      }),
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a drawn card to purge",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const entryId = resolveDrawPurgeEntryId(ctx, p.drawCount, chooserResolution);
    if (entryId === undefined) return;
    mut.removeDeckEntry(entryId, "dream_journey:draw_X_purge_chosen");
  },
};

type RemoveShopSitesParams = { dreamscapes: number };
const removeShopSitesFromNextDreamscapes: Cost<RemoveShopSitesParams> = {
  id: "remove_shop_sites_from_next_dreamscapes",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ dreamscapes: drawInt(draw, "rm_shop:d", 1, 3) }),
  cec: (p) => 40 * p.dreamscapes,
  viable: () => true,
  locked: () => false,
  render: (p) =>
    `Remove all shop sites from the next ${p.dreamscapes} dreamscape${p.dreamscapes === 1 ? "" : "s"} you visit`,
  apply: (p, _ctx, mut) => {
    mut.removeSiteTypeFromNextDreamscapes(
      "Shop",
      p.dreamscapes,
      "dream_journey:remove_shop_sites_from_next_dreamscapes",
    );
  },
};

type RemoveDsSitesParams = { dreamscapes: number };
const removeDreamsignSitesFromNextDreamscapes: Cost<RemoveDsSitesParams> = {
  id: "remove_dreamsign_sites_from_next_dreamscapes",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ dreamscapes: drawInt(draw, "rm_ds:d", 1, 3) }),
  cec: (p) => 40 * p.dreamscapes,
  viable: () => true,
  locked: () => false,
  render: (p) =>
    `Remove all dreamsign sites from the next ${p.dreamscapes} dreamscape${p.dreamscapes === 1 ? "" : "s"} you visit`,
  apply: (p, _ctx, mut) => {
    mut.removeSiteTypeFromNextDreamscapes(
      "DreamsignOffering",
      p.dreamscapes,
      "dream_journey:remove_dreamsign_sites_from_next_dreamscapes",
    );
  },
};

type LoseMaxEssenceParams = { amount: number };
const loseMaxEssence: Cost<LoseMaxEssenceParams> = {
  id: "lose_max_essence",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (_ctx, draw) => ({ amount: 25 + 25 * drawInt(draw, "lose_max:a", 0, 4) }),
  cec: (p) => p.amount * 1.5 * STAGE_MULTIPLIER,
  // Reclassified as a Resource cost. The CLI surfaced `maxEssence > amount`
  // as `viable`, which silently hid the option when the cap was already at
  // or below the loss amount. Resource costs are always offered and lock
  // when the loss would zero or invert the cap.
  viable: () => true,
  locked: (p, ctx) => p.amount >= maxEssence(ctx),
  render: (p, ctx) => withLockedPrefix(`Lose ${p.amount} maximum essence`, p.amount >= maxEssence(ctx)),
  apply: (p, _ctx, mut) => {
    mut.changeMaxEssence(-p.amount, "dream_journey:lose_max_essence");
  },
};

type MetaPay2Params = {
  subIds: readonly [string, string];
  subParams: readonly [Record<string, unknown>, Record<string, unknown>];
};

type OrderedSpendOperation =
  | { kind: "finite"; amount: number }
  | { kind: "percent"; percent: number }
  | { kind: "exhaust" };

type GuaranteedResourceOperation =
  | ({ resource: "essence" } & OrderedSpendOperation)
  | { resource: "omens"; kind: "finite"; amount: number }
  | ({ resource: "maxEssence" } & OrderedSpendOperation);

type GuaranteedResourceSpend = {
  operations: readonly GuaranteedResourceOperation[];
  essence: readonly OrderedSpendOperation[];
  omens: number;
  maxEssence: readonly OrderedSpendOperation[];
};

type ProjectedResources = {
  essence: number;
  omens: number;
  maxEssence: number;
};

function numericParam(params: Record<string, unknown>, key: string): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function guaranteedResourceSpend(
  costId: string,
  params: Record<string, unknown>,
): GuaranteedResourceSpend {
  const noSpend: GuaranteedResourceSpend = {
    operations: [],
    essence: [],
    omens: 0,
    maxEssence: [],
  };

  switch (costId) {
    case "pay_essence":
      return {
        ...noSpend,
        operations: [{ resource: "essence", kind: "finite", amount: numericParam(params, "x") }],
        essence: [{ kind: "finite", amount: numericParam(params, "x") }],
      };
    case "pay_essence_random_range":
      return {
        ...noSpend,
        operations: [
          { resource: "essence", kind: "finite", amount: numericParam(params, "min") },
        ],
        essence: [{ kind: "finite", amount: numericParam(params, "min") }],
      };
    case "pay_percent_essence":
      return {
        ...noSpend,
        operations: [
          { resource: "essence", kind: "percent", percent: numericParam(params, "percent") },
        ],
        essence: [{ kind: "percent", percent: numericParam(params, "percent") }],
      };
    case "pay_all_remaining_essence":
      return {
        ...noSpend,
        operations: [{ resource: "essence", kind: "exhaust" }],
        essence: [{ kind: "exhaust" }],
      };
    case "pay_omens":
      return {
        ...noSpend,
        operations: [{ resource: "omens", kind: "finite", amount: numericParam(params, "x") }],
        omens: numericParam(params, "x"),
      };
    case "pay_max_essence":
      return {
        ...noSpend,
        operations: [{ resource: "maxEssence", kind: "exhaust" }],
        maxEssence: [{ kind: "exhaust" }],
      };
    case "lose_max_essence":
      return {
        ...noSpend,
        operations: [
          { resource: "maxEssence", kind: "finite", amount: numericParam(params, "amount") },
        ],
        maxEssence: [{ kind: "finite", amount: numericParam(params, "amount") }],
      };
    default:
      return noSpend;
  }
}

function hasOrderedResourceSpend(
  costId: string,
  params: Record<string, unknown>,
): boolean {
  const spend = guaranteedResourceSpend(costId, params);
  return spend.essence.length > 0 || spend.omens !== 0 || spend.maxEssence.length > 0;
}

function addGuaranteedResourceSpend(
  first: GuaranteedResourceSpend,
  second: GuaranteedResourceSpend,
): GuaranteedResourceSpend {
  return {
    operations: [...first.operations, ...second.operations],
    essence: [...first.essence, ...second.essence],
    omens: first.omens + second.omens,
    maxEssence: [...first.maxEssence, ...second.maxEssence],
  };
}

function clampProjectedEssence(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

function projectEssenceDelta(resources: ProjectedResources, delta: number): void {
  resources.essence = clampProjectedEssence(resources.essence + delta, resources.maxEssence);
}

function projectMaxEssenceDelta(resources: ProjectedResources, delta: number): void {
  resources.maxEssence = Math.max(0, resources.maxEssence + delta);
  resources.essence = clampProjectedEssence(resources.essence, resources.maxEssence);
}

function projectEssenceSpendOperation(
  resources: ProjectedResources,
  operation: OrderedSpendOperation,
): void {
  if (operation.kind === "finite") {
    projectEssenceDelta(resources, -operation.amount);
    return;
  }

  if (operation.kind === "percent") {
    resources.essence = clampProjectedEssence(
      resources.essence - Math.floor((resources.essence * operation.percent) / 100),
      resources.maxEssence,
    );
    return;
  }

  resources.essence = 0;
}

function projectMaxEssenceSpendOperation(
  resources: ProjectedResources,
  operation: OrderedSpendOperation,
): void {
  if (operation.kind === "finite") {
    projectMaxEssenceDelta(resources, -operation.amount);
  } else if (operation.kind === "exhaust") {
    projectMaxEssenceDelta(resources, -resources.maxEssence);
  }
}

function guaranteedResourceOperationLocks(
  resources: ProjectedResources,
  operation: GuaranteedResourceOperation,
): boolean {
  if (operation.resource === "essence") {
    if (operation.kind === "finite" && operation.amount > resources.essence) {
      return true;
    }

    projectEssenceSpendOperation(resources, operation);
    return false;
  }

  if (operation.resource === "omens") {
    if (operation.amount > resources.omens) {
      return true;
    }

    resources.omens = Math.max(0, resources.omens - operation.amount);
    return false;
  }

  if (operation.kind === "finite" && operation.amount >= resources.maxEssence) {
    return true;
  }

  projectMaxEssenceSpendOperation(resources, operation);
  return false;
}

function combinedResourceSpendLocks(
  p: MetaPay2Params,
  ctx: JourneyContext,
): boolean {
  const orderedSpend = [
    guaranteedResourceSpend(p.subIds[0], p.subParams[0]),
    guaranteedResourceSpend(p.subIds[1], p.subParams[1]),
  ] as const;
  const spend = addGuaranteedResourceSpend(orderedSpend[0], orderedSpend[1]);
  const resources: ProjectedResources = {
    essence: essenceAmount(ctx),
    omens: omenAmount(ctx),
    maxEssence: maxEssence(ctx),
  };

  return spend.operations.some((operation) => guaranteedResourceOperationLocks(resources, operation));
}

function contextWithProjectedResources(
  ctx: JourneyContext,
  resources: ProjectedResources,
): JourneyContext {
  return {
    ...ctx,
    state: {
      ...ctx.state,
      quest: {
        ...ctx.state.quest,
        resources: {
          ...ctx.state.quest.resources,
          essence: resources.essence,
          omens: resources.omens,
          maxEssence: resources.maxEssence,
        },
      },
    },
  };
}

function projectResourceMutations(
  mut: JourneyMutations,
  resources: ProjectedResources,
): JourneyMutations {
  return {
    ...mut,
    changeEssence: (delta, source) => {
      mut.changeEssence(delta, source);
      projectEssenceDelta(resources, delta);
    },
    changeOmens: (delta, source) => {
      mut.changeOmens(delta, source);
      resources.omens = Math.max(0, resources.omens + delta);
    },
    setEssence: (value, source) => {
      mut.setEssence(value, source);
      resources.essence = clampProjectedEssence(value, resources.maxEssence);
    },
    changeMaxEssence: (delta, source) => {
      mut.changeMaxEssence(delta, source);
      projectMaxEssenceDelta(resources, delta);
    },
  };
}

function applyMetaSubCost(
  cost: Cost,
  costId: string,
  params: Record<string, unknown>,
  ctx: JourneyContext,
  mut: JourneyMutations,
  resources: ProjectedResources,
): void {
  if (!hasOrderedResourceSpend(costId, params)) {
    cost.apply(params, ctx, mut);
    return;
  }

  const projectedCtx = contextWithProjectedResources(ctx, resources);
  const projectedMut = projectResourceMutations(mut, resources);
  cost.apply(params, projectedCtx, projectedMut);
}

function nonMetaCosts(): readonly Cost[] {
  return COSTS.filter((c) => !c.id.startsWith("meta_"));
}

const LOCKED_PREFIX = "[LOCKED] ";

function stripLockedPrefix(s: string): string {
  return s.startsWith(LOCKED_PREFIX) ? s.slice(LOCKED_PREFIX.length) : s;
}

const metaPay2Costs: Cost<MetaPay2Params> = {
  id: "meta_pay_2_costs",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: (ctx, draw) => {
    const pool = nonMetaCosts();
    const firstIndex = drawInt(draw, "meta_pay_2:i1", 0, pool.length - 1);
    let secondIndex = drawInt(draw, "meta_pay_2:i2", 0, pool.length - 2);
    if (secondIndex >= firstIndex) secondIndex += 1;
    const first = pool[firstIndex];
    const second = pool[secondIndex];
    return {
      subIds: [first.id, second.id] as readonly [string, string],
      subParams: [
        first.rollParams(ctx, {
          ...draw,
          selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 1,
        }) as Record<string, unknown>,
        second.rollParams(ctx, {
          ...draw,
          selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 2,
        }) as Record<string, unknown>,
      ] as readonly [Record<string, unknown>, Record<string, unknown>],
    };
  },
  cec: (p, ctx) => {
    const a = getCost(p.subIds[0]);
    const b = getCost(p.subIds[1]);
    return a.cec(p.subParams[0], ctx) + b.cec(p.subParams[1], ctx);
  },
  viable: (p, ctx) => {
    const a = getCost(p.subIds[0]);
    const b = getCost(p.subIds[1]);
    return a.viable(p.subParams[0], ctx) && b.viable(p.subParams[1], ctx);
  },
  locked: (p, ctx) => {
    const a = getCost(p.subIds[0]);
    const b = getCost(p.subIds[1]);
    return a.locked(p.subParams[0], ctx)
      || b.locked(p.subParams[1], ctx)
      || combinedResourceSpendLocks(p, ctx);
  },
  render: (p, ctx) => {
    const a = getCost(p.subIds[0]);
    const b = getCost(p.subIds[1]);
    const aText = a.render(p.subParams[0], ctx);
    const bText = b.render(p.subParams[1], ctx);
    return withLockedPrefix(
      `${stripLockedPrefix(aText)}. ${stripLockedPrefix(bText)}`,
      metaPay2Costs.locked(p, ctx),
    );
  },
  apply: (p, ctx, mut) => {
    const a = getCost(p.subIds[0]);
    const b = getCost(p.subIds[1]);
    const resources: ProjectedResources = {
      essence: essenceAmount(ctx),
      omens: omenAmount(ctx),
      maxEssence: maxEssence(ctx),
    };
    applyMetaSubCost(a, p.subIds[0], p.subParams[0], ctx, mut, resources);
    applyMetaSubCost(b, p.subIds[1], p.subParams[1], ctx, mut, resources);
  },
};

export const COSTS: readonly Cost[] = Object.freeze([
  payEssence,
  payOmens,
  payMaxEssence,
  payEssenceRandomRange,
  payPercentEssence,
  payAllRemainingEssence,
  battleRewardReductionFlat,
  battleRewardReductionPercent,
  purgeNamedCard,
  purgeRandomPredicateCard,
  purgeChosenPredicateCard,
  gainRandomCardsFromPool,
  transformCardToRandomPool,
  purgeAllDuplicateCards,
  purgeNamedDreamsign,
  purgeRandomDreamsign,
  purgeChosenDreamsign,
  transformDreamsignToRandom,
  gainRandomBanes,
  gainNamedBanes,
  gainNamedBanesForXBattles,
  gainAdditionalStarters,
  setStartingDreamwellNegative,
  shuffleNegativeDreamwellCards,
  removeTransfigurationFromCard,
  removeTransfigurationsFromRandomPredicate,
  drawXPurgeChosen,
  removeShopSitesFromNextDreamscapes,
  removeDreamsignSitesFromNextDreamscapes,
  loseMaxEssence,
  metaPay2Costs,
] as readonly Cost[]);

const BY_ID = new Map(COSTS.map((c) => [c.id, c]));

export function getCost(id: string): Cost {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown cost template id: ${id}`);
  return found;
}

/**
 * Lookup variant that returns `undefined` for unknown ids rather than
 * throwing. The apply dispatch loop uses this to surface a `console.warn` and
 * continue processing the remaining envelopes when an envelope references a
 * templateId the catalog does not contain.
 */
export function findCost(id: string): Cost | undefined {
  return BY_ID.get(id);
}
