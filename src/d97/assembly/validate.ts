// The act validator (Appendix B §B4 step 6, §B5): a pure check of an
// assembled act against its dreams' anchors and the act shape. Assembly
// (./assemble.ts) runs it on every attempt and retries with the next seed
// salt while it reports anything. Each finding names its code, the dream it is
// in (null for an act-wide finding) and the offending reference, a UUID
// wherever the reference is one. Codes:
//
//   door-anchor        a door end is not a door anchor on its dream's own
//                      map, or its dream is not one of the act's
//   door-reused        one door anchor ends two doors, or ends a door and is
//                      the exit door (anchor capacity)
//   town-door          a tree door does not lead into its dream's town door,
//                      or a door uses the entry dream's town door, where the
//                      run (or the previous act's exit) arrives (P33)
//   seat-anchor        a guardian or challenger seat is not an anchor of its
//                      kind in its dream, or two seats share an anchor
//   incarnation        the act has no incarnation seat, more than one, or one
//                      outside the incarnation dream
//   exit-door          the exit door is not the door the incarnation blocks
//   unreachable-dream  an act dream cannot be reached from the entry dream
//   chokepoint         a route from the entry dream to the incarnation passes
//                      fewer than `g` Avatar guardians (ref: the count)
//   avatar-guardians   the act seats fewer or more Avatar guardians than its
//                      shape allows (ref: the count)
//   quest-role         a quest role is bound outside the act's reachable
//                      dreams, or to an anchor its dream lacks (ref: the
//                      quest's UUID)
//
// The chokepoint rule's three guarantees map onto these: every route from the
// entry dream to the incarnation passes `g` Avatar guardians (`chokepoint`);
// every route out of the act passes its incarnation (`exit-door`,
// `door-reused`: no door but the exit door leaves the act, and the
// incarnation blocks it); every quest can be completed in dreams reachable
// without its own reward (`quest-role`: no quest reward opens a door, so
// every act dream reachable from the entry dream qualifies).

import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import type { D97DreamId, DreamAnchorId } from "../../types/identifiers";
import type { D97Act, D97ActAnchor, D97ActShape, D97DoorEnd, D97DoorLink, D97GuardianSeat } from "./types";

export type D97ActFindingCode =
  | "door-anchor"
  | "door-reused"
  | "town-door"
  | "seat-anchor"
  | "incarnation"
  | "exit-door"
  | "unreachable-dream"
  | "chokepoint"
  | "avatar-guardians"
  | "quest-role";

export interface D97ActFinding {
  readonly code: D97ActFindingCode;
  readonly dreamId: D97DreamId | null;
  readonly ref: string;
}

/** One of the act's dreams as the validator reads it: its module and its maps' anchors. */
export interface D97ActDreamAnchors {
  readonly dream: D97DreamDefinition;
  readonly anchors: readonly D97ActAnchor[];
}

/** The door a dream's run (or the previous act's exit) arrives through: its town door. */
export function townDoorOf(dream: D97DreamDefinition): DreamAnchorId {
  return dream.town?.doorAnchorId ?? dream.topology.arrivalDoorAnchorId;
}

/** Whether a guardian seat holds an Avatar guardian. */
export function isAvatarGuardian(seat: D97GuardianSeat): boolean {
  return seat.seat === "chokepoint" || seat.seat === "optional";
}

const endKey = (end: D97DoorEnd): string => `${end.dreamId}/${end.anchorId}`;

/** The route graph of an act: its dreams joined by its doors, with the guardian blocking each door end. */
export interface D97ActRoutes {
  readonly entryDreamId: D97DreamId;
  readonly dreamIds: readonly D97DreamId[];
  readonly doors: readonly D97DoorLink[];
  /** The guardian anchor blocking a door end, if any. */
  readonly guardOf: (end: D97DoorEnd) => DreamAnchorId | null;
  /** Whether the guardian anchor `anchorId` of `dreamId` holds an Avatar guardian. */
  readonly avatarGuarded: (dreamId: D97DreamId, anchorId: DreamAnchorId) => boolean;
}

/** The route graph of `act`-shaped data over its dreams' anchors. */
export function actRoutes(
  act: Pick<D97Act, "entryDreamId" | "dreamIds" | "doors" | "guardians">,
  dreams: ReadonlyMap<D97DreamId, D97ActDreamAnchors>,
): D97ActRoutes {
  const guards = new Map<string, DreamAnchorId>();
  for (const [dreamId, { anchors }] of dreams) {
    for (const anchor of anchors) {
      if (anchor.kind === "guardian" && anchor.blocksDoor !== undefined) guards.set(endKey({ dreamId, anchorId: anchor.blocksDoor }), anchor.id);
    }
  }
  const avatar = new Set(act.guardians.filter(isAvatarGuardian).map((seat) => endKey(seat)));
  return {
    entryDreamId: act.entryDreamId,
    dreamIds: act.dreamIds,
    doors: act.doors,
    guardOf: (end) => guards.get(endKey(end)) ?? null,
    avatarGuarded: (dreamId, anchorId) => avatar.has(endKey({ dreamId, anchorId })),
  };
}

/** The Avatar guardians a traveller passes through `door`'s two ends. */
function doorCost(routes: D97ActRoutes, door: D97DoorLink): number {
  let cost = 0;
  for (const end of [door.from, door.to]) {
    const guard = routes.guardOf(end);
    if (guard !== null && routes.avatarGuarded(end.dreamId, guard)) cost += 1;
  }
  return cost;
}

/**
 * The route from the entry dream to `targetDreamId` passing the fewest
 * Avatar guardians, as its doors in order, with that count; null when no
 * route reaches it.
 */
