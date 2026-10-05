import type { StackItemSelector, StackTargetSpec } from "../../dsl/types";
import type { PayOrDeclinePrompt } from "../../prompts/types";
import { spendEnergy } from "../../rules/resources";
import { preventCard, type PreventDestination } from "../../rules/stack";
import { opponent } from "../../state/ids";
import { resolveStackTargets } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Prevent a card": the chosen card leaves the stack without resolving and
 * goes to its owner's void, or to `destination` for the "put it on top of
 * its owner's deck", "into its owner's hand", and "put that card into your
 * hand" variants. With `unlessPays`,
 * the opponent of the prevent's controller may pay that much ● to keep the
 * card on the stack. Cards that cannot be prevented are never candidates.
 */
export interface PreventNode {
  readonly op: "prevent";
  readonly subject: StackTargetSpec;
  readonly unlessPays: number | null;
  readonly destination: PreventDestination;
}

export const preventPrimitive = definePrimitive<PreventNode>({
  op: "prevent",
  targets: (node) => [node.subject],
  resolve(ctx, node, env) {
    for (const id of resolveStackTargets(ctx, node.subject, env)) {
      if (node.unlessPays !== null) {
        const payer = opponent(env.controller);
        const pays = ctx.choose<PayOrDeclinePrompt>({
          kind: "payOrDecline",
          side: payer,
          purpose: env.purpose("preventUnlessPays"),
          energy: node.unlessPays,
          payable: ctx.state.sides[payer].currentEnergy >= node.unlessPays,
        });
        if (pays) {
          spendEnergy(ctx, payer, node.unlessPays);
          continue;
        }
      }
      preventCard(ctx, id, node.destination, env.controller);
    }
  },
});

/**
 * "Prevent a card on the stack matching `selector`", optionally "unless the
 * opponent pays N●" and with a destination other than the void.
 */
export function prevent(
  selector: StackItemSelector,
  options: { readonly unlessPays?: number; readonly destination?: PreventDestination } = {},
): PreventNode {
  return {
    op: "prevent",
    subject: { kind: "stackTarget", selector: { ...selector, preventable: true } },
    unlessPays: options.unlessPays ?? null,
    destination: options.destination ?? "void",
  };
}
