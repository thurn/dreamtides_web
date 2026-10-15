/** Fixed-size first-occasion facts, independent of watching sources. */
import type { EngineCatalog } from "../catalog";
import { isNamedTrigger } from "../dsl/abilities";
import { resolvePlayer } from "../dsl/selectors";
import type { NamedTrigger, Trigger } from "../dsl/types";
import { sourcePrivacy, seenSource } from "../events/sources";
import type { AbilitySource, Side } from "../state/ids";
import { SIDES } from "../state/ids";
import type { AbilityOrigin, BattleState, FirstOccurrences, QueuedTrigger } from "../state/types";
import { triggerBody } from "./body";

type Context = { readonly state: BattleState; readonly catalog: EngineCatalog };
const emptyNamed = (): Record<Side, NamedTrigger[]> => ({ player: [], enemy: [] });
function facts(state: BattleState): FirstOccurrences {
  return state.turnLog.firstOccurrences ??= {
    handEmptied: { player: false, enemy: false }, named: emptyNamed(),
    known: { player: emptyNamed(), enemy: emptyNamed() },
  };
}
function categories(trigger: Trigger): NamedTrigger[] {
  return [...new Set(trigger.on === "either" ? trigger.triggers.flatMap(categories) : isNamedTrigger(trigger.on) ? [trigger.on] : [])];
}
function add(set: NamedTrigger[], named: NamedTrigger): void {
  if (!set.includes(named)) set.push(named);
}
function sourceObserved(state: BattleState, source: AbilitySource, viewer: Side): boolean {
  const privacy = sourcePrivacy(source, state);
  return (privacy === null || privacy === viewer) && seenSource(source, viewer, state) !== null;
}
/** The same historical-definition audience as the queued view, without an identity projection. */
function originObserved(state: BattleState, queued: QueuedTrigger, viewer: Side): boolean {
  if (queued.historyHiddenFrom?.includes(viewer) === true) return false;
  const audience = queued.repeated?.observedBy ?? queued.triggeringAbility?.readerObservedBy;
  return audience === undefined ? sourceObserved(state, queued.source, viewer) : audience.includes(viewer) &&
    (queued.repeated === undefined || queued.repeated.visibleTo.includes(viewer) || sourceObserved(state, queued.source, viewer));
}
function learn(state: BattleState, controller: Side, named: NamedTrigger, viewers: readonly Side[]): void {
  const progress = facts(state);
  add(progress.named[controller], named);
  for (const viewer of viewers) add(progress.known[viewer][controller], named);
}

/** Public positive-to-zero events consume their occasion before any watching ability checks. */
export function recordFirstHandEmpty(state: BattleState, side: Side): boolean {
  const progress = facts(state), first = !progress.handEmptied[side];
  progress.handEmptied[side] = true;
  return first;
}

/** Called once after actual queue admission, including when no observer currently exists. */
export function recordFirstNamedAdmission(ctx: Context, queued: QueuedTrigger, descriptor: Trigger): readonly NamedTrigger[] {
  const names = categories(descriptor);
  if (names.length === 0) return [];
  const progress = facts(ctx.state), first = names.filter(named => !progress.named[queued.controller].includes(named));
  const viewers = SIDES.filter(viewer => originObserved(ctx.state, queued, viewer));
  for (const named of names) learn(ctx.state, queued.controller, named, viewers);
  return first;
}

/**
 * Learn only classifications a queued historical definition or visible repeated
 * instruction proves. A mixed observer descriptor does not identify its branch.
 */
export function observeFirstOccurrences(
  ctx: Context,
  queued: readonly QueuedTrigger[],
  observed: (ctx: Context, source: AbilitySource, viewer: Side) => boolean,
  present: (catalog: EngineCatalog, origin: AbilityOrigin) => boolean,
): void {
  for (const entry of queued) {
    if (entry.kind !== undefined || !present(ctx.catalog, entry.origin)) continue;
    const viewers = SIDES.filter(viewer => originObserved(ctx.state, entry, viewer));
    const instructions = SIDES.filter(viewer => entry.repeated?.visibleTo.includes(viewer) === true);
    if (viewers.length === 0 && instructions.length === 0) continue;
    const { trigger } = triggerBody(ctx.catalog, entry.origin, entry.ability, entry.node);
    for (const named of categories(trigger)) learn(ctx.state, entry.controller, named, viewers);
    if (entry.repeated !== undefined) learn(ctx.state, entry.controller, entry.repeated.named, instructions);
    if (trigger.on === "namedAbilityTriggered") {
      learn(ctx.state, resolvePlayer(entry.controller, trigger.player), trigger.named, viewers);
    }
    // The captured cause is an actual branch witness even for a combined observer.
    if (entry.triggeringAbility !== undefined) {
      const cause = entry.triggeringAbility;
      const readers = viewers.filter(viewer => observed(ctx, entry.source, viewer));
      learn(ctx.state, cause.occurrence.controller, cause.named, readers);
    }
  }
}

/** Recovery observes committed facts through a private copy, never the caller's records. */
export function copyFirstOccurrences(value: FirstOccurrences): FirstOccurrences {
  const copy = (sets: Record<Side, NamedTrigger[]>): Record<Side, NamedTrigger[]> => ({ player: [...sets.player], enemy: [...sets.enemy] });
  return { handEmptied: { ...value.handEmptied }, named: copy(value.named),
    known: { player: copy(value.known.player), enemy: copy(value.known.enemy) } };
}
