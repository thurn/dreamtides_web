// Shape plugin type contracts.
//
// Ported from the CLI's `src/journey/shapes/types.ts`. The only structural
// change is `JourneyShapeId`: the CLI declares it as `string`, but here it is
// the explicit string-literal union of the 21 shape ids the registry will
// register once Phase F lands. This pins the canonical id set at the type
// level so `manifest.ts` and downstream callers can rely on exhaustive
// switching without depending on a runtime registry that is still being
// populated.
//
// `ValidationResult` is forward-declared inline because the validate/result
// module has not been ported yet. Future tasks replace the inline union with
// a re-export from `../validate/result`.
//
// Pure module: types only. No I/O. Browser-safe.

import type { JourneyContext } from "../context";
import type { DrawContext } from "../../util/rng";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
  JourneyPresentation,
  JourneyRewardPool,
  JourneyStage,
  JourneySymmetryContractDebug,
  JourneyTree,
  PrecommittedOutcomes,
  SequenceState,
} from "../manifest";

/**
 * Forward declaration for `ValidationResult`. The validate/result module is
 * ported in a later task; this matches the CLI's contract exactly so we can
 * swap to a re-export when the module lands without touching call sites.
 */
export type ValidationResult =
  | { ok: true }
  | { ok: false; rule: string; message: string; debug?: Record<string, unknown> };

/**
 * The canonical string-literal union of every Journey shape id. Pinned here
 * rather than derived from the registry so the type is stable while the
 * registry is being populated in Phase F. Adding or removing a shape id
 * requires touching both this union and the score-weight table; the
 * `scoreWeights.test.ts`/`registry.test.ts` pair pins them in sync.
 */
export type JourneyShapeId =
  | "random_rewards"
  | "random_trades"
  | "one_operation_many_targets"
  | "one_target_many_operations"
  | "same_cost_different_rewards"
  | "same_reward_different_costs"
  | "heterogeneous_pair"
  | "choose_your_loss"
  | "alter_dreamscapes"
  | "flat_escalating_trade"
  | "single_offer"
  | "single_wager"
  | "single_random_outcome"
  | "now_vs_later"
  | "commit_now_future_payoff"
  | "reward_after_trigger"
  | "shop_row"
  | "take_any_number"
  | "push_your_luck"
  | "random_pool_draws"
  | "escalating_reward_chain";

export type JourneyTopology =
  | "direct_menu"
  | "single_offer_refusal"
  | "random_commit"
  | "delayed_hook"
  | "route_edit"
  | "repeatable_menu"
  | "decision_tree";

export type JourneyShapeDefinition = {
  readonly id: JourneyShapeId;
  readonly topology: JourneyTopology;
  readonly rootOptionCount: Readonly<{ min: number; max: number }>;
  readonly supportedTags: readonly string[];
  readonly validationRules: readonly string[];
  readonly debugLabel: string;
  readonly versionContribution: unknown;
  readonly automaticLeave?: boolean;
};

export type ShapeFillArgs = {
  readonly context: JourneyContext;
  readonly drawContext: DrawContext;
  readonly stage: JourneyStage;
  /**
   * Optional shape-specific configuration. Each shape's fill function picks
   * the keys it understands; unknown keys are ignored. Threading config this
   * way avoids polluting the shared args type with shape-specific fields.
   */
  readonly shapeArgs?: Record<string, unknown>;
};

export type FilledJourney = {
  readonly options: JourneyOption[];
  readonly presentation?: JourneyPresentation;
  readonly tree?: JourneyTree;
  readonly rewardPool?: JourneyRewardPool;
  readonly sequence?: SequenceState;
  readonly generatedObjects?: readonly GeneratedObjectDefinition[];
  readonly precommitted: PrecommittedOutcomes;
  readonly symmetryContracts?: readonly JourneySymmetryContractDebug[];
};

export type ShapeValidatorArgs = {
  readonly manifest: JourneyManifest;
  readonly context: JourneyContext;
  readonly definition: JourneyShapeDefinition;
  readonly generatedObjects: readonly GeneratedObjectDefinition[];
};

export type ShapeValidator = {
  readonly ruleId: string;
  readonly passMessage: string;
  readonly validate: (args: ShapeValidatorArgs) => ValidationResult;
};

export type ShapeTreeValidator = (
  manifest: JourneyManifest,
  context: JourneyContext,
  generatedObjects: readonly GeneratedObjectDefinition[],
) => ValidationResult;

export type ShapePrecommitValidator = (
  manifest: JourneyManifest,
) => ValidationResult;

export type JourneyShapePlugin = {
  readonly id: JourneyShapeId;
  readonly definition: JourneyShapeDefinition;
  readonly scoreWeight: number;
  readonly fill: (args: ShapeFillArgs) => FilledJourney;
  readonly validators?: readonly ShapeValidator[];
  readonly treeValidator?: ShapeTreeValidator;
  readonly precommitValidator?: ShapePrecommitValidator;
  readonly generatedObjects?: {
    readonly natural: boolean;
    readonly highWeirdness?: boolean;
  };
  readonly versionContribution?: unknown;
};