export function fewestGuardiansRoute(
  routes: D97ActRoutes,
  targetDreamId: D97DreamId,
): { readonly count: number; readonly doors: readonly D97DoorLink[] } | null {
  const best = new Map<D97DreamId, { count: number; doors: D97DoorLink[] }>([[routes.entryDreamId, { count: 0, doors: [] }]]);
  const settled = new Set<D97DreamId>();
  for (;;) {
    let next: D97DreamId | null = null;
    for (const [dreamId, route] of best) {
      if (!settled.has(dreamId) && (next === null || route.count < (best.get(next)?.count ?? Infinity))) next = dreamId;
    }
    if (next === null) return null;
    const here = best.get(next);
    if (here === undefined) return null;
    if (next === targetDreamId) return here;
    settled.add(next);
    for (const door of routes.doors) {
      const other = door.from.dreamId === next ? door.to.dreamId : door.to.dreamId === next ? door.from.dreamId : null;
      if (other === null || settled.has(other)) continue;
      const count = here.count + doorCost(routes, door);
      if (count < (best.get(other)?.count ?? Infinity)) best.set(other, { count, doors: [...here.doors, door] });
    }
  }
}

/** The act dreams reachable from the entry dream through its doors, guardians aside. */
export function reachableDreams(routes: Pick<D97ActRoutes, "entryDreamId" | "doors">): Set<D97DreamId> {
  const reached = new Set([routes.entryDreamId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { from, to } of routes.doors) {
      for (const [here, there] of [[from.dreamId, to.dreamId], [to.dreamId, from.dreamId]] as const) {
        if (reached.has(here) && !reached.has(there)) {
          reached.add(there);
          grew = true;
        }
      }
    }
  }
  return reached;
}

/** Every finding over `act` against its dreams' anchors and `shape`; none means valid. */
export function validateAct(act: D97Act, dreams: ReadonlyMap<D97DreamId, D97ActDreamAnchors>, shape: D97ActShape): D97ActFinding[] {
  const findings: D97ActFinding[] = [];
  const report = (code: D97ActFindingCode, dreamId: D97DreamId | null, ref: string) => findings.push({ code, dreamId, ref });
  const inAct = new Set(act.dreamIds);
  const anchorOf = (dreamId: D97DreamId, anchorId: DreamAnchorId) =>
    inAct.has(dreamId) ? dreams.get(dreamId)?.anchors.find((anchor) => anchor.id === anchorId) : undefined;

  const used = new Set<string>();
  const useDoor = (end: D97DoorEnd) => {
    const anchor = anchorOf(end.dreamId, end.anchorId);
    if (anchor?.kind !== "door" || anchor.roomId !== null) report("door-anchor", end.dreamId, end.anchorId);
    if (used.has(endKey(end))) report("door-reused", end.dreamId, end.anchorId);
    used.add(endKey(end));
  };
  const entry = dreams.get(act.entryDreamId)?.dream;
  const entryTown = entry === undefined ? null : townDoorOf(entry);
  for (const door of act.doors) {
    useDoor(door.from);
    useDoor(door.to);
    const into = dreams.get(door.to.dreamId)?.dream;
    if (door.kind === "tree" && (into === undefined || townDoorOf(into) !== door.to.anchorId)) report("town-door", door.to.dreamId, door.to.anchorId);
    for (const end of [door.from, door.to]) {
      if (end.dreamId === act.entryDreamId && end.anchorId === entryTown) report("town-door", end.dreamId, end.anchorId);
    }
  }
  useDoor(act.exitDoor);

  const seated = new Set<string>();
  const seat = (dreamId: D97DreamId, anchorId: DreamAnchorId, kind: "guardian" | "challenger") => {
    if (anchorOf(dreamId, anchorId)?.kind !== kind || seated.has(endKey({ dreamId, anchorId }))) report("seat-anchor", dreamId, anchorId);
    seated.add(endKey({ dreamId, anchorId }));
  };
  for (const guardian of act.guardians) seat(guardian.dreamId, guardian.anchorId, "guardian");
  for (const challenger of act.challengers) seat(challenger.dreamId, challenger.anchorId, "challenger");

  const incarnations = act.guardians.filter((guardian) => guardian.seat === "incarnation");
  const incarnation = incarnations[0];
  if (incarnations.length !== 1 || incarnation === undefined || incarnation.dreamId !== act.incarnationDreamId) {
    report("incarnation", act.incarnationDreamId, act.incarnationDreamId);
  } else {
    const blocks = anchorOf(incarnation.dreamId, incarnation.anchorId)?.blocksDoor;
    if (act.exitDoor.dreamId !== incarnation.dreamId || blocks !== act.exitDoor.anchorId) report("exit-door", act.exitDoor.dreamId, act.exitDoor.anchorId);
  }

  const routes = actRoutes(act, dreams);
  const reachable = reachableDreams(routes);
  for (const dreamId of act.dreamIds) if (!reachable.has(dreamId)) report("unreachable-dream", dreamId, dreamId);
  const route = fewestGuardiansRoute(routes, act.incarnationDreamId);
  if (route !== null && route.count < shape.chokepointGuardians) report("chokepoint", act.incarnationDreamId, String(route.count));
  const avatarGuardians = act.guardians.filter(isAvatarGuardian).length;
  if (avatarGuardians < shape.avatarGuardians.min || avatarGuardians > shape.avatarGuardians.max) report("avatar-guardians", null, String(avatarGuardians));

  for (const quest of act.quests) {
    const stranded = quest.roles.some((role) => !reachable.has(role.dreamId) || anchorOf(role.dreamId, role.anchorId) === undefined);
    if (stranded) report("quest-role", null, quest.questId);
  }
  return findings;
}
