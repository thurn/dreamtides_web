// Load-time reconciliation of a D97 save against the current catalog
// (decision P5). Every catalog reference in a snapshot is a UUID; each one
// that no longer resolves is repaired and reported:
//
// - a retired card maps to its replacement through the committed retirement
//   table; an owned copy of a retired card without one is removed and
//   compensated in Essence, and other references to it are dropped;
// - a run whose dream was removed moves to the catalog's default dream;
// - an encounter or shop whose anchor is on no dream's map moves to a free
//   anchor of the same kind, the run's dream first, or is dropped when none
//   is free; a battle's return anchor and active waypoints on removed anchors
//   are forgotten;
// - the last place on a removed anchor, or in a room the dream no longer
//   has, moves to the run's dream's arrival door, its town door (decision
//   P33), so the player arrives in town; it is forgotten only when the
//   dream's arrival door is itself on no map;
// - anchors inside a dream's rooms (decision P19) are the dream's, so they
//   resolve and move like any other; the last place follows its room's door
//   when that door's anchor changed and records the room its anchor stands
//   in now; the anchor a battle returns the player beside is dropped when it
//   is not on the last place's map;
// - a held quest whose definition was removed is abandoned;
// - a run without an assembled act (a save from before act assembly) is
//   given the one-dream act of its dream (`preAssemblySave`), and a run whose
//   act no longer resolves (its dream is not in it, or one of its dreams, or
//   an anchor its doors, seats or quest bindings name, is gone) has it
//   replaced by that one-dream act; both are logged.
//
// New tunables need no repair: they apply going forward.

import type { D97SaveTuning } from "../../content/d97/save";
import type { D97Encounter, D97Place, D97Run, D97Shop, D97State } from "../../rules/d97/d97-state";
import type { CardId } from "../../types/card-identity";
import type { AvatarId, D97ActId, D97DreamId, D97OwnedCopyId, D97QuestId, D97RoomId, D97RunSeed, DreamAnchorId } from "../../types/identifiers";
import type { D97Act } from "../assembly/types";
import type { D97RewardBags } from "../collection/types";
import type { DreamAnchorKind } from "../map/definition";
import type { D97Snapshot } from "./snapshot";

/** One anchor of a dream's maps. */
export interface D97SaveAnchor {
  readonly id: DreamAnchorId;
  readonly kind: DreamAnchorKind;
  /** The room it stands in, or null on the dream's own map. */
  readonly roomId: D97RoomId | null;
}

/** One room of a dream and the door a reload inside it places the player at. */
export interface D97SaveRoom {
  readonly id: D97RoomId;
  readonly doorAnchorId: DreamAnchorId;
}

/** One dream module of the current catalog, its maps' anchors and its rooms. */
export interface D97SaveDream {
  readonly id: D97DreamId;
  readonly anchors: readonly D97SaveAnchor[];
  readonly rooms: readonly D97SaveRoom[];
  /** The door a run that has not travelled arrives at: the dream's town door. */
  readonly arrivalDoorAnchorId: DreamAnchorId;
}

/** The current catalog a save reconciles against. */
export interface D97SaveCatalog {
  /** Whether a card UUID is in the current card catalog. */
  readonly hasCard: (cardId: CardId) => boolean;
  /** Every dream module a run may be in, with its map's anchors. */
  readonly dreams: readonly D97SaveDream[];
  /** The dream a run whose dream was removed moves to. */
  readonly defaultDreamId: D97DreamId;
  readonly questIds: ReadonlySet<D97QuestId>;
  /** The one-dream act of `dreamId` for a run of `runSeed` (`preAssemblySave`), or null for an unknown dream. */
  readonly oneDreamAct: (dreamId: D97DreamId, runSeed: D97RunSeed) => D97Act | null;
}

/** One repair, logged with UUIDs. */
export type D97Reconciliation =
  | { readonly kind: "cardReplaced"; readonly where: string; readonly cardId: CardId; readonly replacementId: CardId }
  | { readonly kind: "cardCompensated"; readonly copyId: D97OwnedCopyId; readonly cardId: CardId; readonly essence: number }
  | { readonly kind: "cardDropped"; readonly where: string; readonly cardId: CardId }
  | { readonly kind: "anchorMoved"; readonly where: string; readonly anchorId: DreamAnchorId; readonly toAnchorId: DreamAnchorId }
  | { readonly kind: "anchorDropped"; readonly where: string; readonly anchorId: DreamAnchorId }
  | { readonly kind: "dreamMoved"; readonly dreamId: D97DreamId | null; readonly toDreamId: D97DreamId }
  | { readonly kind: "roomRemoved"; readonly roomId: D97RoomId }
  | { readonly kind: "placeRoomChanged"; readonly anchorId: DreamAnchorId; readonly roomId: D97RoomId | null; readonly toRoomId: D97RoomId | null }
  | { readonly kind: "questAbandoned"; readonly questId: D97QuestId }
  | { readonly kind: "actAssembled"; readonly actId: D97ActId; readonly dreamId: D97DreamId }
  | { readonly kind: "actReplaced"; readonly actId: D97ActId; readonly toActId: D97ActId; readonly dreamId: D97DreamId };

