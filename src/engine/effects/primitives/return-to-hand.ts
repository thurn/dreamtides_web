import type { CharacterRef, StackTargetSpec } from "../../dsl/types";
import { instanceOf, moveToHand, returnToHand as returnCharacter } from "../../rules/zones";
import { opponent } from "../../state/ids";
import { resolveCharacters, resolveStackTargets } from "../interpreter";
import { cardTarget, characterTarget, definePrimitive } from "../types";

/** An ordinary character return, or a targeted played card with a named hand. */
export type ReturnToHandNode = {
  readonly op: "returnToHand";
  readonly subject: CharacterRef;
  readonly toOpponentHand?: never;
} | {
  readonly op: "returnToHand";
  readonly subject: StackTargetSpec;
  readonly toOpponentHand?: true;
};

export const returnToHandPrimitive = definePrimitive<ReturnToHandNode>({
  op: "returnToHand",
  targets: (node) => node.subject.kind === "stackTarget" ? cardTarget(node.subject) : characterTarget(node.subject),
  resolve(ctx, node, env) {
    if (node.subject.kind === "stackTarget") {
      for (const id of resolveStackTargets(ctx, node.subject, env)) {
        if (node.toOpponentHand !== true) {
          returnCharacter(ctx, id, env.controller);
          continue;
        }
        const previousController = instanceOf(ctx.state, id).controller;
        const recipient = opponent(env.controller);
        const destination = moveToHand(ctx, id, recipient);
        if (destination === "hand") ctx.emit({ kind: "returnedToHand", instance: id, side: recipient });
        if (destination === "banished") ctx.emit({ kind: "banished", instance: id, side: previousController });
      }
      return;
    }
    for (const id of resolveCharacters(ctx, node.subject, env)) returnCharacter(ctx, id, env.controller);
  },
});

/** Unnamed returns go to the owner; an explicit opponent hand belongs to the effect's opponent. */
export function returnToHand(subject: CharacterRef): ReturnToHandNode;
export function returnToHand(subject: StackTargetSpec, options?: { readonly toOpponentHand?: true }): ReturnToHandNode;
export function returnToHand(subject: CharacterRef | StackTargetSpec, options: { readonly toOpponentHand?: true } = {}): ReturnToHandNode {
  return subject.kind === "stackTarget"
    ? { op: "returnToHand", subject, ...(options.toOpponentHand === true ? { toOpponentHand: true } : {}) }
    : { op: "returnToHand", subject };
}
