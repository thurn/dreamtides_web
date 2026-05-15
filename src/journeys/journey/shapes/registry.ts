// Shape plugin registry.
//
// Ported from the CLI's `src/journey/shapes/registry.ts`. Three integrity
// checks fire when the module loads:
//
//   1. Plugin ids are unique.
//   2. Every registered plugin's id is present in the score-weight table.
//   3. (DEFERRED) Every id in the score-weight table is registered.
//
// Check (3) is gated by `STRICT_COVERAGE` below. The CLI runs it
// unconditionally because all 21 plugins are present; in this port, plugins
// arrive across Tasks 12-15. While the registry is empty (or partial), check
// (3) would fire on every load. Setting `STRICT_COVERAGE = false` keeps
// checks (1) and (2) live and skips (3) until Phase F finishes registering
// every shape, at which point this flag flips back to `true`.
//
// Each plugin import below is commented out; Phase F (Tasks 12-15)
// uncomments each in turn. Once all 21 are uncommented, set
// `STRICT_COVERAGE = true` to re-enable the strict coverage check.

// Phase F plugin imports. Uncomment as each shape is ported.
// import { alterDreamscapesPlugin } from "./alter_dreamscapes";
// import { chooseYourLossPlugin } from "./choose_your_loss";
// import { commitNowFuturePayoffPlugin } from "./commit_now_future_payoff";
// import { escalatingRewardChainPlugin } from "./escalating_reward_chain";
// import { flatEscalatingTradePlugin } from "./flat_escalating_trade";
// import { heterogeneousPairPlugin } from "./heterogeneous_pair";
// import { randomTradesPlugin } from "./random_trades";
// import { nowVsLaterPlugin } from "./now_vs_later";
// import { oneOperationManyTargetsPlugin } from "./one_operation_many_targets";
// import { oneTargetManyOperationsPlugin } from "./one_target_many_operations";
// import { pushYourLuckPlugin } from "./push_your_luck";
// import { randomRewardsPlugin } from "./random_rewards";
// import { randomPoolDrawsPlugin } from "./random_pool_draws";
// import { rewardAfterTriggerPlugin } from "./reward_after_trigger";
// import { sameCostDifferentRewardsPlugin } from "./same_cost_different_rewards";
// import { sameRewardDifferentCostsPlugin } from "./same_reward_different_costs";
// import { shopRowPlugin } from "./shop_row";
// import { singleOfferPlugin } from "./single_offer";
// import { singleRandomOutcomePlugin } from "./single_random_outcome";
// import { singleWagerPlugin } from "./single_wager";
// import { takeAnyNumberPlugin } from "./take_any_number";

import { shapeScoreWeightIds } from "./scoreWeights";
import { cloneSerializable, JOURNEY_SHAPE_CATALOG_VERSION } from "./shared";
import type {
  JourneyShapeDefinition,
  JourneyShapeId,
  JourneyShapePlugin,
} from "./types";

/**
 * Flip to `true` once every shape in `shapeScoreWeightIds()` has a registered
 * plugin (i.e. Phase F has fully landed). When `true`, the module-load
 * integrity check throws if any weighted id is missing from the registry —
 * the bug class we want to pin against shape/score-table drift.
 */
const STRICT_COVERAGE = false;

const BUILTIN_SHAPE_PLUGINS = Object.freeze(
  [
    // Phase F populates this list. Uncomment each entry as the matching
    // plugin import above is uncommented.
    // randomRewardsPlugin,
    // sameCostDifferentRewardsPlugin,
    // sameRewardDifferentCostsPlugin,
    // shopRowPlugin,
    // heterogeneousPairPlugin,
    // randomTradesPlugin,
    // oneTargetManyOperationsPlugin,
    // oneOperationManyTargetsPlugin,
    // chooseYourLossPlugin,
    // singleOfferPlugin,
    // singleWagerPlugin,
    // nowVsLaterPlugin,
    // rewardAfterTriggerPlugin,
    // takeAnyNumberPlugin,
    // pushYourLuckPlugin,
    // randomPoolDrawsPlugin,
    // escalatingRewardChainPlugin,
    // flatEscalatingTradePlugin,
    // singleRandomOutcomePlugin,
    // commitNowFuturePayoffPlugin,
    // alterDreamscapesPlugin,
  ] satisfies readonly JourneyShapePlugin[],
);

/**
 * Walks the plugin list and pins the integrity properties listed in the
 * file header. Returns the input array unchanged on success; throws on the
 * first violation with a message naming the offending id.
 *
 * `strictCoverage` controls check (3): when `true`, every id in the
 * score-weight table must be present in `plugins`. The CLI runs this strict;
 * during Phase F the flag stays `false` so partial registries don't trip the
 * check on every test run.
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
