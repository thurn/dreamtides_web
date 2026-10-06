import { characterYouControl, target } from "../../dsl/builders";
import { onMaterialized, triggered } from "../../dsl/triggers";
import type { TargetSpec, TriggeredAbility } from "../../dsl/types";
import { occupant, returnToHand, setOccupant, slotOf } from "../../rules/zones";
import { sourceInstance } from "../../state/ids";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * Phasing's effect (rules § Keywords and Effects → Phasing): return another
 * character you control to hand, then move this character to that
 * character's position, through the normal return-to-hand and repositioning
 * tools. The move happens only while this character is in play on the same
 * side and the position is open.
 */
export interface PhaseNode {
  readonly op: "phase";
  readonly subject: TargetSpec;
}

export const phasePrimitive = definePrimitive<PhaseNode>({
  op: "phase",
  targets: (node) => [node.subject],
  resolve(ctx, node, env) {
    const { state } = ctx;
    const self = sourceInstance(env.source);
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      const side = state.instances[id]?.controller;
      const to = slotOf(state, id);
      returnToHand(ctx, id);
      const mover = self === null ? undefined : state.instances[self];
      if (self === null || mover?.zone !== "play" || mover.controller !== side || to === null || side === undefined) continue;
      const from = slotOf(state, self);
      if (from === null || occupant(state, side, to) !== null) continue;
      setOccupant(state, side, from, null);
      setOccupant(state, side, to, self);
      ctx.emit({ kind: "repositioned", instance: self, side, from, to, swappedWith: null });
    }
  },
});

export function phase(subject: TargetSpec): PhaseNode {
  return { op: "phase", subject };
}

/** The Phasing keyword: "▸Materialized: Return another character you control to hand, then move this character to that character's position." */
export function phasing(): TriggeredAbility {
  return triggered(onMaterialized(), phase(target(characterYouControl({ another: true }))));
}
