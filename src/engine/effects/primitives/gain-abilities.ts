import { addFloating } from "../../rules/floating";
import { copyJson } from "../../state/clone";
import { sourceInstance } from "../../state/ids";
import type { BattleState, CardInstance } from "../../state/types";
import { definePrimitive } from "../types";
import type { BanishCardsNode } from "./banish-cards";

/**
 * "Banish a character from a player's void. This character gains the
 * abilities of that character" (rules § Keywords and Effects → Gaining
 * abilities): resolves `banish`, then the effect's source, while it is a
 * character in play, gains the abilities of each card that entered a
 * Banished zone as `banish` resolved, in the order they entered: every
 * ability of its card for its variant (RD-hv-umm2.110-1). Each gain is a
 * floating layer-3 `abilities` change lasting while the character is in
 * play (RD-hv-umm2.110-2), announced by `effectStarted`, which
 * rules/floating.ts mirrors onto the character's `status.gainedAbilities`.
 * A source out of play, or a banish that moved no card (an empty void, a
 * target no longer legal), gains nothing; a figment has no card abilities to
 * gain and is never banished, since it ceases to exist instead.
 */
export interface GainAbilitiesNode {
  readonly op: "gainAbilities";
  readonly banish: BanishCardsNode;
}

/** The cards in a Banished zone that entered it after `since`, in the order they entered. */
function banishedSince(state: BattleState, since: number): CardInstance[] {
  return Object.values(state.instances)
    .filter((instance) => instance.zone === "banished" && instance.enteredZoneAt > since)
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt);
}

export const gainAbilitiesPrimitive = definePrimitive<GainAbilitiesNode>({
  op: "gainAbilities",
  children: (node) => [node.banish],
  resolve(ctx, node, env) {
    const since = ctx.state.clock;
    env.run(node.banish);
    const self = sourceInstance(env.source);
    if (self === null || ctx.state.instances[self]?.zone !== "play") return;
    for (const { printing, variant } of banishedSince(ctx.state, since)) {
      if (printing.kind !== "card") continue;
      addFloating(ctx, {
        controller: env.controller,
        source: env.source,
        expiry: { at: "sourceLeavesPlay", source: self },
        change: { kind: "abilities", instance: self, cardId: printing.cardId, variant: copyJson(variant) },
      });
    }
  },
});

/** "<Banish …>. This character gains the abilities of that character." */
export function gainAbilities(banish: BanishCardsNode): GainAbilitiesNode {
  return { op: "gainAbilities", banish };
}