type CardFate = { readonly kind: "keep" } | { readonly kind: "replace"; readonly to: CardId } | { readonly kind: "retire" };

class Reconciler {
  readonly log: D97Reconciliation[] = [];
  private readonly replacements: ReadonlyMap<CardId, CardId | null>;
  /** Every dream's anchors. */
  private readonly known: ReadonlySet<DreamAnchorId>;
  /** Every anchor, the run's dream's first: where a removed anchor's record moves. */
  private candidates: readonly D97SaveAnchor[] = [];
  /** The run's dream's rooms. */
  private rooms: readonly D97SaveRoom[] = [];
  /** The room each of the run's dream's anchors stands in. */
  private anchorRooms: ReadonlyMap<DreamAnchorId, D97RoomId | null> = new Map();
  /** The run's dream's arrival door, where a last place on a removed anchor moves. */
  private arrivalDoorAnchorId: DreamAnchorId | null = null;

  constructor(
    private readonly catalog: D97SaveCatalog,
    private readonly tuning: D97SaveTuning,
  ) {
    this.replacements = new Map(tuning.retirements.map((entry) => [entry.cardId, entry.replacementId]));
    this.known = new Set(catalog.dreams.flatMap((dream) => dream.anchors.map((anchor) => anchor.id)));
  }

  /** The run's dream, moved to the default dream when no dream module names it. */
  private dream(dreamId: D97DreamId | undefined): D97DreamId {
    const dreams = this.catalog.dreams;
    if (dreamId !== undefined && dreams.some((dream) => dream.id === dreamId)) return dreamId;
    const toDreamId = this.catalog.defaultDreamId;
    this.log.push({ kind: "dreamMoved", dreamId: dreamId ?? null, toDreamId });
    return toDreamId;
  }

  fate(cardId: CardId): CardFate {
    if (this.catalog.hasCard(cardId)) return { kind: "keep" };
    const replacement = this.replacements.get(cardId);
    return replacement !== undefined && replacement !== null && this.catalog.hasCard(replacement)
      ? { kind: "replace", to: replacement }
      : { kind: "retire" };
  }

  /** A card reference, replaced or dropped (null). */
  card(cardId: CardId, where: string): CardId | null {
    const fate = this.fate(cardId);
    if (fate.kind === "keep") return cardId;
    if (fate.kind === "replace") {
      this.log.push({ kind: "cardReplaced", where, cardId, replacementId: fate.to });
      return fate.to;
    }
    this.log.push({ kind: "cardDropped", where, cardId });
    return null;
  }

  cards(cardIds: readonly CardId[], where: string): CardId[] {
    return cardIds.flatMap((cardId) => {
      const next = this.card(cardId, where);
      return next === null ? [] : [next];
    });
  }

  run(run: D97Run): D97Run {
    // A save from before runs recorded their dream has none.
    const dreamId = this.dream((run as Partial<D97Run>).dreamId);
    const own = this.catalog.dreams.filter((dream) => dream.id === dreamId);
    const others = this.catalog.dreams.filter((dream) => dream.id !== dreamId);
    this.candidates = [...own, ...others].flatMap((dream) => dream.anchors);
    this.rooms = own.flatMap((dream) => dream.rooms);
    this.anchorRooms = new Map(own.flatMap((dream) => dream.anchors.map((anchor) => [anchor.id, anchor.roomId] as const)));
    this.arrivalDoorAnchorId = own[0]?.arrivalDoorAnchorId ?? null;
    let essence = run.essence;
    const copies = run.collection.copies.flatMap((copy) => {
      const fate = this.fate(copy.cardId);
      if (fate.kind === "keep") return [copy];
      if (fate.kind === "replace") {
        this.log.push({ kind: "cardReplaced", where: "collection", cardId: copy.cardId, replacementId: fate.to });
        return [{ ...copy, cardId: fate.to }];
      }
      essence += this.tuning.retiredCardEssence;
      this.log.push({ kind: "cardCompensated", copyId: copy.copyId, cardId: copy.cardId, essence: this.tuning.retiredCardEssence });
      return [];
    });
    const quests = run.quests;
    const pending = quests.pendingReward;
    const lastPlace = this.lastPlace(run.lastPlace);
    return {
      ...run,
      dreamId,
      acts: this.acts(run.acts, dreamId, run.runSeed),
      essence,
      collection: { ...run.collection, copies },
      bags: { ...run.bags, drawn: this.drawn(run.bags.drawn) },
      encounters: this.anchored(run.encounters, (encounter) => (encounter.role === "guardian" ? "guardian" : "challenger"), "encounter", (encounter, anchorId) => this.encounter({ ...encounter, anchorId })),
      shops: this.anchored(run.shops, () => "shop", "shop", (shop) => this.shop(shop)),
      returnAnchorId: this.returnAnchor(run.returnAnchorId, lastPlace),
      lastPlace,
      activeWaypointIds: run.activeWaypointIds.filter((anchorId) => this.place(anchorId, "waypoint") !== null),
      quests: {
        ...quests,
        active: quests.active === null || this.catalog.questIds.has(quests.active.questId) ? quests.active : this.abandon(quests.active.questId),
        pendingReward: pending === null ? null : { ...pending, cardIds: this.cards(pending.cardIds, "questReward") },
      },
    };
  }

