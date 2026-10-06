import type { CharacterRef } from "../../dsl/types";
import { startDuration } from "../../rules/durations";
import { addFloating } from "../../rules/floating";
import { banish, instanceOf } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/**
 * "Banish … until end of turn", "until your next turn", "until the next Day
 * phase", or "until this leaves play": the character is banished, and as the
 * duration ends it returns to play under the side that controlled it, as a
 * materialize, unless that back rank is full (F3, RD-hv-7x4l.8-2). A created
 * character ceases to exist instead and never returns; nothing happens when
 * "until this leaves play" begins with its source already gone.
 */
export interface BanishUntilNode {
  readonly op: "banishUntil";
  readonly subject: CharacterRef;
  readonly duration: "untilEndOfTurn" | "untilYourNextTurn" | "untilNextDay" | "whileSourceInPlay";
}

export const banishUntilPrimitive = definePrimitive<BanishUntilNode>({
  op: "banishUntil",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      const expiry = startDuration(ctx, node.duration, env.controller, env.source, [id]);
      if (expiry === null) return;
      const side = instanceOf(ctx.state, id).controller;
      banish(ctx, id);
      if (ctx.state.instances[id]?.zone === "banished") {
        addFloating(ctx, { controller: env.controller, source: env.source, expiry, change: { kind: "banishedUntil", instance: id, side } });
      }
    }
  },
});

export function banishUntil(subject: CharacterRef, duration: BanishUntilNode["duration"]): BanishUntilNode {
  return { op: "banishUntil", subject, duration };
}
