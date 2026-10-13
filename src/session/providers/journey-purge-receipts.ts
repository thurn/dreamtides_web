import type { ExplorationEffectKind } from "../../data/exploration";
import type { AuguryApplyPayload } from "../../journey_v2/types";
import type { ExplorationResolution, JourneyPurgeOccurrence } from "../../types/journey";

const CARD_PURGE_KINDS = {
  "purge-and-copy": true,
  "purge-one-transfigure-and-copy-others": true,
  "gain-dreamsign": false,
  "gain-nightmare-and-dreamsign": false,
  "gain-nightmare-and-offered-dreamsign": false,
  "gain-card": false,
  "transfigure-selected": false,
  "transfigure-random-cards": false,
  "transfigure-fixed-random-cards": false,
  "purge-selected": true,
  "purge-starter-card": true,
  "purge-random-starter-card": true,
  "purge-random-starter-and-gain-card": true,
  "replace-all-starter-cards": false,
  "transfigure-random-starter-cards": false,
  "transfigure-all-starter-cards": false,
  "transfigure-all-cards": false,
  "choose-pack": false,
  "draft-card": false,
  "purge-for-essence": true,
  "change-subtype-selected": false,
  "change-card-type-selected": false,
  "change-subtype-all": false,
  "take-cards": false,
  "take-transfigured-cards-and-gain-nightmares": false,
  "replace-selected-with-card": false,
  "replace-random-with-card": false,
  "replace-selected": false,
  "gain-nightmare-and-card": false,
  "gain-random-cards": false,
  "transfigure-fixed-selected": false,
  "gain-offered-card": false,
  "transfigure-all-for-essence": false,
  "purge-disclosed-and-transfigure-same-type": true,
  "transfigure-next-draft-or-shop": false,
  "gain-essence-per-card": false,
  "increase-spark-all": false,
  "gain-essence": false,
  "gain-random-essence": false,
  "double-essence": false,
  "purge-random-subtype-and-increase-spark": true,
  "gain-random-dreamsign": false,
  "purge-dreamsign-for-essence": false,
  "gain-offered-dreamsign": false,
  "replace-selected-dreamsign-with-offered": false,
  "replace-all-dreamsigns-random": false,
  "purge-selected-dreamsign-and-gain-random": false,
  "make-fast-all": false,
  "make-predicate-fast-and-gain-nightmares": false,
  "reduce-cost-all-and-gain-nightmares": false,
  "copy-selected-card": false,
  "copy-selected-cards": false,
  "copy-random-cards": false,
  "copy-offered-deck-card": false,
  "next-battle-opening-hand": false,
  "next-battle-starting-energy": false,
  "next-battle-smaller-hand-and-cost-discount": false,
  "choose-avatar": false,
  "purge-duplicates-and-grant-reclaim": true,
  "transfigured-card-draft": false,
  "add-fixed-site": false,
  "choose-site-type": false,
  "add-site": false,
  "free-next-shop": false,
  "lose-half-essence-and-free-purchases": false,
} satisfies Readonly<Record<ExplorationEffectKind, boolean>>;

/** Read original paired identities only after the authored action has resolved successfully. */
export function explorationPurgeReceipts(kind: ExplorationEffectKind, resolution: ExplorationResolution): readonly JourneyPurgeOccurrence[] {
  if (!CARD_PURGE_KINDS[kind]) return [];
  const entries = resolution.purgedEntryIds ?? [];
  if (entries.length !== resolution.purgedCardIds.length) {
    throw new Error("Validated Exploration purge identity arrays disagree.");
  }
  return entries.map((entryId, index) => ({ entryId, cardId: resolution.purgedCardIds[index] }));
}

/** Augury's validated purge payloads retain the original concrete card identity. */
export function auguryPurgeReceipts(payload: AuguryApplyPayload): readonly JourneyPurgeOccurrence[] {
  if (payload.kind === "remove_deck_entry") return [{ entryId: payload.entryId, cardId: payload.cardUuid }];
  return payload.kind === "composite" ? payload.children.flatMap(auguryPurgeReceipts) : [];
}