  /**
   * The run's acts: kept while they resolve against the catalog, otherwise
   * (none, or one that no longer resolves) the one-dream act of its dream.
   */
  private acts(acts: readonly D97Act[], dreamId: D97DreamId, runSeed: D97RunSeed): readonly D97Act[] {
    if (acts.length > 0 && this.actsResolve(acts, dreamId)) return acts;
    const act = this.catalog.oneDreamAct(dreamId, runSeed);
    if (act === null) return acts;
    const replaced = acts[0];
    this.log.push(
      replaced === undefined
        ? { kind: "actAssembled", actId: act.actId, dreamId }
        : { kind: "actReplaced", actId: replaced.actId, toActId: act.actId, dreamId },
    );
    return [act];
  }

  /** Whether some act holds the run's dream and every dream and anchor each act names is in the catalog. */
  private actsResolve(acts: readonly D97Act[], dreamId: D97DreamId): boolean {
    const anchors = new Map(this.catalog.dreams.map((dream) => [dream.id, new Set(dream.anchors.map((anchor) => anchor.id))]));
    const has = ({ dreamId: at, anchorId }: { readonly dreamId: D97DreamId; readonly anchorId: DreamAnchorId }) => anchors.get(at)?.has(anchorId) === true;
    return (
      acts.some((act) => act.dreamIds.includes(dreamId)) &&
      acts.every(
        (act) =>
          act.dreamIds.every((id) => anchors.has(id)) &&
          act.doors.every((door) => has(door.from) && has(door.to)) &&
          has(act.exitDoor) &&
          act.guardians.every(has) &&
          act.challengers.every(has) &&
          act.quests.every((quest) => quest.roles.every(has)),
      )
    );
  }

