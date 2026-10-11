import type { CharacterRef } from "../../dsl/types";
import type { ChooseSlotPrompt } from "../../prompts/types";
import { occupant, setOccupant, slotOf } from "../../rules/zones";
import type { Slot } from "../../state/ids";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/** Move a character within its controller's battlefield, preserving its state. */
export interface MoveNode {
  readonly op: "move";
  readonly subject: CharacterRef;
  /** Choose an empty position, or use the position of the character abandoned for this activation. */
  readonly to: "unoccupied" | "abandonedCost";
}

export const movePrimitive = definePrimitive<MoveNode>({
  op: "move",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    const { state } = ctx;
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      const instance = state.instances[id];
      const from = slotOf(state, id);
      if (instance?.zone !== "play" || from === null) continue;
      const side = instance.controller;
      let to: Slot | undefined;
      if (node.to === "abandonedCost") {
        const paid = env.abandonedPosition;
        if (paid === null || paid.side !== side) continue;
        to = paid.slot;
      } else {
        const slots: Slot[] = (["back", "front"] as const).flatMap((rank) =>
          (rank === "back" ? state.sides[side].backRank : state.sides[side].frontRank)
            .flatMap((card, index) => card === null ? [{ rank, index }] : []),
        );
        if (slots.length === 0) continue;
        const index = ctx.choose<ChooseSlotPrompt>({
          kind: "chooseSlot", side: env.controller, purpose: env.purpose("move"), slots,
        });
        to = slots[index];
      }
      if (to === undefined || occupant(state, side, to) !== null) continue;
      setOccupant(state, side, from, null);
      setOccupant(state, side, to, id);
      ctx.emit({ kind: "repositioned", instance: id, side, from, to, swappedWith: null });
    }
  },
});

export function move(subject: CharacterRef, options: { readonly to?: MoveNode["to"] } = {}): MoveNode {
  return { op: "move", subject, to: options.to ?? "unoccupied" };
}
