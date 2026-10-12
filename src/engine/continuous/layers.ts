/**
 * The layer evaluation (engine-design § Continuous effects): a card's
 * effective characteristics are computed from its copiable values and every
 * continuous change, never stored. Changes come from two places: floating
 * effects in `state.floating` (made by resolving effects, with values and
 * cards fixed as they resolved) and static abilities (read live) of emblems
 * and of cards in the zones the abilities work from: play, unless an
 * ability names a functional zone. They apply layer by layer:
 *
 * 1. copiable values: the printed card for its variant, a figment's type
 *    and spark, or what a figment copy copied, with a deck entry's
 *    modifications (catalog.ts `instanceCard`);
 * 2. type changes: "has all character types", and "this character is that
 *    character type";
 * 3. ability adds and removes: keywords gained and lost, and the keyword
 *    abilities of the cards a character gained the abilities of;
 * 4. base-spark setting;
 * 5. spark modifications: gained spark, spark with a duration, anthems,
 *    Support; clamped at 0;
 * 6. cost modifications (continuous/costs.ts) and play permissions
 *    (continuous/permissions.ts).
 *
 * Within a layer, changes apply in timestamp order. A static ability's
 * timestamp is its source's `enteredZoneAt`, when the card entered the zone
 * the ability works from (0 for an emblem); a floating
 * effect's is its `timestamp`. Ties go to static abilities first, in source
 * order, then floating effects in creation order (RD-hv-7x4l.7-2). A static
 * ability's selectors and values read the characteristics the layers before
 * its own produced, so no layer depends on itself.
 */
import { instanceCard, plainVariant, type EngineCatalog } from "../catalog";
import type { CardSubtype } from "../../types/card-identity";
import { worksInZone } from "../dsl/abilities";
import { matchesCharacterWith, matchingCharactersWith, zoneCountWith, type CharacteristicsReader } from "../dsl/selectors";
import type { Ability, CharacterRef, Keyword, StaticAbility } from "../dsl/types";
import { evaluateValue } from "../dsl/values";
import { chosenSubtypeOf, mentionsChosenSubtype, withChosenSubtype } from "../effects/primitives/choose-subtype";
import { primitiveDefinition } from "../effects/registry";
import type { EffectNode, Layer, StaticEnv } from "../effects/types";
import { instanceOrigin, originAbilities } from "../rules/activation";
import { charactersInPlay } from "../rules/zones";
import type { AbilitySource, EffectId, InstanceId, Side, Zone } from "../state/ids";
import { SIDES, sourceInstance } from "../state/ids";
import type { BattleState, CardInstance, ContinuousChange, FloatingChange } from "../state/types";
import { supportedBy } from "./support";

/** A card's effective characteristics. */
export interface Characteristics {
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  /** "Has all character types": it matches every subtype a selector names. */
  readonly allTypes: boolean;
  /** Keyword abilities, plus those gained, minus those lost. */
  readonly keywords: readonly Keyword[];
  /** A character's base spark after base-spark setting; `null` for an event. */
  readonly baseSpark: number | null;
  /** A character's spark after every modification, never below 0; `null` for an event. */
  readonly spark: number | null;
}

/** The layer each kind of continuous change applies in. */
const LAYER: Readonly<Record<ContinuousChange["kind"], Layer>> = {
  allTypes: 2,
  subtype: 2,
  keyword: 3,
  abilities: 3,
  baseSpark: 4,
  spark: 5,
  cost: 6,
  cardCost: 6,
  playFrom: 6,
  cannotPlay: 6,
  playLimit: 6,
  reclaimNotBanished: 6,
};

/** Whether a floating change is a continuous change the layers apply. */
function isContinuousChange(change: FloatingChange): change is ContinuousChange {
  return change.kind in LAYER;
}

/** A change with its ordering keys. */
export interface OrderedChange {
  readonly change: ContinuousChange;
  readonly timestamp: number;
  /** The floating effect making the change; `null` for a static ability. */
  readonly effect: EffectId | null;
  /** The originating static ability's source; `null` for a floating effect. Internal provenance for visibility checks. */
  readonly staticSource: AbilitySource | null;
  /** Source order for a static ability, creation order for a floating effect. */
  readonly order: number;
}

