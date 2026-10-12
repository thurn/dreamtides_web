import type { ChooseCardsPrompt } from "../../prompts/types";
import { drawCard } from "../../rules/resources";
import { charactersInPlay, returnToHand } from "../../rules/zones";
import { definePrimitive } from "../types";

/**
 * "Return all but one character you control to hand", with `drawForEach`
 * "Draw a card for each character returned" (RD-hv-umm2.499-1,
 * RD-hv-umm2.499-2). As the effect resolves, its controller chooses one
 * character they control to keep; the choice does not target, so a character
 * that cannot be targeted may be kept or returned. Every other character they
 * controlled as the choice was made then returns to its owner's hand, one
 * after another in board order, through the ordinary zone replacements. With
 * fewer than two characters nothing returns and no choice is asked. The draw
 * counts the characters that reached a hand, an opponent-owned one reaching
 * its owner's hand included, never one that ceased to exist or was banished
 * instead.
 */
export interface ReturnAllButOneNode {
  readonly op: "returnAllButOne";
  readonly drawForEach?: true;
}

export const returnAllButOnePrimitive = definePrimitive<ReturnAllButOneNode>({
  op: "returnAllButOne",
  resolve(ctx, node, env) {
    const side = env.controller;
    const cohort = charactersInPlay(ctx.state, side);
    if (cohort.length < 2) return;
    const [kept] = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: env.purpose("keep"),
      candidates: cohort,
      min: 1,
      max: 1,
    });
    if (kept === undefined) throw new Error("returnAllButOne answered with no character");
    let returned = 0;
    for (const id of cohort) {
      const instance = ctx.state.instances[id];
      if (id === kept || instance?.zone !== "play" || instance.controller !== side) continue;
      returnToHand(ctx, id);
      if (ctx.state.instances[id]?.zone === "hand") returned++;
    }
    if (node.drawForEach !== true) return;
    for (let index = 0; index < returned; index++) drawCard(ctx, side);
  },
});

/** Return every character the controller controls but the one they choose to keep, optionally drawing a card per return. */
export function returnAllButOne(options: { readonly drawForEach?: true } = {}): ReturnAllButOneNode {
  return { op: "returnAllButOne", ...(options.drawForEach === true ? { drawForEach: true } : {}) };
}
