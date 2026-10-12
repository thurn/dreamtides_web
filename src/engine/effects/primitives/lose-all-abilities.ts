import { startContinuous } from "../../continuous/resolve";
import type { CharacterRef, Duration } from "../../dsl/types";
import { instanceOrigin } from "../../rules/activation";
import { addFloating } from "../../rules/floating";
import { copyJson } from "../../state/clone";
import { sourceInstance, type InstanceId } from "../../state/ids";
import type { AbilityOrigin, BattleState, GainedAbilities } from "../../state/types";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/**
 * "An enemy loses all abilities until the opponent pays 3●" (rules §
 * Keywords and Effects → Losing abilities): each character in play the
 * subject names loses every ability it has, as a floating layer-3
 * `loseAbilities` change, announced by `effectStarted`, which
 * rules/floating.ts mirrors onto its `status.lostAbilities`. Its keywords
 * end at the change's timestamp, and its own abilities and those it gained
 * before then stop working wherever abilities are read (rules/activation.ts
 * `originAbilities`); a later gain survives it (RD-hv-umm2.111-1). The loss
 * lasts for `duration`, else the enclosing `forDuration`'s, else
 * permanently, and ends as the character leaves play (RD-hv-umm2.111-2).
 *
 * With `sourceGains` ("This character gains those abilities"), the effect's
 * source, while it is a character in play, then gains the abilities each
 * character had as it lost them: those of its card for its variant, or of
 * its figment type, then of each card or figment type it had gained and
 * not lost, in that order, as `abilities` changes lasting while the source
 * is in play (RD-hv-umm2.111-3). A character whose loss did not begin gives
 * nothing.
 */
export interface LoseAllAbilitiesNode {
  readonly op: "loseAllAbilities";
  readonly subject: CharacterRef;
  readonly duration: Duration | null;
  readonly sourceGains: boolean;
}

/** The ability groups an origin has now, in its ability-list order: lost groups are left out. */
function presentGroups(origin: AbilityOrigin): GainedAbilities[] {
  switch (origin.kind) {
    case "figment":
      return origin.lost === true ? [] : [{ figment: origin.id }];
    case "card": {
      const groups: GainedAbilities[] = [{ cardId: origin.cardId, variant: origin.variant }, ...(origin.gained ?? [])];
      return origin.lost === undefined ? groups : groups.slice(origin.lost + 1);
    }
    default:
      return [];
  }
}

/** Whether `id` lost its abilities to a floating effect started after the first `since` effects. */
function lostSince(state: BattleState, since: number, id: InstanceId): boolean {
  return state.floating.slice(since).some(({ change }) => change.kind === "loseAbilities" && change.instance === id);
}

export const loseAllAbilitiesPrimitive = definePrimitive<LoseAllAbilitiesNode>({
  op: "loseAllAbilities",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    const { state } = ctx;
    const ids = resolveCharacters(ctx, node.subject, env).filter((id) => state.instances[id]?.zone === "play");
    const had = ids.map((id) => presentGroups(instanceOrigin(state.instances[id])));
    const since = state.floating.length;
    startContinuous(ctx, env, node.duration, ids, ids.map((instance) => ({ kind: "loseAbilities", instance })));
    if (!node.sourceGains) return;
    const self = sourceInstance(env.source);
    if (self === null || state.instances[self]?.zone !== "play") return;
    ids.forEach((id, index) => {
      if (!lostSince(state, since, id)) return;
      for (const group of had[index] ?? []) {
        addFloating(ctx, {
          controller: env.controller,
          source: env.source,
          expiry: { at: "sourceLeavesPlay", source: self },
          change: { kind: "abilities", instance: self, ...copyJson(group) },
        });
      }
    });
  },
});

/**
 * "<Subject> loses all abilities", for `duration` when given; with
 * `sourceGains`, "This character gains those abilities".
 */
export function loseAllAbilities(
  subject: CharacterRef,
  options: { readonly duration?: Duration; readonly sourceGains?: boolean } = {},
): LoseAllAbilitiesNode {
  return { op: "loseAllAbilities", subject, duration: options.duration ?? null, sourceGains: options.sourceGains ?? false };
}
