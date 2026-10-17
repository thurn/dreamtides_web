// Load-time reconciliation of a D97 save against the current catalog
// (decision P5). Every catalog reference in a snapshot is a UUID; each one
// that no longer resolves is repaired and reported:
//
// - a retired card maps to its replacement through the committed retirement
//   table; an owned copy of a retired card without one is removed and
//   compensated in Essence, and other references to it are dropped;
// - an encounter or shop whose anchor was removed moves to a free anchor of
//   the same kind, or is dropped when none is free; places on removed anchors
//   are forgotten;
// - a held quest whose definition was removed is abandoned.
//
// New tunables need no repair: they apply going forward.

import type { D97SaveTuning } from "../../content/d97/save";
import type { D97Encounter, D97Run, D97Shop, D97State } from "../../rules/d97/d97-state";
import type { CardId } from "../../types/card-identity";
import type { D97OwnedCopyId, D97QuestId, DreamAnchorId } from "../../types/identifiers";
import type { DreamAnchorKind } from "../map/definition";
import type { D97Snapshot } from "./snapshot";

/** The current catalog a save reconciles against. */
export interface D97SaveCatalog {
  /** Whether a card UUID is in the current card catalog. */
  readonly hasCard: (cardId: CardId) => boolean;
  /** The current dream's anchors. */
  readonly anchors: readonly { readonly id: DreamAnchorId; readonly kind: DreamAnchorKind }[];
  readonly questIds: ReadonlySet<D97QuestId>;
}

/** One repair, logged with UUIDs. */
export type D97Reconciliation =
  | { readonly kind: "cardReplaced"; readonly where: string; readonly cardId: CardId; readonly replacementId: CardId }
  | { readonly kind: "cardCompensated"; readonly copyId: D97OwnedCopyId; readonly cardId: CardId; readonly essence: number }
  | { readonly kind: "cardDropped"; readonly where: string; readonly cardId: CardId }
  | { readonly kind: "anchorMoved"; readonly where: string; readonly anchorId: DreamAnchorId; readonly toAnchorId: DreamAnchorId }
  | { readonly kind: "anchorDropped"; readonly where: string; readonly anchorId: DreamAnchorId }
  | { readonly kind: "questAbandoned"; readonly questId: D97QuestId };

type CardFate = { readonly kind: "keep" } | { readonly kind: "replace"; readonly to: CardId } | { readonly kind: "retire" };

class Reconciler {
  readonly log: D97Reconciliation[] = [];
  private readonly replacements: ReadonlyMap<CardId, CardId | null>;

  constructor(
    private readonly catalog: D97SaveCatalog,
    private readonly tuning: D97SaveTuning,
  ) {
    this.replacements = new Map(tuning.retirements.map((entry) => [entry.cardId, entry.replacementId]));
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
    const bagEntries = run.bag.entries.flatMap((entry) => {
      const cardId = this.card(entry.cardId, "bag");
      return cardId === null ? [] : [{ ...entry, cardId }];
    });
    const quests = run.quests;
    const pending = quests.pendingReward;
    return {
      ...run,
      essence,
      collection: { ...run.collection, copies },
      bag: { ...run.bag, entries: bagEntries },
      encounters: this.anchored(run.encounters, (encounter) => (encounter.role === "guardian" ? "guardian" : "challenger"), "encounter", (encounter, anchorId) => this.encounter({ ...encounter, anchorId })),
      shops: this.anchored(run.shops, () => "shop", "shop", (shop) => this.shop(shop)),
      returnAnchorId: this.place(run.returnAnchorId, "returnAnchor"),
      lastPlace: run.lastPlace === null || this.place(run.lastPlace.anchorId, "lastPlace") === null ? null : run.lastPlace,
      activeWaypointIds: run.activeWaypointIds.filter((anchorId) => this.place(anchorId, "waypoint") !== null),
      quests: {
        ...quests,
        active: quests.active === null || this.catalog.questIds.has(quests.active.questId) ? quests.active : this.abandon(quests.active.questId),
        pendingReward: pending === null ? null : { ...pending, cardIds: this.cards(pending.cardIds, "questReward") },
      },
    };
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

  private place(anchorId: DreamAnchorId | null, where: string): DreamAnchorId | null {
    if (anchorId === null || this.catalog.anchors.some((anchor) => anchor.id === anchorId)) return anchorId;
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
    const known = new Set(this.catalog.anchors.map((anchor) => anchor.id));
    const entries = Object.entries(records) as [DreamAnchorId, T | undefined][];
    const next: Partial<Record<DreamAnchorId, T>> = {};
    for (const [anchorId, record] of entries) {
      if (record !== undefined && known.has(anchorId)) next[anchorId] = repair(record, anchorId);
    }
    for (const [anchorId, record] of entries) {
      if (record === undefined || known.has(anchorId)) continue;
      const free = this.catalog.anchors.find((anchor) => anchor.kind === kindOf(record) && next[anchor.id] === undefined);
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
