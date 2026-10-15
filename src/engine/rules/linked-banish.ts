/** Source-object and acquired-ability identity for linked banishment (RD-hv-umm2.486-1). */
import type { AbilitySource, EffectId, InstanceId } from "../state/ids";
import type { AbilityOrigin, AbandonedNamedEntry, BattleState, LinkedBanishedCards, LinkedSourceContext, QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";
import { gainedGroupAbilities } from "./activation";

/** Acquired groups in the same order as the source's gained-ability mirror. */
export function sourceAbilityGroups(state: BattleState, source: InstanceId): EffectId[] {
  return state.floating.flatMap((effect) => effect.change.kind === "abilities" && effect.change.instance === source ? [effect.id] : []);
}

/**
 * A queued ability retains its contributing group's identity even after other groups expire.
 * A departure snapshot of the source's current play visit wins over its live groups: a dissolved
 * created card still says play when its ▸Dissolved abilities trigger, after its acquired groups
 * have already ended. A later visit of the same card is a new object and reads its live groups.
 */
export function linkedSourceContext(ctx: StepContext, source: AbilitySource, origin: AbilityOrigin, ability: number): LinkedSourceContext | null {
  if (typeof source !== "string" || origin.kind !== "card") return null;
  const instance = ctx.state.instances[source];
  const departed = ctx.departedSourceObjects.get(source);
  const current = instance?.zone !== "play" || departed?.enteredPlayAt === instance.enteredZoneAt
    ? departed
    : { enteredPlayAt: instance.enteredZoneAt, gained: sourceAbilityGroups(ctx.state, source) };
  if (current === undefined) return null;
  let base = ctx.catalog.variantCard(origin.cardId, origin.variant).abilities(origin.variant).length;
  if (ability < base) return { source, enteredPlayAt: current.enteredPlayAt, ability };
  for (const [index, group] of (origin.gained ?? []).entries()) {
    const length = gainedGroupAbilities(ctx.catalog, group).length;
    if (ability < base + length) {
      const gainedFrom = current.gained[index];
      if (gainedFrom === undefined) throw new Error("Linked ability has no acquired occurrence");
      return { source, enteredPlayAt: current.enteredPlayAt, gainedFrom, ability: ability - base };
    }
    base += length;
  }
  return null;
}

export function sameLinkedSource(a: LinkedSourceContext, b: LinkedSourceContext): boolean {
  return a.source === b.source && a.enteredPlayAt === b.enteredPlayAt && a.gainedFrom === b.gainedFrom;
}

/** Own retained fields can belong to a named observer's captured reader. */
function abandonedEntries(trigger: QueuedTrigger): AbandonedNamedEntry[] {
  const entries: AbandonedNamedEntry[] = [];
  for (let current: QueuedTrigger | undefined = trigger; current !== undefined; current = current.triggeringAbility?.occurrence) {
    entries.push(...current.abandonedNamed?.entries ?? []);
  }
  return entries;
}

/** Live cells and those still owed by queued abilities; inaccessible history has no rules meaning. */
export function liveLinkedBanished(state: BattleState, resolving?: LinkedSourceContext | null): LinkedBanishedCards[] {
  return (state.linkedBanished ?? []).flatMap((record) => {
    const instance = state.instances[record.source];
    const current = instance?.zone === "play" && instance.enteredZoneAt === record.enteredPlayAt &&
      (record.gainedFrom === undefined || sourceAbilityGroups(state, record.source).includes(record.gainedFrom));
    const owed = state.triggerQueue.some((trigger) => trigger.linkedSource !== undefined && sameLinkedSource(trigger.linkedSource, record) ||
      abandonedEntries(trigger).some(entry => entry.linkedSource !== undefined && sameLinkedSource(entry.linkedSource, record)));
    if (!current && !owed && (resolving === undefined || resolving === null || !sameLinkedSource(resolving, record))) return [];
    const cards = record.cards.filter(({ instance: id, enteredBanishedAt }) => {
      const card = state.instances[id];
      return card?.zone === "banished" && card.enteredZoneAt === enteredBanishedAt;
    });
    return cards.length === 0 ? [] : [{ ...record, cards }];
  });
}

/** Equality tokens describe source visits and acquisitions, never their monotonically increasing identifiers. */
export function linkedPosition(state: BattleState): { readonly linkedBanished: unknown[] | undefined; readonly triggerQueue: unknown[] } {
  const visits = new Map<InstanceId, Map<number, number>>();
  const acquisitions = new Map<EffectId, number>();
  const context = (value: LinkedSourceContext): unknown => {
    let sourceVisits = visits.get(value.source);
    if (sourceVisits === undefined) {
      sourceVisits = new Map();
      const current = state.instances[value.source];
      if (current?.zone === "play") sourceVisits.set(current.enteredZoneAt, 0);
      visits.set(value.source, sourceVisits);
    }
    let visit = sourceVisits.get(value.enteredPlayAt);
    if (visit === undefined) { visit = sourceVisits.size; sourceVisits.set(value.enteredPlayAt, visit); }
    const instance = state.instances[value.source];
    const current = instance?.zone === "play" && instance.enteredZoneAt === value.enteredPlayAt;
    let acquired: unknown = null;
    let acquiredSlot = -1;
    if (value.gainedFrom !== undefined) {
      acquiredSlot = sourceAbilityGroups(state, value.source).indexOf(value.gainedFrom);
      if (acquiredSlot >= 0) acquired = ["current", acquiredSlot];
      else {
        const token = acquisitions.get(value.gainedFrom) ?? acquisitions.size;
        acquisitions.set(value.gainedFrom, token);
        acquired = ["departed", token];
      }
    }
    return { source: value.source, visit, current, acquired, acquiredSlot, ability: value.ability };
  };
  // Queue order is semantic and provides a stable order for owed historical objects.
  for (const trigger of state.triggerQueue) {
    if (trigger.linkedSource !== undefined) context(trigger.linkedSource);
    for (const entry of abandonedEntries(trigger)) {
      context(entry.occurrence);
      if (entry.linkedSource !== undefined) context(entry.linkedSource);
    }
  }
  const linkedBanished = liveLinkedBanished(state).map((record) => ({ context: context(record), cards: record.cards.map(({ instance }) => instance) }))
    .sort((a, b) => { const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0; });
  const ownPosition = (trigger: QueuedTrigger): object => ({ ...trigger,
    ...(trigger.abandonedNamed === undefined ? {} : { abandonedNamed: { ...trigger.abandonedNamed,
      entries: trigger.abandonedNamed.entries.map(({ occurrence, linkedSource: linked, ...entry }) => ({
        ...entry, occurrence: context(occurrence), ...(linked === undefined ? {} : { linkedSource: context(linked) }),
      })),
    } }),
    ...(trigger.triggeringAbility === undefined ? {} : { triggeringAbility: { ...trigger.triggeringAbility,
      occurrence: ownPosition(trigger.triggeringAbility.occurrence),
    } }),
  });
  const triggerQueue = state.triggerQueue.map(trigger => ({ ...ownPosition(trigger),
    ...(trigger.linkedSource === undefined ? {} : { linkedSource: context(trigger.linkedSource) }),
  }));
  return { linkedBanished: linkedBanished.length === 0 ? undefined : linkedBanished, triggerQueue };
}
