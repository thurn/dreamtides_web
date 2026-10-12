import { startContinuous } from "../../continuous/resolve";
import { resolvePlayer } from "../../dsl/selectors";
import { thisCardIn } from "../../dsl/builders";
import type { CardFilter, Duration, PlayerRef, SelfSpec, SubjectSpec, ZoneCardSpec, ZoneSelfSpec } from "../../dsl/types";
import { sourceInstance } from "../../state/ids";
import type { ContinuousChange } from "../../state/types";
import { resolveCards } from "../interpreter";
import { cardTarget, definePrimitive } from "../types";

/** The cards a play permission names: the triggering card, the source, or a reference to cards in a void. */
export type PermittedCards = SubjectSpec | SelfSpec | ZoneCardSpec;

/**
 * "You may play ≤2● cost characters from your void", "you may play that card
 * from your void this turn", "You may play an event from your void" (rules §
 * Playing Cards and the Stack → Playing from the void), layer 6: `player`
 * may play the cards in the void it owns that match `filter`, for their
 * normal costs (continuous/permissions.ts). With `cards`, only the cards it
 * names in that void as it resolves are covered, each through its own
 * floating change. A `next` permission covers one play and ends as that card
 * is played. A static ability holds a permission with no `cards`, which lasts
 * while it applies (`oncePerTurn` limits it to one play each turn), or one
 * naming its own source in the void
 * (`playSelfFromZone`), which covers that card only while it is there.
 * `duration` `null` takes the enclosing `forDuration`'s,
 * else lasts permanently (a `next` one then lasts until it is used). It names
 * void cards only, which are public, so its `effectStarted` event names no
 * hidden card.
 */
export interface PlayFromZoneNode {
  readonly op: "playFromZone";
  readonly player: PlayerRef;
  readonly zone: "void";
  readonly cards: PermittedCards | null;
  readonly filter: CardFilter;
  readonly next: boolean;
  /** A filter-based static permission allows one committed play per turn. */
  readonly oncePerTurn?: boolean;
  readonly duration: Duration | null;
}

export const playFromZonePrimitive = definePrimitive<PlayFromZoneNode>({
  op: "playFromZone",
  targets: (node) => (node.cards === null ? [] : cardTarget(node.cards)),
  resolve(ctx, node, env) {
    if (node.oncePerTurn === true) throw new Error("A once-per-turn play permission belongs to a static ability");
    const player = resolvePlayer(env.controller, node.player);
    const permission = { kind: "playFrom", player, zone: node.zone, filter: node.filter, next: node.next } as const;
    const changes: ContinuousChange[] =
      node.cards === null
        ? [{ ...permission, instance: null }]
        : [...new Set(resolveCards(ctx, node.cards, env))]
            .filter((id) => ctx.state.sides[player][node.zone].includes(id))
            .map((instance) => ({ ...permission, instance }));
    startContinuous(ctx, env, node.duration, [], changes);
  },
  continuous: {
    layer: 6,
    changes(node, env) {
      if (node.oncePerTurn === true && (node.cards !== null || node.next)) throw new Error("A once-per-turn static permission names cards by filter and is not next");
      const self = sourceInstance(env.source);
      const sourceZone = self === null ? undefined : env.state.instances[self]?.zone;
      if (node.oncePerTurn === true && (sourceZone === "hand" || sourceZone === "deck")) throw new Error("A once-per-turn static play permission requires a public-zone source or emblem");
      const player = resolvePlayer(env.controller, node.player);
      const permission = { kind: "playFrom", player, zone: node.zone, filter: node.filter, next: false } as const;
      if (node.cards === null) return [{ ...permission, instance: null, ...(node.oncePerTurn === true ? { oncePerTurn: true } : {}) }];
      if (!isSelfInZone(node.cards)) throw new Error("A static play permission names its cards by filter, or only its own source");
      // The source itself, only while it is in the void the permission's player owns.
      return self !== null && env.state.sides[player][node.zone].includes(self) ? [{ ...permission, instance: self }] : [];
    },
  },
});

function isSelfInZone(cards: PermittedCards): cards is ZoneSelfSpec {
  return cards.kind === "inZone" && cards.pick === "self";
}

/**
 * "You may play <filter> cards from your void": for `duration` (or the
 * enclosing `forDuration`'s, else permanently), only the cards `cards` names
 * when given, and one play when `next`. `cards` names cards in a void only.
 * `oncePerTurn` is for a filter-based static ability: one play per turn while
 * its public-zone source or emblem applies, with each new source zone object
 * holding a fresh allowance. Static sources in a hand or deck are unsupported.
 */
export function playFromZone(
  zone: "void",
  filter: CardFilter = {},
  options: { readonly cards?: PermittedCards; readonly next?: boolean; readonly oncePerTurn?: boolean; readonly duration?: Duration; readonly player?: PlayerRef } = {},
): PlayFromZoneNode {
  const { cards } = options;
  if (cards?.kind === "inZone" && cards.zone !== "void") throw new Error("playFromZone names cards in a void only");
  if (options.oncePerTurn === true && (cards !== undefined || options.next === true)) throw new Error("A once-per-turn static permission names cards by filter and is not next");
  return { op: "playFromZone", player: options.player ?? "you", zone, cards: cards ?? null, filter, next: options.next === true, duration: options.duration ?? null, ...(options.oncePerTurn === true ? { oncePerTurn: true } : {}) };
}

/**
 * "You may play this character from your void", held by a static ability
 * working from the void (`staticAbility(..., { zone: "void" })`): its source
 * may be played from the void it owns for its normal costs, additional costs
 * included, any number of times, while it is there. No other card is covered.
 */
export function playSelfFromZone(zone: "void"): PlayFromZoneNode {
  return playFromZone(zone, {}, { cards: thisCardIn(zone) });
}
