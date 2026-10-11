import { startContinuous } from "../../continuous/resolve";
import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, Duration, PlayerRef } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { opponent, SIDES, type Side } from "../../state/ids";
import type { ContinuousChange } from "../../state/types";
import { definePrimitive } from "../types";

/**
 * Which plays a play restriction stops (rules § Playing Cards and the Stack
 * → Play restrictions):
 *
 * - `chosen`: "Choose a card in the opponent's hand. That card cannot be
 *   played": the controller privately chooses one card of the opponent's
 *   hand as the effect resolves (role `restrictChosen`), and no player can
 *   play that card, wherever it is (RD-hv-umm2.109-1, RD-hv-umm2.109-2);
 * - `matching`: "The opponent cannot play events": `player` cannot play the
 *   cards matching `filter`, by their effective characteristics;
 * - `perTurn`: "Players may only play one card per turn": each player
 *   cannot play a card once it has played `count` cards this turn, counting
 *   every card it played this turn (RD-hv-umm2.109-3).
 */
export type PlayRestriction =
  | { readonly kind: "chosen" }
  | { readonly kind: "matching"; readonly player: PlayerRef; readonly filter: CardFilter }
  | { readonly kind: "perTurn"; readonly count: number };

/**
 * A play restriction, layer 6: floating `cannotPlay` or `playLimit` changes
 * made as it resolves, for `duration` (`null` takes the enclosing
 * `forDuration`'s, else permanently), or, held by a static ability, changes
 * that last while it applies. Legality and the play step read them through
 * rules/timing.ts `canPlay`, so every route of play is restricted, while a
 * card put into play without being played, or a copy, is not. A `chosen`
 * restriction with a "while this is in play" duration whose source has left
 * play still makes its choice, and restricts nothing (RD-hv-7x4l.6-4,
 * RD-hv-umm2.109-1). A static ability holds only `matching` and `perTurn`.
 */
export interface PlayRestrictionNode {
  readonly op: "playRestriction";
  readonly restriction: PlayRestriction;
  readonly duration: Duration | null;
}

export const playRestrictionPrimitive = definePrimitive<PlayRestrictionNode>({
  op: "playRestriction",
  resolve(ctx, node, env) {
    const { restriction } = node;
    let changes: ContinuousChange[];
    switch (restriction.kind) {
      case "chosen": {
        const candidates = [...ctx.state.sides[opponent(env.controller)].hand];
        if (candidates.length === 0) return;
        const [chosen] = ctx.choose<ChooseCardsPrompt>({
          kind: "chooseCards",
          side: env.controller,
          privateTo: env.controller,
          purpose: env.purpose("restrictChosen"),
          candidates,
          min: 1,
          max: 1,
        });
        if (chosen === undefined) throw new Error("restrictChosen answered with no card");
        changes = [{ kind: "cannotPlay", player: null, instance: chosen, filter: {} }];
        break;
      }
      case "matching":
      case "perTurn":
        changes = restrictionChanges(restriction, env.controller);
        break;
    }
    startContinuous(ctx, env, node.duration, [], changes);
  },
  continuous: {
    layer: 6,
    changes(node, env) {
      if (node.restriction.kind === "chosen") throw new Error("A static play restriction names its cards by filter");
      return restrictionChanges(node.restriction, env.controller);
    },
  },
});

function restrictionChanges(
  restriction: Exclude<PlayRestriction, { readonly kind: "chosen" }>,
  controller: Side,
): ContinuousChange[] {
  switch (restriction.kind) {
    case "matching":
      return [{ kind: "cannotPlay", player: resolvePlayer(controller, restriction.player), instance: null, filter: restriction.filter }];
    case "perTurn":
      return SIDES.map((player) => ({ kind: "playLimit", player, count: restriction.count }));
  }
}

/** "Choose a card in the opponent's hand. That card cannot be played <duration>." */
export function cannotPlayChosen(options: { readonly duration?: Duration } = {}): PlayRestrictionNode {
  return { op: "playRestriction", restriction: { kind: "chosen" }, duration: options.duration ?? null };
}

/** "<player> cannot play <filter> cards <duration>." */
export function cannotPlay(
  player: PlayerRef,
  filter: CardFilter,
  options: { readonly duration?: Duration } = {},
): PlayRestrictionNode {
  return { op: "playRestriction", restriction: { kind: "matching", player, filter }, duration: options.duration ?? null };
}

/** "Players may only play <count> card(s) per turn." */
export function playLimitPerTurn(count: number, options: { readonly duration?: Duration } = {}): PlayRestrictionNode {
  if (!Number.isInteger(count) || count < 0) throw new Error("playLimitPerTurn takes a non-negative whole count");
  return { op: "playRestriction", restriction: { kind: "perTurn", count }, duration: options.duration ?? null };
}
