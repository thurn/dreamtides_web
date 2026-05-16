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
//   - Named-card templates (purge_named_card, transform_card_to_random_pool,
//     remove_transfiguration_from_card) route through
//     `deckContainsCardByName(ctx, p.cardName)`. The chosen card is rolled
//     from the deck, but viability must independently verify the deck still
//     holds a card with that name; otherwise a stale rollParams value would
//     surface a no-op option.
//   - `purge_all_duplicate_cards` gates on `deckHasDuplicateStack`. A deck
//     of N unique cards has no duplicate stack to purge, so the CLI's
//     `totalCards >= 2` smell offered a no-op option.
//   - Deck-size-N templates (draw_X_purge_chosen) route through
//     `deckHasMinSize(ctx, p.drawCount)`.
//   - Predicate-keyed templates (purge_random_predicate_card,
//     purge_chosen_predicate_card, remove_transfigurations_from_random_
//     predicate) route through `deckContainsPredicate` and pin the
//     `source: "deck"` scope, so a predicate that matches catalog-only
//     cards no longer leaks a viable option.
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
//   - `meta_pay_2_costs` ANDs its sub-cost viabilities; the port's compound
//     test pins the [LOCKED]-prefix-exactly-once property.

import type { DrawContext } from "../../util/rng";
import { drawInt, weightedChoice } from "../../util/rng";
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
import { NEGATIVE_DREAMWELL_CARDS } from "./dreamwell";
import { PREDICATES, getPredicate } from "./predicates";
import { quoteName, withLockedPrefix } from "./text";
import type { Cost, Predicate } from "./types";
import {
  deckContainsCardByName,
  deckContainsPredicate,
  deckHasDuplicateStack,
  deckHasMinSize,
} from "./viability";

const MINOR_RANDOM_TRADE_COST_WEIGHT = 1;
const RARE_RANDOM_TRADE_COST_WEIGHT = 0.25;
const RESOURCE_RANDOM_TRADE_COST_WEIGHT = 13;
const BANE_GAIN_RANDOM_TRADE_COST_WEIGHT = 6;

function nextBattlePhrase(battles: number): string {
  return battles === 1 ? "the next battle" : `the next ${battles} battles`;
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
};

const DREAMSIGN_CEC = 80;
const RANDOM_DREAMSIGN_PURGE_CEC = 200;
const UNKNOWN_DREAMSIGN_NAME = "Unknown Dreamsign";

function activeDreamsignDisplayName(ctx: JourneyContext, dreamsignId: string): string {
  return ctx.content.dreamsigns.find((dreamsign) => dreamsign.id === dreamsignId)?.name
    ?? UNKNOWN_DREAMSIGN_NAME;
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
};

type XformDreamsignParams = Record<string, never>;
const transformDreamsignToRandom: Cost<XformDreamsignParams> = {
  id: "transform_dreamsign_to_random",
  weight: MINOR_RANDOM_TRADE_COST_WEIGHT,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 0.4,
  viable: (_p, ctx) => activeDreamsignCount(ctx) >= 1,
  locked: () => false,
  render: () => "Transform a chosen dreamsign into a random dreamsign",
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  // The chosen card is named by params; viability requires the deck to
  // contain a card with that name. The template remains weakly useful (a
  // no-op if the named card has no transfiguration), but at least the named
  // card must actually be in the deck.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  locked: () => false,
  render: (p) => `Remove the transfiguration from ${quoteName(p.cardName)}`,
  apply: () => {},
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
  // Upgrade from the CLI's catalog-leaking `cardMatches(...) >= p.count` to
  // the deck-scoped helper.
  viable: (p, ctx) => deckContainsPredicate(ctx, p.predicateId, p.count),
  locked: () => false,
  render: (p) => {
    const noun = p.count === 1
      ? getPredicate(p.predicateId).text.singular
      : getPredicate(p.predicateId).text.plural;
    return `Remove the transfiguration${p.count === 1 ? "" : "s"} from ${p.count} random ${noun}`;
  },
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
  apply: () => {},
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
    return a.locked(p.subParams[0], ctx) || b.locked(p.subParams[1], ctx);
  },
  render: (p, ctx) => {
    const a = getCost(p.subIds[0]);
    const b = getCost(p.subIds[1]);
    const aText = a.render(p.subParams[0], ctx);
    const bText = b.render(p.subParams[1], ctx);
    const aLocked = a.locked(p.subParams[0], ctx);
    const bLocked = b.locked(p.subParams[1], ctx);
    return withLockedPrefix(
      `${stripLockedPrefix(aText)}. ${stripLockedPrefix(bText)}`,
      aLocked || bLocked,
    );
  },
  apply: () => {},
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
