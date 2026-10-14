import type { CharacterRef } from "../../dsl/types";
import type { ChooseSlotPrompt } from "../../prompts/types";
import { legalRepositionSlots } from "../../rules/reposition";
import { reposition } from "../../steps/kinds/reposition";
import { occupant, setOccupant, slotOf } from "../../rules/zones";
import type { Slot } from "../../state/ids";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/** Move a character within its controller's battlefield, preserving its state. */
export interface MoveNode {
  readonly op: "move";
  readonly subject: CharacterRef;
  /** Empty position, an abandoned cost's position, or the normal repositioning position rules. */
  readonly to: "unoccupied" | "abandonedCost" | "reposition";
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
      if (node.to === "reposition") {
        const slots = legalRepositionSlots(state, id);
        if (slots.length === 0) continue;
        const index = ctx.choose<ChooseSlotPrompt>({
          kind: "chooseSlot", side: env.controller, purpose: env.purpose("move"), fieldSide: side, slots,
        });
        const to = slots[index];
        if (to !== undefined && legalRepositionSlots(state, id).some((slot) => slot.rank === to.rank && slot.index === to.index)) {
          reposition.run(ctx, { kind: "reposition", card: id, to });
        }
        continue;
      }
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
          kind: "chooseSlot", side: env.controller, purpose: env.purpose("move"), fieldSide: side, slots,
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
