import { expectTypeOf, it } from "vitest";
import { draw, drawPrimitive } from "../effects/primitives/draw";
import { cardsIn, grantCardKeyword, grantCardKeywordPrimitive } from "../effects/primitives/grant-card-keyword";
import { costModifier, costModifierPrimitive, costModifierNth } from "../effects/primitives/cost-modifier";
import { sparkModifier } from "../effects/primitives/spark-modifier";
import { ruleModifier } from "../effects/primitives/rule-modifier";
import { chooseOne } from "../effects/primitives/choose-one";
import { delayed } from "../effects/primitives/floating-trigger";
import { optional } from "../effects/primitives/optional";
import { sequence } from "../effects/primitives/sequence";
import { definePrimitive, type DualPrimitiveDefinition, type ResolvingPrimitiveDefinition, type StaticPrimitiveDefinition } from "../effects/types";
import { activated, all, characterYouControl, event, staticAbility } from "./builders";
import { onDawn, triggered } from "./triggers";
import type { Ability, ActivatedAbility, StaticAbility, TriggeredAbility } from "./types";

it("preserves primitive capabilities through the declaration and authoring APIs", () => {
  const resolving = definePrimitive(drawPrimitive);
  const live = definePrimitive(grantCardKeywordPrimitive);
  const dual = definePrimitive(costModifierPrimitive);
  expectTypeOf(resolving).toMatchTypeOf<ResolvingPrimitiveDefinition<ReturnType<typeof draw>>>();
  expectTypeOf(live).toMatchTypeOf<StaticPrimitiveDefinition<ReturnType<typeof grantCardKeyword>>>();
  expectTypeOf(dual).toMatchTypeOf<DualPrimitiveDefinition<ReturnType<typeof costModifier>>>();

  const grant = grantCardKeyword(cardsIn("hand"), "offering");
  const spark = sparkModifier(all(characterYouControl()), 1);
  const cost = costModifier("you", {}, -1);
  expectTypeOf(event(draw(1))).toMatchTypeOf<Ability>();
  expectTypeOf(activated([], sequence(spark, cost))).toMatchTypeOf<ActivatedAbility>();
  expectTypeOf(triggered(onDawn(), chooseOne(draw(1), cost))).toMatchTypeOf<TriggeredAbility>();
  expectTypeOf(staticAbility(grant)).toMatchTypeOf<StaticAbility>();
  expectTypeOf(staticAbility(spark)).toMatchTypeOf<StaticAbility>();
  expectTypeOf(staticAbility(cost)).toMatchTypeOf<StaticAbility>();
  expectTypeOf(staticAbility(ruleModifier({ rule: "dawnThreshold", count: 1, effect: draw(1) }))).toMatchTypeOf<StaticAbility>();

  // These are real authoring calls: broadening a consumed boundary makes its directive fail typecheck.
  // @ts-expect-error Draw has resolving capability only.
  staticAbility(draw(1));
  // @ts-expect-error A static-only primitive cannot be an event instruction.
  event(grant);
  // @ts-expect-error Activations require resolving instructions.
  activated([], grant);
  // @ts-expect-error Trigger bodies require resolving instructions.
  triggered(onDawn(), grant);
  // @ts-expect-error Every sequence child must resolve.
  sequence(draw(1), grant);
  // @ts-expect-error Every modal child must resolve.
  chooseOne(draw(1), grant);
  // @ts-expect-error Optional children must resolve.
  optional(grant);
  // @ts-expect-error Retained delayed bodies must resolve.
  delayed(onDawn(), grant);
  // @ts-expect-error A static parent still requires a resolving Dawn child.
  ruleModifier({ rule: "dawnThreshold", count: 1, effect: grant });
  // @ts-expect-error The nth cost modifier is static-only, independently of the dual cost modifier.
  event(costModifierNth("you", {}, 1, { set: 0 }));
  // @ts-expect-error Static declarations require a continuous implementation.
  definePrimitive({ op: "missingContinuous", staticOnly: true });
  // @ts-expect-error A static declaration cannot carry a resolving implementation.
  definePrimitive({ op: "contradictory", staticOnly: true, continuous: { layer: 6, changes: () => [] }, resolve() {} });
});
