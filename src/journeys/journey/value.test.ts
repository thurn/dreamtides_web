// Value model property test.
//
// Builds 20 hand-built `JourneyOption` records spanning the three journey
// stages and a representative mix of cost/reward/burden/uncertainty operation
// shapes. For each option the test asserts:
//
//   1. Every CEC component returned by `evaluateOptionValue`
//      (`cost`, `effect`, `burden`, `uncertainty`, `net`) is a finite
//      number — strictly: not NaN, not +/-Infinity.
//   2. `net` equals `effect - cost + burden + uncertainty` to within a small
//      floating-point tolerance.
//
// Bug class guarded against: silent NaN propagation, sign flip in the
// aggregator, or a missing component (e.g. dropping uncertainty from the sum).
// One property test instead of per-effect-family assertions.
//
// Note on signs: in this value model `burden` operations carry already-signed
// negative values (e.g. a Nightmare gain is -125). The aggregator therefore
// adds burden to the net rather than subtracting; the formula above matches
// `evaluateOptionValue` in `./value`.

import { describe, expect, it } from "vitest";

import type {
  BurdenOperation,
  CostOperation,
  JourneyOperation,
  JourneyOption,
  JourneyStage,
  RewardOperation,
} from "./manifest";
import { makeUnlockedOption } from "./manifest";
import { evaluateOptionValue } from "./value";

const TOLERANCE = 1e-9;

const STAGES: readonly JourneyStage[] = ["early", "mid", "late"];

type RewardKind = RewardOperation["rewardKind"];

const REWARD_KINDS: readonly RewardKind[] = [
  "resource",
  "card_draft",
  "dreamsign_gain",
  "bane_purge",
  "card_gain",
];

function makeCostOperation(
  index: number,
  costAmount: number,
  uncertainty: number,
): CostOperation {
  return {
    operationId: `cost-${index}`,
    role: "cost",
    visibility: "visible",
    operationKind: "cost",
    costKind: "resource",
    resource: "essence",
    amount: costAmount,
    value: {
      convertedEssence: costAmount,
      uncertaintyConvertedEssence: uncertainty,
    },
    payload: {},
  };
}

function makeRewardOperation(
  index: number,
  rewardKind: RewardKind,
  effectAmount: number,
): RewardOperation {
  return {
    operationId: `reward-${index}`,
    role: "reward",
    visibility: "visible",
    operationKind: "reward",
    rewardKind,
    value: {
      convertedEssence: effectAmount,
    },
    payload: {},
  };
}

function makeBurdenOperation(index: number, burdenAmount: number): BurdenOperation {
  return {
    operationId: `burden-${index}`,
    role: "burden",
    visibility: "visible",
    operationKind: "burden",
    burdenKind: "bane_gain",
    value: {
      convertedEssence: burdenAmount,
    },
    payload: {},
  };
}

function makeOption(input: {
  number: number;
  stage: JourneyStage;
  rewardKind: RewardKind;
  costAmount: number;
  effectAmount: number;
  burdenAmount: number;
  uncertainty: number;
}): JourneyOption {
  const operations: JourneyOperation[] = [
    makeCostOperation(input.number, input.costAmount, input.uncertainty),
    makeRewardOperation(input.number, input.rewardKind, input.effectAmount),
    makeBurdenOperation(input.number, input.burdenAmount),
  ];

  return makeUnlockedOption({
    number: input.number,
    symbols: ["reward", "cost", "burden", input.stage],
    text: `Stage ${input.stage} option ${input.number}.`,
    operations,
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: input.costAmount,
    effectConvertedEssence: input.effectAmount,
    burdenConvertedEssence: input.burdenAmount,
    uncertaintyConvertedEssence: input.uncertainty,
    netConvertedEssence:
      input.effectAmount - input.costAmount + input.burdenAmount + input.uncertainty,
    pickBehavior: "record_and_generate_next",
  });
}

/**
 * Builds 20 deterministic options spanning early/mid/late stages and a mix of
 * reward kinds. Combinations are chosen so cost/effect/burden/uncertainty
 * magnitudes vary across options (no two options share the exact tuple).
 */
function buildFixtureOptions(): JourneyOption[] {
  const options: JourneyOption[] = [];
  let optionNumber = 1;

  for (let i = 0; i < 20; i += 1) {
    const stage = STAGES[i % STAGES.length];
    const rewardKind = REWARD_KINDS[i % REWARD_KINDS.length];
    const costAmount = (i + 1) * 10;
    const effectAmount = (i + 2) * 25;
    // Burdens carry negative values in this model.
    const burdenAmount = i % 2 === 0 ? -((i + 1) * 15) : 0;
    const uncertainty = i % 3 === 0 ? -((i % 4) + 1) * 5 : 0;

    options.push(
      makeOption({
        number: optionNumber,
        stage,
        rewardKind,
        costAmount,
        effectAmount,
        burdenAmount,
        uncertainty,
      }),
    );
    optionNumber += 1;
  }

  return options;
}

describe("evaluateOptionValue", () => {
  it("returns finite numeric components and a net equal to effect - cost + burden + uncertainty for every fixture option", () => {
    const options = buildFixtureOptions();
    expect(options).toHaveLength(20);

    // Sanity: fixture actually spans all three stages.
    const stagesSeen = new Set(
      options.flatMap((option) =>
        option.symbols.filter((symbol): symbol is JourneyStage =>
          symbol === "early" || symbol === "mid" || symbol === "late",
        ),
      ),
    );
    expect(stagesSeen).toEqual(new Set(STAGES));

    for (const option of options) {
      const breakdown = evaluateOptionValue(option);

      expect(Number.isFinite(breakdown.cost)).toBe(true);
      expect(Number.isFinite(breakdown.effect)).toBe(true);
      expect(Number.isFinite(breakdown.burden)).toBe(true);
      expect(Number.isFinite(breakdown.uncertainty)).toBe(true);
      expect(Number.isFinite(breakdown.net)).toBe(true);

      const expectedNet =
        breakdown.effect - breakdown.cost + breakdown.burden + breakdown.uncertainty;
      expect(Math.abs(breakdown.net - expectedNet)).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});
