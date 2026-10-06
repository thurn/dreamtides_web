/**
 * The layer evaluation (engine-design § Continuous effects): a card's
 * effective characteristics are computed from its copiable values and every
 * continuous change, never stored. Changes come from two places: floating
 * effects in `state.floating` (made by resolving effects, with values and
 * cards fixed as they resolved) and static abilities of cards in play and
 * emblems (read live). They apply layer by layer:
 *
 * 1. copiable values: the printed card for its variant, a figment's type
 *    and spark, or what a figment copy copied (catalog.ts `printedCard`);
 * 2. type changes: "has all character types";
 * 3. ability adds and removes: keywords gained and lost;
 * 4. base-spark setting;
 * 5. spark modifications: gained spark, spark with a duration, anthems,
 *    Support; clamped at 0;
 * 6. cost modifications (continuous/costs.ts).
 *
 * Within a layer, changes apply in timestamp order. A static ability's
 * timestamp is its source's `enteredZoneAt` (0 for an emblem); a floating
 * effect's is its `timestamp`. Ties go to static abilities first, in source
 * order, then floating effects in creation order (RD-hv-7x4l.7-2). A static
 * ability's selectors and values read the characteristics the layers before
 * its own produced, so no layer depends on itself.
 */
import { printedCard, type EngineCatalog } from "../catalog";
import type { CardSubtype } from "../../types/card-identity";
import { matchesCharacterWith, matchingCharactersWith, type CharacteristicsReader } from "../dsl/selectors";
import type { CharacterRef, Keyword } from "../dsl/types";
import { evaluateValue } from "../dsl/values";
import { primitiveDefinition } from "../effects/registry";
import type { EffectNode, Layer, StaticEnv } from "../effects/types";
import { instanceOrigin, originAbilities } from "../rules/activation";
import { charactersInPlay } from "../rules/zones";
import type { AbilitySource, EffectId, InstanceId, Side } from "../state/ids";
import { SIDES, sourceInstance } from "../state/ids";
import type { AbilityOrigin, BattleState, ContinuousChange, FloatingChange } from "../state/types";
import { supportedBy } from "./support";

/** A card's effective characteristics. */
export interface Characteristics {
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  /** "Has all character types": it matches every subtype a selector names. */
  readonly allTypes: boolean;
  /** Printed and authored keywords, plus those gained, minus those lost. */
  readonly keywords: readonly Keyword[];
  /** A character's base spark after base-spark setting; `null` for an event. */
  readonly baseSpark: number | null;
  /** A character's spark after every modification, never below 0; `null` for an event. */
  readonly spark: number | null;
}

/** The layer each kind of continuous change applies in. */
const LAYER: Readonly<Record<ContinuousChange["kind"], Layer>> = {
  allTypes: 2,
  keyword: 3,
  baseSpark: 4,
  spark: 5,
  cost: 6,
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
  /** Source order for a static ability, creation order for a floating effect. */
  readonly order: number;
}

/** A static ability of a source in play, with its ordering keys. */
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

/**
 * Every static ability that applies now, in source order: each side's avatar
 * and dreamsigns (player first), then cards in play by instance number.
 */
function collectStatics(state: BattleState, catalog: EngineCatalog): StaticEntry[] {
  const entries: StaticEntry[] = [];
  const add = (source: AbilitySource, controller: Side, origin: AbilityOrigin, timestamp: number): void => {
    for (const ability of originAbilities(catalog, origin)) {
      if (ability.kind !== "static") continue;
      const continuous = primitiveDefinition(ability.effect.op).continuous;
      if (continuous === undefined) throw new Error(`A static ability holds ${ability.effect.op}, which is not continuous`);
      entries.push({ source, controller, node: ability.effect, layer: continuous.layer, timestamp, order: entries.length });
    }
  };
  for (const side of SIDES) {
    const { avatar, dreamsigns } = state.sides[side];
    if (avatar !== null) add({ kind: "avatar", side }, side, { kind: "avatar", id: avatar.id }, 0);
    dreamsigns.forEach((dreamsign, index) => {
      add({ kind: "dreamsign", side, index }, side, { kind: "dreamsign", id: dreamsign.id }, 0);
    });
  }
  const cards = SIDES.flatMap((side) => charactersInPlay(state, side)).sort((a, b) => instanceNumber(a) - instanceNumber(b));
  for (const id of cards) {
    const instance = state.instances[id];
    if (instance === undefined) continue;
    add(id, instance.controller, instanceOrigin(instance), instance.enteredZoneAt);
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

/** The card a change applies to, or `null` for a cost modifier. */
function changed(change: ContinuousChange): InstanceId | null {
  return change.kind === "cost" ? null : change.instance;
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
      ordered.push({ change, timestamp: effect.timestamp, effect: effect.id, order: index });
    });
    for (const entry of this.statics) {
      if (entry.layer !== layer) continue;
      for (const change of this.expand(entry)) {
        ordered.push({ change, timestamp: entry.timestamp, effect: null, order: entry.order });
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

  /** The changes a static ability makes now, read against the layers before its own. */
  private expand(entry: StaticEntry): readonly ContinuousChange[] {
    const { state, catalog } = this;
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
      value: (expr) =>
        evaluateValue(state, expr, {
          controller: entry.controller,
          source: entry.source,
          x: self === null ? null : (state.instances[self]?.status.x ?? null),
          count: (selector) => matchingCharactersWith(state, catalog, read, selector, entry.controller, entry.source).length,
        }),
    };
    const continuous = primitiveDefinition(entry.node.op).continuous;
    return continuous === undefined ? [] : continuous.changes(entry.node, env);
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
    const definition = printedCard(this.catalog, instance.printing);
    const keywords = new Set<Keyword>(definition.keywords);
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
        case "keyword":
          result = {
            ...result,
            keywords: change.gains
              ? [...result.keywords.filter((keyword) => keyword !== change.keyword), change.keyword]
              : result.keywords.filter((keyword) => keyword !== change.keyword),
          };
          break;
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
