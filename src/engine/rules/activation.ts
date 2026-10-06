/**
 * Activated abilities (rules § Ability Types): which sources a side can
 * activate from, what each source's abilities are, and the timing and
 * quick cost checks that pre-filter the `activate` step's dry run.
 */
import type { EngineCatalog } from "../catalog";
import type { Ability, ActivatedAbility } from "../dsl/types";
import { BASE_VARIANT } from "../dsl/types";
import type { AbilitySource, CardId, OncePerTurnKey, Side } from "../state/ids";
import { sourceKey } from "../state/ids";
import type { AbilityOrigin, BattleState, CardInstance } from "../state/types";
import { costsPayable } from "./costs";
import { effectEntersPlay } from "../effects/interpreter";
import { freeBackSlotsAfterStack, timingAllows } from "./timing";
import { charactersInPlay } from "./zones";

/** The side controlling a source now, or `null` when the source is gone. */
export function sourceController(state: BattleState, source: AbilitySource): Side | null {
  if (typeof source === "string") {
    return state.instances[source]?.controller ?? null;
  }
  const side = state.sides[source.side];
  const present = source.kind === "avatar" ? side.avatar !== null : source.index < side.dreamsigns.length;
  return present ? source.side : null;
}

/** Where an instance's abilities come from: its card for its variant, the card a figment copy copies, or its figment type. */
export function instanceOrigin(instance: CardInstance): AbilityOrigin {
  const { printing } = instance;
  return printing.kind === "figment"
    ? { kind: "figment", id: printing.figment }
    : { kind: "card", cardId: printing.cardId, variant: instance.variant };
}

/** Where a source's abilities come from now, or `null` when the source is gone. */
export function abilityOrigin(state: BattleState, source: AbilitySource): AbilityOrigin | null {
  if (typeof source === "string") {
    const instance = state.instances[source];
    return instance === undefined ? null : instanceOrigin(instance);
  }
  const side = state.sides[source.side];
  if (source.kind === "avatar") {
    return side.avatar === null ? null : { kind: "avatar", id: side.avatar.id };
  }
  const dreamsign = side.dreamsigns[source.index];
  return dreamsign === undefined ? null : { kind: "dreamsign", id: dreamsign.id };
}

/** The abilities an origin grants: a card's for its variant, or an emblem's. */
export function originAbilities(catalog: EngineCatalog, origin: AbilityOrigin): readonly Ability[] {
  switch (origin.kind) {
    case "card":
      return catalog.card(origin.cardId).abilities(origin.variant);
    case "figment":
      return catalog.figment(origin.id).abilities(BASE_VARIANT);
    case "avatar":
      return catalog.avatar(origin.id).abilities(BASE_VARIANT);
    case "dreamsign":
      return catalog.dreamsign(origin.id).abilities(BASE_VARIANT);
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

/** The once-per-turn key of an ability. */
export function oncePerTurnKey(source: AbilitySource, index: number): OncePerTurnKey {
  return `${sourceKey(source)}#${index}`;
}

/**
 * Every source `side` may activate abilities from, in the fixed order: its
 * avatar, its dreamsigns, then its characters in play, B0→B9 then F0→F8.
 * Cards in other zones have no activated abilities in play.
 */
export function abilitySources(state: BattleState, side: Side): AbilitySource[] {
  const sideState = state.sides[side];
  return [
    ...(sideState.avatar === null ? [] : [{ kind: "avatar", side } as const]),
    ...sideState.dreamsigns.map((_, index) => ({ kind: "dreamsign", side, index }) as const),
    ...charactersInPlay(state, side),
  ];
}

/**
 * Whether `side` may begin activating the ability now: it controls the
 * source, the ability's timing allows it, an ability that would put
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
  if (typeof source === "string" && state.instances[source]?.zone !== "play") return false;
  const ability = activatedAbilityAt(state, catalog, source, index);
  if (ability === null) return false;
  if (!timingAllows(state, side, ability.speed)) return false;
  if (effectEntersPlay(ability.effect) && freeBackSlotsAfterStack(state, catalog, side) <= 0) return false;
  if (ability.oncePerTurn === true && state.oncePerTurn.includes(oncePerTurnKey(source, index))) {
    return false;
  }
  return costsPayable(state, side, source, ability.costs);
}
