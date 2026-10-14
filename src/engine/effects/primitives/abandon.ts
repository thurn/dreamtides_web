import { matchingCharacters, resolvePlayer } from "../../dsl/selectors";
import type { CharacterSelector, PlayerRef } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { abandonCharacter } from "../../rules/costs";
import { resolvingSourceSpark, resolvingSourceCounters } from "../interpreter";
import { definePrimitive } from "../types";

/** A player chooses one character they control to abandon as the effect resolves; the choice does not target. */
export interface AbandonNode {
  readonly op: "abandon";
  readonly chooser: PlayerRef;
  readonly predicate: Omit<CharacterSelector, "controller">;
}

export const abandonPrimitive = definePrimitive<AbandonNode>({
  op: "abandon",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.chooser);
    const candidates = matchingCharacters(
      ctx.state, ctx.catalog, { ...node.predicate, controller: "you" }, side, env.source, env.x ?? undefined, resolvingSourceSpark(ctx, env), resolvingSourceCounters(ctx, env),
    );
    if (candidates.length === 0) return;
    const [chosen] = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: env.purpose("abandon"),
      candidates,
      min: 1,
      max: 1,
    });
    if (chosen === undefined) throw new Error("abandon answered with no character");
    abandonCharacter(ctx, side, chosen);
  },
});

/** Abandon one matching character controlled by `chooser`, relative to the effect's controller. */
export function abandon(chooser: PlayerRef = "you", predicate: Omit<CharacterSelector, "controller"> = {}): AbandonNode {
  return { op: "abandon", chooser, predicate };
}
