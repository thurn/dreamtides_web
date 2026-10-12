/**
 * The announced-change invariant (engine-design § Presentation): the
 * battle screen presents and logs only what events say, so every card a
 * step creates, removes, moves to another zone, rank slot, or controller, or
 * whose status changes, and every floating or payable effect that begins or
 * ends, is named by an event the step publishes. A card change in a public
 * zone (into, out of, or within the stack, play, a void, or the Banished
 * zone) is named by an event each side may see, perhaps with fields
 * redacted (`eventSeenBy`); a change hidden from a side, such as a card
 * created in the other side's hand, needs only the event its owner sees. A
 * status a floating change mirrors (`gainedAbilities`, `lostAbilities`) is
 * named by the `effectStarted` or `effectEnded` event of an effect changing
 * that card, which each side that sees the card must see.
 *
 * One rules change is announced by its phase instead: the Ending readies
 * every exhausted character (rules § Exhaust and Awaken) in its cleanup,
 * which runs in the step that publishes `phaseChanged` for it or, when "at
 * end of turn" abilities triggered, in the step that ends the cleanup's wait
 * (`turn.endingCleanup`).
 */
import { eventSeenBy, type EngineEvent } from "../events";
import { changedInstance } from "../rules/floating";
import { SIDES, type InstanceId, type Zone } from "../state/ids";
import type { BattleState, CardInstance } from "../state/types";
import { strings } from "./redaction";

/** Zones whose cards both sides see. */
const PUBLIC_ZONES: readonly Zone[] = ["stack", "play", "void", "banished"];

/** A card's rank slot in play, or empty elsewhere. */
function slotOf(state: BattleState, { zone, controller, id }: CardInstance): string {
  const held = state.sides[controller];
  return zone === "play" ? `back${String(held.backRank.indexOf(id))}:front${String(held.frontRank.indexOf(id))}` : "";
}

/** Where a card is and its status: zone, controller, rank slot in play, and status fields; `gone` once it ceased to exist. */
function placeOf(state: BattleState, instance: CardInstance | undefined, status = instance?.status): string {
  if (instance === undefined) return "gone";
  return JSON.stringify([instance.zone, instance.controller, slotOf(state, instance), status]);
}

/** Whether a card is where it was with the same status: the common case, checked without building its place. */
function unchanged(before: BattleState, was: CardInstance | undefined, after: BattleState, is: CardInstance | undefined): boolean {
  if (was === undefined || is === undefined) return was === is;
  if (was.zone !== is.zone || was.controller !== is.controller || slotOf(before, was) !== slotOf(after, is)) return false;
  const status = is.status as unknown as Readonly<Record<string, unknown>>;
  // An optional status field (`gainedAbilities`, `lostAbilities`) that appears is a change too.
  return Object.keys(status).length === Object.keys(was.status).length && Object.entries(was.status).every(([field, value]) => status[field] === value);
}

/** A status without the fields floating changes mirror. */
function unmirrored(status: CardInstance["status"]): CardInstance["status"] {
  const { gainedAbilities: _gained, lostAbilities: _lost, ...rest } = status;
  return rest;
}

/** The card the floating effect an `effectStarted` or `effectEnded` event names changes, or `null`. */
function changesCard(event: EngineEvent, before: BattleState, after: BattleState): InstanceId | null {
  if (event.kind !== "effectStarted" && event.kind !== "effectEnded") return null;
  const effect = before.floating.find(({ id }) => id === event.effect) ?? after.floating.find(({ id }) => id === event.effect);
  return effect === undefined ? null : changedInstance(effect.change);
}

/** Whether a card's only change is the Ending's readying, in a step that changed phase or ran the waiting Ending cleanup. */
function readiedByPhase(events: readonly EngineEvent[], before: BattleState, after: BattleState, id: InstanceId): boolean {
  const was = before.instances[id];
  const is = after.instances[id];
  return (
    was?.zone === "play" &&
    is !== undefined &&
    was.status.exhausted &&
    !is.status.exhausted &&
    (events.some((event) => event.kind === "phaseChanged") || (before.turn.endingCleanup === true && after.turn.endingCleanup === undefined)) &&
    placeOf(before, was, { ...was.status, exhausted: false }) === placeOf(after, is)
  );
}

/**
 * The changes from `before` to `after` that no event in `events` names
 * (or, for a card change in a public zone, that no event a side may see
 * names), as one description each.
 */
export function unannouncedChanges(events: readonly EngineEvent[], before: BattleState, after: BattleState): string[] {
  let names: readonly Set<string>[] | null = null;
  const named = () => (names ??= events.map((event) => strings(event)));
  const problems: string[] = [];
  const ids = new Set([...Object.keys(before.instances), ...Object.keys(after.instances)] as InstanceId[]);
  for (const id of ids) {
    const was = before.instances[id];
    const is = after.instances[id];
    if (unchanged(before, was, after, is)) continue;
    const from = placeOf(before, was);
    const to = placeOf(after, is);
    if (from === to || readiedByPhase(events, before, after, id)) continue;
    const mirrorOnly = was !== undefined && is !== undefined && placeOf(before, was, unmirrored(was.status)) === placeOf(after, is, unmirrored(is.status));
    // A mirrored status is announced by the start or end of the effect that changes it, which each side that
    // sees the card must see too.
    const naming = events.filter((event, index) => named()[index]?.has(id) === true || (mirrorOnly && changesCard(event, before, after) === id));
    if (naming.length === 0) {
      problems.push(`${id} changed from ${from} to ${to} with no event naming it`);
      continue;
    }
    const isPublic = (instance: CardInstance | undefined) => instance !== undefined && PUBLIC_ZONES.includes(instance.zone);
    if (!isPublic(was) && !isPublic(is)) continue;
    for (const side of SIDES) {
      if (!naming.some((event) => eventSeenBy(event, side, after) !== null)) {
        problems.push(`${id} changed from ${from} to ${to} in a public zone with no event ${side} sees naming it`);
      }
    }
  }
  for (const list of ["floating", "payable"] as const) {
    const was = new Set(before[list].map((effect) => effect.id));
    const is = new Set(after[list].map((effect) => effect.id));
    const changed = [...[...was].filter((effect) => !is.has(effect)), ...[...is].filter((effect) => !was.has(effect))];
    for (const id of changed) {
      if (!named().some((found) => found.has(id))) {
        problems.push(`${list} effect ${id} ${was.has(id) ? "ended" : "began"} with no event naming it`);
      }
    }
  }
  return problems;
}
