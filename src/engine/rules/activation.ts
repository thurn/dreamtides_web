/**
 * Activated abilities (rules § Ability Types): which sources a side can
 * activate from, what each source's abilities are, and the timing and
 * quick cost checks that pre-filter the `activate` step's dry run.
 */
import type { EngineCatalog } from "../catalog";
import type { Ability, ActivatedAbility } from "../dsl/types";
import { BASE_VARIANT } from "../dsl/types";
import type { AbilitySource, CardId, OncePerTurnKey, Side, Zone } from "../state/ids";
import { instanceNumber, sourceKey } from "../state/ids";
import type { AbilityOrigin, BattleState, CardInstance, GainedAbilities } from "../state/types";
import { abilitiesDisabled } from "./ability-disabling";
import { costsPayable } from "./costs";
import { activationCostModifier } from "../continuous/costs";
import { effectEntersPlay } from "../effects/interpreter";
import { freeBackSlotsAfterStack, timingAllows } from "./timing";
import { charactersInPlay } from "./zones";

/**
 * The side controlling a source now, or `null` when the source is gone. A
 * card in a void, a deck, or the Banished zone is controlled by its owner.
 */
export function sourceController(state: BattleState, source: AbilitySource): Side | null {
  if (typeof source === "string") {
    return state.instances[source]?.controller ?? null;
  }
  if (source.kind === "dreamwell") return source.side;
  const side = state.sides[source.side];
  const present = source.kind === "avatar" ? side.avatar !== null : source.index < side.dreamsigns.length;
  return present ? source.side : null;
}

/**
 * Where an instance's abilities come from: its card for its variant, or the
 * card a figment copy copies, followed by the abilities it has gained; or its
 * figment type. While it has lost its abilities, the origin says which.
 */
export function instanceOrigin(instance: CardInstance): AbilityOrigin {
  const { printing } = instance;
  const { gainedAbilities: gained, lostAbilities: lost } = instance.status;
  if (printing.kind === "figment") return { kind: "figment", id: printing.figment, ...(lost === undefined ? {} : { lost: true }) };
  return {
    kind: "card",
    cardId: printing.cardId,
    variant: instance.variant,
    ...(gained === undefined || gained.length === 0 ? {} : { gained: [...gained] }),
    ...(lost === undefined ? {} : { lost }),
  };
}

/** Where a source's abilities come from now, or `null` when the source is gone. */
export function abilityOrigin(state: BattleState, source: AbilitySource): AbilityOrigin | null {
  if (typeof source === "string") {
    const instance = state.instances[source];
    return instance === undefined ? null : instanceOrigin(instance);
  }
  if (source.kind === "dreamwell") return { kind: "dreamwell", id: source.id };
  const side = state.sides[source.side];
  if (source.kind === "avatar") {
    return side.avatar === null ? null : { kind: "avatar", id: side.avatar.id };
  }
  const dreamsign = side.dreamsigns[source.index];
  return dreamsign === undefined ? null : { kind: "dreamsign", id: dreamsign.id };
}

/** The abilities one gained group grants: a card's for its variant, or a figment type's. */
export function gainedGroupAbilities(catalog: EngineCatalog, group: GainedAbilities): readonly Ability[] {
  return "figment" in group ? catalog.figment(group.figment).abilities(BASE_VARIANT) : catalog.card(group.cardId).abilities(group.variant);
}

/**
 * The groups' abilities in order, with the first `lost` groups' positions
 * left as holes: a sparse list whose length and indexes are those of the
 * whole list, so iteration (`forEach`, `some`, `flatMap`) skips the lost
 * abilities and indexing one gives `undefined`.
 */
function withoutLost(groups: readonly (readonly Ability[])[], lost: number): readonly Ability[] {
  const abilities: Ability[] = [];
  let offset = 0;
  groups.forEach((group, index) => {
    if (index >= lost) group.forEach((ability, position) => { abilities[offset + position] = ability; });
    offset += group.length;
  });
  abilities.length = offset;
  return abilities;
}

/**
 * The abilities an origin grants: a card's for its variant, then those of
 * each card or figment type it gained, in the order gained; or an emblem's.
 * An origin that lost its abilities (rules § Keywords and Effects → Losing
 * abilities) keeps their indexes as holes, so every reader that iterates the
 * list or reads an index sees only the abilities it still has, and indexes
 * never change as a loss begins or ends.
 */
export function originAbilities(catalog: EngineCatalog, origin: AbilityOrigin): readonly Ability[] {
  switch (origin.kind) {
    case "card": {
      const own = catalog.card(origin.cardId).abilities(origin.variant);
      if (origin.gained === undefined && origin.lost === undefined) return own;
      const groups = [own, ...(origin.gained ?? []).map((group) => gainedGroupAbilities(catalog, group))];
      return origin.lost === undefined ? groups.flat() : withoutLost(groups, origin.lost + 1);
    }
    case "figment": {
      const own = catalog.figment(origin.id).abilities(BASE_VARIANT);
      return origin.lost === true ? withoutLost([own], 1) : own;
    }
    case "avatar":
      return catalog.avatar(origin.id).abilities(BASE_VARIANT);
    case "dreamsign":
      return catalog.dreamsign(origin.id).abilities(BASE_VARIANT);
    case "dreamwell":
      return catalog.dreamwellCard(origin.id).abilities(BASE_VARIANT);
  }
}

