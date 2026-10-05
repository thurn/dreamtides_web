import { eventEffects, eventTargetSpecs } from "../../effects/abilities";
import { resolveEffect } from "../../effects/interpreter";
import { enterPlay, instanceOf, leftmostOpenBackSlot, moveInstance } from "../../rules/zones";
import type { StepDefinition } from "../types";

/**
 * Resolves the top item of the stack. A character enters play in its
 * controller's leftmost open back-rank position; an event goes to its owner's
 * void. Afterwards the resolved item's controller receives priority if the
 * stack is still non-empty.
 */
export interface ResolveTopStep {
  readonly kind: "resolveTop";
}

export const resolveTop: StepDefinition<ResolveTopStep> = {
  kind: "resolveTop",
  canceller: () => null,
  run(ctx) {
    const { state, catalog } = ctx;
    const item = state.stack[state.stack.length - 1];
    if (item === undefined) {
      throw new Error("resolveTop with an empty stack");
    }
    const instance = instanceOf(state, item.instance);
    const definition = catalog.card(instance.cardId);
    ctx.emit({ kind: "resolved", instance: item.instance });
    definition.synthetic?.resolve?.(ctx, item);
    // Each event ability resolves with its own slice of the play-time targets.
    const specs = eventTargetSpecs(definition, instance.variant);
    let offset = 0;
    eventEffects(definition, instance.variant).forEach((effect, index) => {
      const count = specs[index]?.length ?? 0;
      resolveEffect(ctx, effect, {
        source: item.instance,
        controller: item.controller,
        variant: instance.variant,
        x: item.x,
        targets: item.targets.slice(offset, offset + count),
      });
      offset += count;
    });
    if (definition.cardType === "character") {
      const slot = leftmostOpenBackSlot(state, item.controller);
      if (slot === null) {
        // Capacity is reserved at play time, so this is unreachable through legal play.
        moveInstance(ctx, item.instance, "void");
      } else {
        enterPlay(ctx, item.instance, item.controller, slot);
      }
    } else {
      moveInstance(ctx, item.instance, "void");
    }
    state.priority = state.stack.length > 0 ? item.controller : null;
  },
};
