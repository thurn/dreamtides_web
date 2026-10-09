import { definePrimitive } from "../types";

/**
 * "You win the game" as an effect resolves (Terminus: "If you have no cards
 * in your deck, you win the game." is `ifThen(noCardsIn("deck"),
 * winTheGame())`). It claims the win for its controller with a
 * `winConditionMet` event, and the step's state-based victory check (P5)
 * applies the claim alongside score and win conditions in play, so the
 * opponent winning in the same check makes a draw (C15).
 */
export interface WinTheGameNode {
  readonly op: "winTheGame";
}

export const winTheGamePrimitive = definePrimitive<WinTheGameNode>({
  op: "winTheGame",
  resolve(ctx, _node, env) {
    ctx.emit({ kind: "winConditionMet", side: env.controller, sources: [env.source] });
  },
});

export function winTheGame(): WinTheGameNode {
  return { op: "winTheGame" };
}
