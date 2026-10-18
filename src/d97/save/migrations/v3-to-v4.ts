// Schema version 3 to 4: the reward bag moves onto the pinned pools
// (Appendix A §A2, decision P29). Bag v0 stored one dealt pool, `bag: {
// avatarId, dealSeed, joinedTideIds, entries: [{ cardId, target, acquired }]
// }`, whose `acquired` counted every copy acquired through any channel.
// Version 4 stores `bags: { stage, drawn }`: the capacity stage and, per
// Avatar, the copies acquired from that Avatar's bag. The run is at stage 1
// (a version-3 run never left Act 1), and its Avatar's draws are each card's
// `acquired` less the owned copies of it that came from an ante (the one
// bag-v0 channel that counted a card but is outside the bag), floored at
// zero; a sold ante copy is no longer owned, so it still counts, the one
// place the derivation over-counts. Every other Avatar's bag starts with no
// draws. The dealt targets and the deal's seed and tides are dropped: the
// pinned pool is content.
//
// The phase-3 page lets Phase 3 systems extend schema v2 in place until its
// gate freezes it; v2 had already shipped (hv-pcce.14) and v3 (rooms) had
// landed when this bead ran, so saves with bag v0 may exist and this change
// takes the next version instead (P5: a save always loads).

import type { D97SaveMigration } from "../migrate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Copies owned per card that an ante paid. */
function anteCopies(collection: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  const copies = isRecord(collection) && Array.isArray(collection.copies) ? collection.copies : [];
  for (const copy of copies) {
    if (!isRecord(copy) || typeof copy.cardId !== "string" || !isRecord(copy.provenance) || copy.provenance.channel !== "ante") continue;
    counts.set(copy.cardId, (counts.get(copy.cardId) ?? 0) + 1);
  }
  return counts;
}

/** Version 4's bags from a bag-v0 run, or the run unchanged when it has no bag v0. */
function withBags(run: Record<string, unknown>): Record<string, unknown> {
  const { bag, ...rest } = run;
  if (!isRecord(bag) || typeof bag.avatarId !== "string" || !Array.isArray(bag.entries)) return run;
  const antes = anteCopies(run.collection);
  const drawn: [string, number][] = [];
  for (const entry of bag.entries) {
    if (!isRecord(entry) || typeof entry.cardId !== "string" || typeof entry.acquired !== "number") continue;
    const count = Math.max(0, entry.acquired - (antes.get(entry.cardId) ?? 0));
    if (count > 0) drawn.push([entry.cardId, count]);
  }
  drawn.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return { ...rest, bags: { stage: 1, drawn: drawn.length === 0 ? {} : { [bag.avatarId]: Object.fromEntries(drawn) } } };
}

export const V3_TO_V4: D97SaveMigration = {
  from: 3,
  migrate: (snapshot) => {
    const d97 = snapshot.d97;
    const run = isRecord(d97) ? d97.run : null;
    if (!isRecord(d97) || !isRecord(run)) return { ...snapshot };
    return { ...snapshot, d97: { ...d97, run: withBags(run) } };
  },
};