  /** Each bag's draw counts, a replaced card's merged into its replacement's. */
  private drawn(drawn: D97RewardBags["drawn"]): D97RewardBags["drawn"] {
    const next: Partial<Record<AvatarId, Partial<Record<CardId, number>>>> = {};
    for (const [avatarId, cards] of Object.entries(drawn) as [AvatarId, Partial<Record<CardId, number>> | undefined][]) {
      const counts: Partial<Record<CardId, number>> = {};
      for (const [cardId, count] of Object.entries(cards ?? {}) as [CardId, number | undefined][]) {
        const kept = this.card(cardId, "bag");
        if (kept !== null && count !== undefined) counts[kept] = (counts[kept] ?? 0) + count;
      }
      next[avatarId] = Object.fromEntries(Object.entries(counts).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
    }
    return next;
  }

  private abandon(questId: D97QuestId): null {
    this.log.push({ kind: "questAbandoned", questId });
    return null;
  }

  private encounter(encounter: D97Encounter): D97Encounter {
    return {
      ...encounter,
      deck: this.cards(encounter.deck, "encounterDeck"),
      draftPool: this.cards(encounter.draftPool, "encounterPool"),
      signatureCardIds: this.cards(encounter.signatureCardIds, "encounterSignature"),
      opponentAnteCardId: encounter.opponentAnteCardId === null ? null : this.card(encounter.opponentAnteCardId, "encounterAnte"),
    };
  }

  private shop(shop: D97Shop): D97Shop {
    return {
      ...shop,
      slots: shop.slots.flatMap((slot) => {
        const cardId = this.card(slot.cardId, "shopSlot");
        return cardId === null ? [] : [{ ...slot, cardId }];
      }),
    };
  }

  /** The room `anchorId` stands in among the run's dream's anchors; null on its map or elsewhere. */
  private roomOf(anchorId: DreamAnchorId): D97RoomId | null {
    return this.anchorRooms.get(anchorId) ?? null;
  }

  /**
   * The run's last place: in a room the dream still has, at that room's door;
   * at the dream's arrival door when its room or its anchor is gone; in the
   * room its anchor stands in now.
   */
  private lastPlace(place: D97Place | null): D97Place | null {
    if (place === null) return null;
    let { anchorId } = place;
    if (place.roomId !== null) {
      const room = this.rooms.find((candidate) => candidate.id === place.roomId);
      if (room === undefined) {
        this.log.push({ kind: "roomRemoved", roomId: place.roomId });
        return this.arrive(anchorId);
      }
      if (room.doorAnchorId !== anchorId) {
        this.log.push({ kind: "anchorMoved", where: "lastPlace", anchorId, toAnchorId: room.doorAnchorId });
        anchorId = room.doorAnchorId;
      }
    }
    if (!this.known.has(anchorId)) return this.arrive(anchorId);
    const roomId = this.roomOf(anchorId);
    if (roomId !== place.roomId) this.log.push({ kind: "placeRoomChanged", anchorId, roomId: place.roomId, toRoomId: roomId });
    return { ...place, anchorId, roomId };
  }

  /**
   * A last place on `anchorId`, which is gone, moved to the run's dream's
   * arrival door; forgotten when that door is on no map either.
   */
  private arrive(anchorId: DreamAnchorId): D97Place | null {
    const toAnchorId = this.arrivalDoorAnchorId;
    if (toAnchorId === null || !this.known.has(toAnchorId)) {
      this.log.push({ kind: "anchorDropped", where: "lastPlace", anchorId });
      return null;
    }
    this.log.push({ kind: "anchorMoved", where: "lastPlace", anchorId, toAnchorId });
    return { kind: "door", anchorId: toAnchorId, roomId: this.roomOf(toAnchorId) };
  }

  /** The anchor a battle returns the player beside: dropped when removed or off the last place's map. */
  private returnAnchor(anchorId: DreamAnchorId | null, lastPlace: D97Place | null): DreamAnchorId | null {
    const kept = this.place(anchorId, "returnAnchor");
    if (kept === null || this.roomOf(kept) === (lastPlace?.roomId ?? null)) return kept;
    this.log.push({ kind: "anchorDropped", where: "returnAnchor", anchorId: kept });
    return null;
  }

  private place(anchorId: DreamAnchorId | null, where: string): DreamAnchorId | null {
    if (anchorId === null || this.known.has(anchorId)) return anchorId;
    this.log.push({ kind: "anchorDropped", where, anchorId });
    return null;
  }

  /** Records keyed by anchor, moved off removed anchors to free anchors of their kind. */
  private anchored<T>(
    records: Readonly<Partial<Record<DreamAnchorId, T>>>,
    kindOf: (record: T) => DreamAnchorKind,
    where: string,
    repair: (record: T, anchorId: DreamAnchorId) => T,
  ): Partial<Record<DreamAnchorId, T>> {
    const known = this.known;
    const entries = Object.entries(records) as [DreamAnchorId, T | undefined][];
    const next: Partial<Record<DreamAnchorId, T>> = {};
    for (const [anchorId, record] of entries) {
      if (record !== undefined && known.has(anchorId)) next[anchorId] = repair(record, anchorId);
    }
    for (const [anchorId, record] of entries) {
      if (record === undefined || known.has(anchorId)) continue;
      const free = this.candidates.find((anchor) => anchor.kind === kindOf(record) && next[anchor.id] === undefined);
      if (free === undefined) {
        this.log.push({ kind: "anchorDropped", where, anchorId });
        continue;
      }
      this.log.push({ kind: "anchorMoved", where, anchorId, toAnchorId: free.id });
      next[free.id] = repair(record, free.id);
    }
    return next;
  }
}

/** Reconcile `snapshot` against `catalog`: the repaired snapshot and every repair made. */
export function reconcileSnapshot(
  snapshot: D97Snapshot,
  catalog: D97SaveCatalog,
  tuning: D97SaveTuning,
): { readonly snapshot: D97Snapshot; readonly reconciliations: readonly D97Reconciliation[] } {
  const reconciler = new Reconciler(catalog, tuning);
  const d97: D97State = snapshot.d97.run === null ? snapshot.d97 : { ...snapshot.d97, run: reconciler.run(snapshot.d97.run) };
  return { snapshot: { ...snapshot, d97 }, reconciliations: reconciler.log };
}