/** The card an origin names, for prompt purposes; `null` for an emblem. */
export function originCardId(origin: AbilityOrigin): CardId | null {
  return origin.kind === "card" ? origin.cardId : null;
}

/** The activated ability at `index` in a source's ability list, or `null`. */
export function activatedAbilityAt(
  state: BattleState,
  catalog: EngineCatalog,
  source: AbilitySource,
  index: number,
): ActivatedAbility | null {
  const origin = abilityOrigin(state, source);
  const ability = origin === null ? undefined : originAbilities(catalog, origin)[index];
  return ability?.kind === "activated" ? ability : null;
}

/** The once-per-turn key of an ability; static play permissions also name their source zone object. */
export function oncePerTurnKey(source: AbilitySource, index: number, enteredZoneAt?: number): OncePerTurnKey {
  return enteredZoneAt === undefined ? `${sourceKey(source)}#${index}` : `${sourceKey(source)}#${index}@${enteredZoneAt}`;
}

/**
 * `side`'s sources whose abilities work in play, in the fixed order: its
 * avatar, its dreamsigns, then its characters in play, B0→B9 then F0→F8.
 */
export function inPlaySources(state: BattleState, side: Side): AbilitySource[] {
  const sideState = state.sides[side];
  return [
    ...(sideState.avatar === null ? [] : [{ kind: "avatar", side } as const]),
    ...sideState.dreamsigns.map((_, index) => ({ kind: "dreamsign", side, index }) as const),
    ...charactersInPlay(state, side),
  ];
}

/** Whether an activated ability works from `zone`: a card's in play unless it names the hand or void (rules § Ability Types). */
function activatesFrom(ability: ActivatedAbility, zone: Zone): boolean {
  return (ability.zone ?? "play") === zone;
}

/**
 * Every source `side` may activate abilities from, in the fixed order of
 * `inPlaySources`, then the cards in its void with an ability that works
 * there, in the order they were created for the battle (rules § Ability
 * Types → Where activated abilities work). A void holds only its owner's
 * cards, so `side` owns each. Hand sources follow them in creation order,
 * held and controlled by `side`. Cards in other zones have no activated
 * abilities that work.
 */
export function abilitySources(state: BattleState, catalog: EngineCatalog, side: Side): AbilitySource[] {
  const fromVoid = state.sides[side].void
    .filter((id) => originAbilities(catalog, instanceOrigin(state.instances[id])).some((ability) => ability.kind === "activated" && activatesFrom(ability, "void")))
    .sort((a, b) => instanceNumber(a) - instanceNumber(b));
  const fromHand = state.sides[side].hand
    .filter((id) => state.instances[id]?.zone === "hand" && state.instances[id].controller === side &&
      originAbilities(catalog, instanceOrigin(state.instances[id])).some((ability) => ability.kind === "activated" && activatesFrom(ability, "hand")))
    .sort((a, b) => instanceNumber(a) - instanceNumber(b));
  return [...inPlaySources(state, side), ...fromVoid, ...fromHand];
}

/**
 * Whether `side` may begin activating the ability now: it controls the
 * source, the source's card is in the zone the ability works from (play,
 * its holder's hand, or its owner's void), the ability's timing allows it, an ability that would put
 * characters into play has an open back-rank position, a once-per-turn
 * ability is unused this turn, and the costs that need no choice are
 * payable. The dry run of the `activate` step checks the choices.
 */
export function canActivate(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  source: AbilitySource,
  index: number,
): boolean {
  if (sourceController(state, source) !== side) return false;
  if (typeof source === "string" && abilitiesDisabled(state, catalog, source, "activated")) return false;
  const ability = activatedAbilityAt(state, catalog, source, index);
  if (ability === null) return false;
  if (ability.zone === "hand" && (typeof source !== "string" || state.instances[source]?.zone !== "hand" ||
    !state.sides[side].hand.includes(source) ||
    ability.costs.filter(cost => cost.cost === "revealSource").length !== 1)) return false;
  if (typeof source === "string" && !activatesFrom(ability, state.instances[source].zone)) return false;
  if (!timingAllows(state, side, ability.speed)) return false;
  if (effectEntersPlay(ability.effect) && freeBackSlotsAfterStack(state, catalog, side) <= 0) return false;
  if (ability.oncePerTurn === true && state.oncePerTurn.includes(oncePerTurnKey(source, index))) {
    return false;
  }
  return costsPayable(state, side, source, ability.costs, activationCostModifier(state, catalog, source, side));
}