/** A static ability that applies now, with its ordering keys. */
interface StaticEntry {
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly node: EffectNode;
  readonly layer: Layer;
  readonly timestamp: number;
  readonly order: number;
}

function instanceNumber(id: InstanceId): number {
  return Number(id.slice(1));
}

/** A card's static abilities. */
interface CardStatics {
  readonly abilities: readonly StaticAbility[];
}

/**
 * A catalog's card statics by printing, then by variant: the plain base and
 * amplified variants in slots 0 and 1, any other by its JSON. A card's
 * abilities are plain data for its printing and variant, so each catalog
 * reads them once. Each instance's applicable statics are selected through
 * the shared functional-zone predicate. Derived data, never persisted.
 */
export type StaticsMemo = Map<string, Map<string | 0 | 1, CardStatics>>;

function cardStatics(catalog: EngineCatalog, instance: CardInstance): CardStatics {
  const { printing, variant } = instance;
  if (instance.status.gainedAbilities !== undefined) {
    // Gained abilities belong to this instance, not to its printing and variant.
    return { abilities: originAbilities(catalog, instanceOrigin(instance)).filter((ability): ability is StaticAbility => ability.kind === "static") };
  }
  const printed = printing.kind === "figment" ? `figment:${printing.figment}` : printing.cardId;
  let byVariant = catalog.statics.get(printed);
  if (byVariant === undefined) {
    byVariant = new Map();
    catalog.statics.set(printed, byVariant);
  }
  const key = plainVariant(instance) ? (variant.amplified ? 1 : 0) : JSON.stringify(variant);
  let statics = byVariant.get(key);
  if (statics === undefined) {
    const abilities = originAbilities(catalog, instanceOrigin(instance)).filter((ability): ability is StaticAbility => ability.kind === "static");
    statics = { abilities };
    byVariant.set(key, statics);
  }
  return statics;
}

/**
 * Every static ability that applies now, in source order: each side's avatar
 * and dreamsigns (player first), then cards by instance number. An emblem's
 * static abilities always apply; a card's apply while the card is in a zone
 * the ability works from, and one in a hidden zone stays hidden: no event or
 * view names it (RD-hv-umm2.53-2). When no printing in the catalog has a
 * static ability working outside play (`staticsOutsidePlay`), only cards with
 * transfigurations or deck mods outside play are read.
 */
function collectStatics(state: BattleState, catalog: EngineCatalog): StaticEntry[] {
  const entries: StaticEntry[] = [];
  const add = (source: AbilitySource, controller: Side, abilities: readonly Ability[], timestamp: number, zone: Zone | null): void => {
    for (const ability of abilities) {
      if (ability.kind !== "static" || (zone !== null && !worksInZone(ability.zone, zone))) continue;
      const continuous = primitiveDefinition(ability.effect.op).continuous;
      if (continuous === undefined) throw new Error(`A static ability holds ${ability.effect.op}, which is not continuous`);
      entries.push({ source, controller, node: ability.effect, layer: continuous.layer, timestamp, order: entries.length });
    }
  };
  for (const side of SIDES) {
    const { avatar, dreamsigns } = state.sides[side];
    if (avatar !== null) add({ kind: "avatar", side }, side, originAbilities(catalog, { kind: "avatar", id: avatar.id }), 0, null);
    dreamsigns.forEach((dreamsign, index) => {
      add({ kind: "dreamsign", side, index }, side, originAbilities(catalog, { kind: "dreamsign", id: dreamsign.id }), 0, null);
    });
  }
  // Only cards with static abilities can add entries, so only they are ordered.
  const cards: { readonly instance: CardInstance; readonly abilities: readonly StaticAbility[] }[] = [];
  for (const side of SIDES) {
    for (const id of charactersInPlay(state, side)) {
      const instance = state.instances[id];
      if (instance === undefined) continue;
      const { abilities } = cardStatics(catalog, instance);
      if (abilities.length > 0) cards.push({ instance, abilities });
    }
  }
  const printedOnlyInPlay = !catalog.staticsOutsidePlay();
  for (const instance of Object.values(state.instances)) {
    if (instance.zone === "play" || (printedOnlyInPlay && plainVariant(instance))) continue;
    const { abilities } = cardStatics(catalog, instance);
    if (abilities.some((ability) => worksInZone(ability.zone, instance.zone))) cards.push({ instance, abilities });
  }
  cards.sort((a, b) => instanceNumber(a.instance.id) - instanceNumber(b.instance.id));
  for (const { instance, abilities } of cards) {
    const { printing } = instance;
    if (instance.status.gainedAbilities === undefined || printing.kind !== "card") {
      add(instance.id, instance.controller, abilities, instance.enteredZoneAt, instance.zone);
      continue;
    }
    // A gained static ability is as new as its gain when that began after its character entered its zone.
    add(instance.id, instance.controller, catalog.card(printing.cardId).abilities(instance.variant), instance.enteredZoneAt, instance.zone);
    for (const { change, timestamp } of state.floating) {
      if (change.kind !== "abilities" || change.instance !== instance.id) continue;
      add(instance.id, instance.controller, catalog.card(change.cardId).abilities(change.variant), Math.max(instance.enteredZoneAt, timestamp), instance.zone);
    }
  }
  return entries;
}

