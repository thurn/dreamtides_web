// Shape plugin registry.
//
// Ported from the CLI's `src/journey/shapes/registry.ts`. Three integrity
// checks fire when the module loads:
//
//   1. Plugin ids are unique.
//   2. Every registered plugin's id is present in the score-weight table.
//   3. Every id in the score-weight table is registered (strict coverage).
//
// Check (3) is gated by `STRICT_COVERAGE` below, which auto-derives from the
// registry's length: when `BUILTIN_SHAPE_PLUGINS` contains an entry for every
// id in `shapeScoreWeightIds()`, strict coverage turns on automatically.
//
// Adding a shape is one collocated edit in this file: add an `import { fooPlugin }
// from "./foo"` line at the top of this block, then drop `fooPlugin` into the
// `BUILTIN_SHAPE_PLUGINS` array below. TypeScript flags an unused import if
// you add the import and forget the array entry, so the two stay in lockstep.

import { shapeScoreWeightIds } from "./scoreWeights";
import { cloneSerializable, JOURNEY_SHAPE_CATALOG_VERSION } from "./shared";
import type {
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
} from "./types";

import { alterDreamscapesPlugin } from "./alter_dreamscapes/index";
import { chooseYourLossPlugin } from "./choose_your_loss/index";
import { commitNowFuturePayoffPlugin } from "./commit_now_future_payoff/index";
import { escalatingRewardChainPlugin } from "./escalating_reward_chain/index";
import { flatEscalatingTradePlugin } from "./flat_escalating_trade/index";
import { heterogeneousPairPlugin } from "./heterogeneous_pair/index";
import { nowVsLaterPlugin } from "./now_vs_later/index";
import { oneOperationManyTargetsPlugin } from "./one_operation_many_targets/index";
import { oneTargetManyOperationsPlugin } from "./one_target_many_operations/index";
import { pushYourLuckPlugin } from "./push_your_luck/index";
import { randomPoolDrawsPlugin } from "./random_pool_draws/index";
import { randomRewardsPlugin } from "./random_rewards/index";
import { randomTradesPlugin } from "./random_trades/index";
import { rewardAfterTriggerPlugin } from "./reward_after_trigger/index";
import { sameCostDifferentRewardsPlugin } from "./same_cost_different_rewards/index";
import { sameRewardDifferentCostsPlugin } from "./same_reward_different_costs/index";
import { shopRowPlugin } from "./shop_row/index";
import { singleOfferPlugin } from "./single_offer/index";
import { singleRandomOutcomePlugin } from "./single_random_outcome/index";
import { singleWagerPlugin } from "./single_wager/index";
import { takeAnyNumberPlugin } from "./take_any_number/index";

const BUILTIN_SHAPE_PLUGINS = Object.freeze(
  [
    randomRewardsPlugin,
    randomTradesPlugin,
    oneOperationManyTargetsPlugin,
    oneTargetManyOperationsPlugin,
    sameCostDifferentRewardsPlugin,
    sameRewardDifferentCostsPlugin,
    heterogeneousPairPlugin,
    chooseYourLossPlugin,
    alterDreamscapesPlugin,
    flatEscalatingTradePlugin,
    singleOfferPlugin,
    singleWagerPlugin,
    singleRandomOutcomePlugin,
    nowVsLaterPlugin,
    commitNowFuturePayoffPlugin,
    rewardAfterTriggerPlugin,
    shopRowPlugin,
    takeAnyNumberPlugin,
    pushYourLuckPlugin,
    randomPoolDrawsPlugin,
    escalatingRewardChainPlugin,
  ] satisfies readonly JourneyShapePlugin[],
);

/**
 * `true` once every shape in `shapeScoreWeightIds()` has a registered plugin.
 * When `true`, the module-load integrity check throws if any weighted id is
 * missing from the registry — the bug class we want to pin against
 * shape/score-table drift. The flag is derived automatically from the
 * registry length so it switches on the moment the last plugin lands; there
 * is no manual toggle to forget.
 */
const STRICT_COVERAGE =
  BUILTIN_SHAPE_PLUGINS.length === shapeScoreWeightIds().length;

/**
 * Walks the plugin list and pins the integrity properties listed in the
 * file header. Returns the input array unchanged on success; throws on the
 * first violation with a message naming the offending id.
 *
 * `strictCoverage` controls check (3): when `true`, every id in the
 * score-weight table must be present in `plugins`. The CLI runs this strict,
 * and `STRICT_COVERAGE` above auto-derives to `true` once the registry
 * registers every weighted id.
 */
export function validatePlugins(
  plugins: readonly JourneyShapePlugin[],
  strictCoverage: boolean = STRICT_COVERAGE,
): readonly JourneyShapePlugin[] {
  const seen = new Set<string>();

  for (const plugin of plugins) {
    if (seen.has(plugin.id)) {
      throw new Error(`Duplicate Journey shape IDs in plugin registry: ${plugin.id}`);
    }

    if (plugin.id !== plugin.definition.id) {
      throw new Error(
        `Journey shape plugin '${plugin.id}' definition ID does not match '${plugin.definition.id}'.`,
      );
    }

    seen.add(plugin.id);
  }

  const weightedIds = new Set<string>(shapeScoreWeightIds());

  if (strictCoverage) {
    for (const id of weightedIds) {
      if (!seen.has(id)) {
        throw new Error(
          `Score-weight table references unknown Journey shape '${id}'.`,
        );
      }
    }
  }

  for (const plugin of plugins) {
    if (!weightedIds.has(plugin.id)) {
      throw new Error(
        `Journey shape '${plugin.id}' is missing from the score-weight table.`,
      );
    }
  }

  return plugins;
}

const PLUGINS = validatePlugins(BUILTIN_SHAPE_PLUGINS);
const DEFINITIONS = Object.freeze(
  PLUGINS.map((plugin) => plugin.definition),
);
const PLUGINS_BY_ID = new Map<string, JourneyShapePlugin>(
  PLUGINS.map((plugin) => [plugin.id, plugin]),
);

export function journeyShapePlugins(): readonly JourneyShapePlugin[] {
  return PLUGINS;
}

export function journeyShapeDefinitions(): readonly JourneyShapeDefinition[] {
  return DEFINITIONS;
}

export function getShapePlugin(id: string): JourneyShapePlugin {
  const plugin = PLUGINS_BY_ID.get(id);

  if (!plugin) {
    throw new Error(`Unknown Journey shape ID: ${id}`);
  }

  return plugin;
}

export function getShapeDefinition(id: string): JourneyShapeDefinition {
  return getShapePlugin(id).definition;
}

export function isJourneyShapeId(id: string): id is JourneyShapeId {
  return PLUGINS_BY_ID.has(id);
}

export function canonicalShapeDefinitions(): unknown {
  return {
    catalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
    shapes: PLUGINS.map((plugin) => {
      const definition = plugin.definition;

      return {
        id: definition.id,
        topology: definition.topology,
        rootOptionCount: { ...definition.rootOptionCount },
        supportedTags: [...definition.supportedTags],
        validationRules: [...definition.validationRules],
        debugLabel: definition.debugLabel,
        scoreWeight: plugin.scoreWeight,
        generatedObjects: cloneSerializable(plugin.generatedObjects ?? null),
        versionContribution: cloneSerializable(
          plugin.versionContribution ?? definition.versionContribution,
        ),
      };
    }),
  };
}
