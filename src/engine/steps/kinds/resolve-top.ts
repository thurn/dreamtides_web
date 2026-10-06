import { printedCard } from "../../catalog";
import { eventAbilities } from "../../effects/abilities";
import { resolveEffect, splitChoices } from "../../effects/interpreter";
import { instanceOrigin, originAbilities } from "../../rules/activation";
import { enterPlay, instanceOf, moveInstance, placement } from "../../rules/zones";
import type { AbilityStackItem, CardStackItem } from "../../state/types";
import type { StepContext, StepDefinition } from "../types";

/**
 * Resolves the top item of the stack. A character enters play in the
 * back-rank position it was dropped on if still open, else its controller's
 * leftmost open one; an event goes to its owner's void (a copy or other
 * created card ceases to exist instead); an activated ability applies its
 * effect and leaves the stack.
 * Afterwards the resolved item's controller receives priority if the stack is
 * still non-empty (D13).
 */
export interface ResolveTopStep {
  readonly kind: "resolveTop";
}

function resolveCard(ctx: StepContext, item: CardStackItem): void {
  const { state, catalog } = ctx;
  const instance = instanceOf(state, item.instance);
  const definition = printedCard(catalog, instance.printing);
  ctx.emit({ kind: "resolved", instance: item.instance });
  definition.synthetic?.resolve?.(ctx, item);
  // Each event ability resolves with its own share of the play-time modes and targets.
  const abilities = eventAbilities(definition, instance.variant);
  const choices = splitChoices(abilities.map((ability) => ability.effect), item);
  abilities.forEach((ability, index) => {
    resolveEffect(ctx, ability.effect, {
      source: item.instance,
      origin: instanceOrigin(instance),
      ability: ability.ability,
      controller: item.controller,
      x: item.x,
      optionalPaid: item.optionalPaid,
      choices: choices[index] ?? { modes: [], targets: [] },
    });
  });
  if (definition.cardType === "character") {
    const slot = placement(state, item.controller, item.slot);
    if (slot === null) {
      // Capacity is reserved at play time, so this is unreachable through legal play.
      moveInstance(ctx, item.instance, "void");
    } else {
      // A variable-spark character keeps the X paid for it while in play.
      instance.status.x = item.x;
      enterPlay(ctx, item.instance, item.controller, slot);
    }
  } else {
    moveInstance(ctx, item.instance, "void");
  }
}

/** An ability resolves from the definition captured at activation, even if its source has left play. */
function resolveAbility(ctx: StepContext, item: AbilityStackItem): void {
  ctx.state.stack.pop();
  ctx.emit({ kind: "abilityResolved", side: item.controller, source: item.source, ability: item.ability });
  const ability = originAbilities(ctx.catalog, item.origin)[item.ability];
  if (ability?.kind !== "activated") {
    throw new Error(`Ability ${String(item.ability)} of its origin is not an activated ability`);
  }
  resolveEffect(ctx, ability.effect, {
    source: item.source,
    origin: item.origin,
    ability: item.ability,
    controller: item.controller,
    x: item.x,
    optionalPaid: item.optionalPaid,
    choices: item,
  });
}

export const resolveTop: StepDefinition<ResolveTopStep> = {
  kind: "resolveTop",
  canceller: () => null,
  run(ctx) {
    const { state } = ctx;
    const item = state.stack[state.stack.length - 1];
    if (item === undefined) {
      throw new Error("resolveTop with an empty stack");
    }
    if (item.kind === "card") {
      resolveCard(ctx, item);
    } else {
      resolveAbility(ctx, item);
    }
    state.priority = state.stack.length > 0 ? item.controller : null;
  },
};
