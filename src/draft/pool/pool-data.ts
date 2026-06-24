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
 * catalog cards carry no `tides`, so their archetype lists stay empty;
 * `cards-v2-metadata.ts` supplies tides for the non-`idf3` variants.
 *
 * `core`, `archLists`, and `draftLists` are keyed on each card's stable UUID
 * (`card.id`) when available, falling back to the display name only for
 * synthetic / test cards that carry no `id`. This ensures two distinct cards
 * that share a display name occupy separate entries rather than merging into
 * one.
 */
export function buildPoolData(
  cards: readonly PoolCard[],
  decklists?: readonly (readonly string[])[],
  draftRecords?: readonly PickRecord[],
  decklistIds?: readonly (readonly string[])[],
): PoolData {
  const core = new Set<string>();
  const archLists = new Map<string, Set<string>>();
  const draftLists = new Map<string, Set<string>>();
  // UUID -> display name, for resolving UUID-keyed pool output back to display
  // names at the render boundary. Built only from cards that carry a stable
  // `id`; UUID keys are unique, so two cards that share a display name stay
  // distinct. Left undefined when no source card carries an id (e.g. synthetic
  // test cards), in which case identifier maps key by name.
  let cardNameById: Map<string, string> | undefined;
  for (const card of cards) {
    // Use the stable UUID as the card's identity key throughout; fall back to
    // the display name only when no UUID is available (synthetic test cards).
    const cardKey = card.id ?? card.name;
    if (card.id !== undefined) {
      cardNameById ??= new Map<string, string>();
      if (!cardNameById.has(card.id)) cardNameById.set(card.id, card.name);
    }
    if (card.core) core.add(cardKey);
    for (const tide of card.tides ?? []) {
      const key = TIDE_TO_ARCHETYPE.get(tide);
      if (key) addTo(archLists, key, cardKey);
    }
    for (const list of card.colors ?? []) addTo(draftLists, list, cardKey);
    for (const list of card.draftArchetypes ?? []) {
      addTo(draftLists, list, cardKey);
    }
  }
  return {
    core,
    archLists: orderedMap(archLists),
    draftLists: orderedMap(draftLists),
    decklists,
    decklistIds,
    draftRecords,
    cardNameById,
  };
}
