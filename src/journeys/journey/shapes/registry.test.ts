// Shape registry integrity tests.
//
// Pin two bug classes:
//
//   1. The score-weight table drifting out of sync with the
//      `JourneyShapeId` union. The "21 canonical ids" test asserts the
//      score-weight table lists exactly the 21 ids enumerated in
//      `JourneyShapeId`, with no extras or omissions.
//
//   2. Duplicate ids or definition/plugin id mismatches sneaking into the
//      registry. The validatePlugins tests exercise both branches by
//      feeding synthesized plugin pairs to `validatePlugins` directly.
//
// The "every weighted shape is registered" check (strict-coverage check
// (3) in `registry.ts`) is currently relaxed because Phase F is still
// landing the 21 plugins. The skipped test below pins the intent; flip
// `STRICT_COVERAGE` and remove the `.skip` once every plugin lands.

import { describe, expect, it } from "vitest";

import {
  getShapeScoreWeight,
  shapeScoreWeightIds,
} from "./scoreWeights";
import { defineShapePlugin } from "./shared";
import {
  journeyShapePlugins,
  validatePlugins,
} from "./registry";
import type { JourneyShapeId, JourneyShapePlugin } from "./types";

const CANONICAL_SHAPE_IDS: readonly JourneyShapeId[] = [
  "random_rewards",
  "random_trades",
  "one_operation_many_targets",
  "one_target_many_operations",
  "same_cost_different_rewards",
  "same_reward_different_costs",
  "heterogeneous_pair",
  "choose_your_loss",
  "alter_dreamscapes",
  "flat_escalating_trade",
  "single_offer",
  "single_wager",
  "single_random_outcome",
  "now_vs_later",
  "commit_now_future_payoff",
  "reward_after_trigger",
  "shop_row",
  "take_any_number",
  "push_your_luck",
  "random_pool_draws",
  "escalating_reward_chain",
];

function makeFixturePlugin(id: string, scoreWeight = 1): JourneyShapePlugin {
  return defineShapePlugin({
    definition: {
      id: id as JourneyShapeId,
      topology: "direct_menu",
      rootOptionCount: { min: 1, max: 1 },
      supportedTags: [],
      validationRules: [],
      debugLabel: `fixture:${id}`,
      versionContribution: { fixture: true },
    },
    scoreWeight,
    fill: () => {
      throw new Error(`fixture plugin '${id}' has no fill implementation`);
    },
  });
}

describe("shape registry score-weight coverage", () => {
  it("lists exactly the 21 canonical Journey shape ids", () => {
    const weighted = new Set(shapeScoreWeightIds());

    expect(weighted.size).toBe(CANONICAL_SHAPE_IDS.length);
    for (const id of CANONICAL_SHAPE_IDS) {
      expect(weighted.has(id)).toBe(true);
    }
  });

  it("returns a positive weight for every canonical shape id", () => {
    for (const id of CANONICAL_SHAPE_IDS) {
      expect(getShapeScoreWeight(id)).toBeGreaterThan(0);
    }
  });

  it("throws when looking up an unknown shape id", () => {
    expect(() => getShapeScoreWeight("not_a_real_shape")).toThrow(
      /Missing score weight/,
    );
  });
});

describe("validatePlugins integrity checks", () => {
  it("passes for the registry in its current (Phase F) state", () => {
    expect(() => validatePlugins(journeyShapePlugins())).not.toThrow();
  });

  it("throws on duplicate plugin ids", () => {
    const duplicate: JourneyShapePlugin[] = [
      makeFixturePlugin("random_rewards"),
      makeFixturePlugin("random_rewards"),
    ];

    expect(() => validatePlugins(duplicate)).toThrow(
      /Duplicate Journey shape IDs/,
    );
  });

  it("throws when a plugin references an id missing from the score-weight table", () => {
    const orphan: JourneyShapePlugin[] = [
      makeFixturePlugin("not_a_real_shape", 1),
    ];

    expect(() => validatePlugins(orphan)).toThrow(
      /missing from the score-weight table/,
    );
  });

  it.skip(
    "throws when a weighted shape id has no registered plugin (re-enable once Phase F is complete)",
    () => {
      // Phase F adds the 21 plugins one by one; until every weighted id has a
      // registered plugin, the strict-coverage branch in `validatePlugins`
      // would fire on every load. Flip `STRICT_COVERAGE` in `registry.ts` and
      // remove this `.skip` once the registry contains all 21 entries.
      expect(() => validatePlugins([], true)).toThrow(
        /Score-weight table references unknown Journey shape/,
      );
    },
  );

  it("can be run with strictCoverage=true on a complete fixture registry", () => {
    const complete = CANONICAL_SHAPE_IDS.map((id) => makeFixturePlugin(id));

    expect(() => validatePlugins(complete, true)).not.toThrow();
  });

  it("with strictCoverage=true throws when a weighted shape has no plugin", () => {
    const missingOne = CANONICAL_SHAPE_IDS.slice(1).map((id) =>
      makeFixturePlugin(id),
    );

    expect(() => validatePlugins(missingOne, true)).toThrow(
      /Score-weight table references unknown Journey shape 'random_rewards'/,
    );
  });
});
