// Reconstruct the generator's inputs ({@link PoolData}) from card metadata.

import { TIDE_TO_ARCHETYPE } from "./constants.ts";
import type { PickRecord, PoolCard, PoolData } from "./types.ts";

// The historical generator read one list per file and iterated them in directory
// order, which is the code-unit sort of the `<name>.txt` filenames ('-' < '.', so
// "b-weenie" precedes "b"). Re-key the rebuilt maps in that same order so the
// overlap-weighted walk visits themes identically.
function byFilename(a: string, b: string): number {
  const fa = `${a}.txt`;
  const fb = `${b}.txt`;
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}

function orderedMap(
  map: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const key of [...map.keys()].sort(byFilename)) {
    out.set(key, map.get(key) ?? new Set<string>());
  }
  return out;
}

function addTo(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Reconstruct the generator's inputs from card records. Each card contributes
 * to `core` (if flagged), to one mechanic archetype per tide base name, and to
 * every bare color-combo list and color+archetype slice it belongs to. Runtime
 * catalog cards carry no `tides`, so their archetype lists stay empty; the
 * `draft_test` experiment harness supplies tides for the non-`idf3` variants.
 */
export function buildPoolData(
  cards: readonly PoolCard[],
  decklists?: readonly (readonly string[])[],
  mergedArchetypeLists?: Readonly<Record<string, readonly string[]>>,
  humanDecklists?: readonly (readonly string[])[],
  draftRecords?: readonly PickRecord[],
): PoolData {
  const core = new Set<string>();
  const archLists = new Map<string, Set<string>>();
  const draftLists = new Map<string, Set<string>>();
  // Name<->UUID maps for the `seed` variant's rename-proof identity. Built only
  // from cards that carry a stable `id`; first writer wins on name collisions, so
  // these agree with the runtime `buildNameIndex` (name -> card number). Left
  // undefined when no source card carries an id (e.g. synthetic test cards), in
  // which case the `seed` variant keys by name.
  let cardIdByName: Map<string, string> | undefined;
  let cardNameById: Map<string, string> | undefined;
  for (const card of cards) {
    if (card.id !== undefined) {
      cardIdByName ??= new Map<string, string>();
      cardNameById ??= new Map<string, string>();
      if (!cardIdByName.has(card.name)) cardIdByName.set(card.name, card.id);
      if (!cardNameById.has(card.id)) cardNameById.set(card.id, card.name);
    }
    if (card.core) core.add(card.name);
    for (const tide of card.tides ?? []) {
      const key = TIDE_TO_ARCHETYPE.get(tide);
      if (key) addTo(archLists, key, card.name);
    }
    for (const list of card.colors ?? []) addTo(draftLists, list, card.name);
    for (const list of card.draftArchetypes ?? []) {
      addTo(draftLists, list, card.name);
    }
  }
  let mergedLists: Map<string, Set<string>> | undefined;
  if (mergedArchetypeLists) {
    mergedLists = new Map<string, Set<string>>();
    for (const [label, names] of Object.entries(mergedArchetypeLists)) {
      mergedLists.set(label, new Set(names));
    }
  }
  return {
    core,
    archLists: orderedMap(archLists),
    draftLists: orderedMap(draftLists),
    decklists,
    humanDecklists,
    mergedLists,
    draftRecords,
    cardIdByName,
    cardNameById,
  };
}
