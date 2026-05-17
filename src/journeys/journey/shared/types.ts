// Shared template scaffolding.
//
// Reward and Cost are the polymorphic shape every cost and reward template
// implements. Predicate is the structural type the predicate table uses.
// Both Reward and Cost templates are parameterised by a TemplateParams record
// produced by rollParams; the rest of the template surface (cec, viable,
// render) consumes those params alongside the journey context.

import type { JourneyContext } from "../context";
import type { DrawContext } from "../../util/rng";
import type { CardTargetPredicate } from "../effects";
import type { JourneyMutations } from "../../apply/JourneyMutations";
import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";

export type TemplateParams = Record<string, unknown>;

export type Reward<P extends TemplateParams = TemplateParams> = {
  readonly id: string;
  readonly weight: number;
  rollParams(ctx: JourneyContext, draw: DrawContext): P;
  cec(params: P, ctx: JourneyContext): number;
  viable(params: P, ctx: JourneyContext): boolean;
  render(params: P, ctx: JourneyContext): string;
  choosePlan?(params: P, ctx: JourneyContext): ChooserRequest | undefined;
  // The 4th `chooserResolution` parameter is reserved for Wave 2 chosen-target
  // templates. The Wave 1 dispatch loop always passes `undefined`; concrete
  // resolution shapes land in `apply/chooserPlan.ts` alongside Task 20.
  apply(
    params: P,
    ctx: JourneyContext,
    mut: JourneyMutations,
    chooserResolution?: ChooserResolution,
  ): void;
};

// A `Cost` extends `Reward` with a structural `locked` predicate. The CLI
// inferred lock state from a `[LOCKED]` text prefix on the rendered string;
// the port keeps that prefix (via `withLockedPrefix` inside `render`) and
// surfaces the same boolean directly so assembly code can write it to
// `JourneyOption.locked` without parsing rendered text. A cost is "locked"
// when the player cannot pay it from current state (e.g. essence cost
// exceeds current essence). Templates that never lock (battle/shop/route
// modifiers, bane gains, etc.) return `false` from `locked`.
export type Cost<P extends TemplateParams = TemplateParams> = Reward<P> & {
  locked(params: P, ctx: JourneyContext): boolean;
};

// Predicate categories. Random-gain rewards (e.g. "Gain N random <plural>")
// restrict themselves to `ability` and `card-type` predicates because grants
// keyed off raw cost/spark buckets ("Gain 3 random cards with cost 2 or less")
// are not meaningful as a player reward; drafts may still target every kind.
export type PredicateKind = "ability" | "card-type" | "stat-bucket";

export type Predicate = {
  readonly id: string;
  readonly kind: PredicateKind;
  readonly multiplier: number;
  // Required. Every entry in the predicate table must supply a card filter;
  // the property test in `predicates.test.ts` branches on this presence, and
  // making it optional would let a future row silently bypass the test.
  readonly cardPredicate: CardTargetPredicate;
  readonly text: { readonly singular: string; readonly plural: string };
};
