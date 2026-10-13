import type { ExplorationEffectKind } from "../../data/exploration";
import type { AuguryApplyPayload } from "../../journey_v2/types";
import type { ExplorationResolution, JourneyPurgeOccurrence } from "../../types/journey";

const CARD_PURGE_KINDS: ReadonlySet<ExplorationEffectKind> = new Set([
  "purge-and-copy", "purge-one-transfigure-and-copy-others", "purge-selected",
  "purge-starter-card", "purge-random-starter-card", "purge-random-starter-and-gain-card",
  "purge-for-essence", "purge-disclosed-and-transfigure-same-type",
  "purge-random-subtype-and-increase-spark", "purge-duplicates-and-grant-reclaim",
]);

/** Read original paired identities only after the authored action has resolved successfully. */
export function explorationPurgeReceipts(kind: ExplorationEffectKind, resolution: ExplorationResolution): readonly JourneyPurgeOccurrence[] {
  if (!CARD_PURGE_KINDS.has(kind)) return [];
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