function byTimestamp(a: OrderedChange, b: OrderedChange): number {
  return (
    a.timestamp - b.timestamp ||
    Number(a.effect !== null) - Number(b.effect !== null) ||
    a.order - b.order
  );
}

/**
 * The card whose characteristics a change changes, or `null` for a cost
 * modifier, a play permission or restriction, or a player's reclaimed cards,
 * which change how cards are played rather than what they are.
 */
function changed(change: ContinuousChange): InstanceId | null {
  switch (change.kind) {
    case "cost":
    case "playFrom":
    case "cannotPlay":
    case "playLimit":
    case "reclaimNotBanished":
      return null;
    default:
      return change.instance;
  }
}

/**
 * The layer evaluation over one state. It computes lazily and caches what it
 * computes; it never mutates the state, and its caches never enter it.
 */
export class Layers {
  private readonly statics: StaticEntry[];
  private readonly layers = new Map<Layer, OrderedChange[]>();
  private readonly byInstance = new Map<Layer, Map<InstanceId, OrderedChange[]>>();
  private readonly computed = new Map<number, Map<InstanceId, Characteristics>>();

  constructor(
    readonly state: BattleState,
    readonly catalog: EngineCatalog,
  ) {
    this.statics = collectStatics(state, catalog);
  }

  /** A card's effective characteristics. */
  of(id: InstanceId): Characteristics {
    return this.through(id, 5);
  }

  /** Every change of `layer`, in the order it applies. */
  changes(layer: Layer): readonly OrderedChange[] {
    const cached = this.layers.get(layer);
    if (cached !== undefined) return cached;
    const ordered: OrderedChange[] = [];
    this.state.floating.forEach((effect, index) => {
      const change = effect.change;
      if (!isContinuousChange(change) || LAYER[change.kind] !== layer) return;
      ordered.push({ change, timestamp: effect.timestamp, effect: effect.id, staticSource: null, order: index });
    });
    for (const entry of this.statics) {
      if (entry.layer !== layer) continue;
      for (const change of this.expand(entry)) {
        ordered.push({ change, timestamp: entry.timestamp, effect: null, staticSource: entry.source, order: entry.order });
      }
    }
    ordered.sort(byTimestamp);
    this.layers.set(layer, ordered);
    return ordered;
  }

  /** A reader of the characteristics after `layer`, for selectors evaluated by later layers. */
  reader(layer: number): CharacteristicsReader {
    return (id) => this.through(id, layer);
  }

  /**
   * The changes a static ability makes now, read against the layers before
   * its own. One that names its source's chosen character type
   * (`CHOSEN_SUBTYPE`) reads it as that type, and makes no change while its
   * source has none.
   */
  private expand(entry: StaticEntry): readonly ContinuousChange[] {
    const { state, catalog } = this;
    let node = entry.node;
    if (mentionsChosenSubtype(node)) {
      const chosen = chosenSubtypeOf(state, entry.source);
      if (chosen === null) return [];
      node = withChosenSubtype(node, chosen);
    }
    const read = this.reader(entry.layer - 1);
    const self = sourceInstance(entry.source);
    const characters = (ref: CharacterRef): InstanceId[] => {
      switch (ref.kind) {
        case "self":
          return self !== null && state.instances[self]?.zone === "play" ? [self] : [];
        case "all":
          return matchingCharactersWith(state, catalog, read, ref.selector, entry.controller, entry.source);
        case "supported": {
          const selector = { controller: "you" as const, ...ref.selector };
          return self === null
            ? []
            : supportedBy(state, self).filter((id) =>
                matchesCharacterWith(state, catalog, read, selector, id, entry.controller, entry.source),
              );
        }
        case "target":
        case "subject":
          return [];
      }
    };
    const env: StaticEnv = {
      state,
      catalog,
      source: entry.source,
      controller: entry.controller,
      characters,
      read,
      value: (expr) =>
        evaluateValue(state, expr, {
          controller: entry.controller,
          source: entry.source,
          x: self === null ? null : (state.instances[self]?.status.x ?? null),
          count: (selector) => matchingCharactersWith(state, catalog, read, selector, entry.controller, entry.source).length,
          countCards: (count) => zoneCountWith(state, catalog, read, count, entry.controller),
        }),
    };
    const continuous = primitiveDefinition(node.op).continuous;
    return continuous === undefined ? [] : continuous.changes(node, env);
  }

  private changesTo(id: InstanceId, layer: Layer): readonly OrderedChange[] {
    let index = this.byInstance.get(layer);
    if (index === undefined) {
      index = new Map();
      for (const entry of this.changes(layer)) {
        const target = changed(entry.change);
        if (target === null) continue;
        const list = index.get(target) ?? [];
        list.push(entry);
        index.set(target, list);
      }
      this.byInstance.set(layer, index);
    }
    return index.get(id) ?? [];
  }

  /** Characteristics after `layer` (1–5). */
  private through(id: InstanceId, layer: number): Characteristics {
    let cache = this.computed.get(layer);
    const cached = cache?.get(id);
    if (cached !== undefined) return cached;
    const result = layer <= 1 ? this.copiable(id) : this.apply(this.through(id, layer - 1), id, layer as Layer);
    if (cache === undefined) {
      cache = new Map();
      this.computed.set(layer, cache);
    }
    cache.set(id, result);
    return result;
  }

  /** Layer 1: the printed card for its variant, or the figment or figment copy's copiable values. */
  private copiable(id: InstanceId): Characteristics {
    const instance = this.state.instances[id];
    if (instance === undefined) throw new Error(`Unknown instance ${id}`);
    const definition = instanceCard(this.catalog, instance);
    const keywords = new Set<Keyword>();
    for (const ability of definition.abilities(instance.variant)) {
      if (ability.kind === "keyword") keywords.add(ability.keyword);
    }
    const base = definition.spark === null ? null : definition.spark === "x" ? (instance.status.x ?? 0) : definition.spark;
    return {
      cardType: definition.cardType,
      subtype: definition.subtype,
      allTypes: false,
      keywords: [...keywords],
      baseSpark: base,
      spark: base === null ? null : Math.max(0, base),
    };
  }

  private apply(before: Characteristics, id: InstanceId, layer: Layer): Characteristics {
    const changes = this.changesTo(id, layer);
    if (layer === 5) {
      if (before.baseSpark === null) return before;
      const gained = this.state.instances[id]?.status.gainedSpark ?? 0;
      const modifications = changes.reduce((total, { change }) => total + (change.kind === "spark" ? change.amount : 0), 0);
      return { ...before, spark: Math.max(0, before.baseSpark + gained + modifications) };
    }
    let result = before;
    for (const { change } of changes) {
      switch (change.kind) {
        case "allTypes":
          result = { ...result, allTypes: true };
          break;
        case "subtype":
          result = { ...result, subtype: change.subtype, allTypes: false };
          break;
        case "keyword":
          result = {
            ...result,
            keywords: change.gains
              ? [...result.keywords.filter((keyword) => keyword !== change.keyword), change.keyword]
              : result.keywords.filter((keyword) => keyword !== change.keyword),
          };
          break;
        case "abilities": {
          const gained = this.catalog.card(change.cardId).abilities(change.variant).flatMap((ability) => (ability.kind === "keyword" ? [ability.keyword] : []));
          result = { ...result, keywords: [...result.keywords.filter((keyword) => !gained.includes(keyword)), ...gained] };
          break;
        }
        case "baseSpark":
          if (result.baseSpark !== null) result = { ...result, baseSpark: change.value, spark: Math.max(0, change.value) };
          break;
        default:
          break;
      }
    }
    return result;
  }
}
