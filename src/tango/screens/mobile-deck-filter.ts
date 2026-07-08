// Pure filter + sort logic for the mobile deck viewer.
//
// The deck viewer holds the player's whole deck as an ordered list of resolved
// cards (see MobileDeckViewer's `DeckCardView`). The filter/sort controls are
// local presentation state — which card type to show, which order to show them
// in — so the derivation from "all cards + control state" to "the visible list"
// lives here as a pure, deterministic function the screen calls on each render.
// The set of type-filter options is itself derived from the deck (see
// `buildDeckTypeFilterOptions`), so a deck heavy in one subtype offers a
// one-tap filter down to it. No React, no DOM: this is the tested core the
// interactive controls drive.
//
// Intentional platform divergence: the desktop viewer (`desktop-deck-filter`)
// splits these into separate type / subtype / sort-key / sort-direction axes,
// spending the room the mobile band lacks on more granular controls; here the
// type and subtype collapse into one dropdown and every sort runs low to high.
// The low-to-high ordering itself (`compareBySort`) is shared verbatim, so a
// deck sorts identically on both surfaces.

import type { CardType } from "../../types/cards";
import type { DeckCardView } from "./MobileDeckViewer";

/**
 * Which cards the grid is filtered to. `"all"` shows everything; `"type:<T>"`
 * keeps one card type; `"subtype:<S>"` keeps one subtype. The subtype options
 * are minted from the deck's own contents by `buildDeckTypeFilterOptions`.
 */
export type DeckTypeFilter = "all" | `type:${CardType}` | `subtype:${string}`;

/**
 * A deck sort order. Every sort runs low to high, so the id names only the key,
 * not a direction:
 *
 *  - `drafted` — acquisition order (the order cards entered the deck).
 *  - `name`    — card name, A to Z.
 *  - `cost`    — energy cost, low to high.
 *  - `spark`   — spark, low to high.
 *  - `subtype` — subtype, A to Z.
 */
export type DeckSortId = "drafted" | "name" | "cost" | "spark" | "subtype";

/** The resolved filter + sort state the controls drive. */
export interface DeckFilterSort {
  typeFilter: DeckTypeFilter;
  sort: DeckSortId;
}

/** The default view: the whole deck, in acquisition order. */
export const DEFAULT_DECK_FILTER_SORT: DeckFilterSort = {
  typeFilter: "all",
  sort: "drafted",
};

/** A labelled option, shared shape for both the type filter and the sort menu. */
export interface DeckControlOption<T extends string> {
  value: T;
  label: string;
  /** Compact form for the collapsed dropdown button; falls back to `label`. */
  triggerLabel?: string;
}

/**
 * The always-present type-filter options, in display order. A deck's own
 * subtype options are appended after these by `buildDeckTypeFilterOptions`.
 */
export const BASE_DECK_TYPE_FILTER_OPTIONS: readonly DeckControlOption<DeckTypeFilter>[] =
  [
    { value: "all", label: "All" },
    { value: "type:Character", label: "Characters" },
    { value: "type:Event", label: "Events" },
  ] as const;

/**
 * A subtype earns its own filter option once the deck holds more than this many
 * cards of it — enough of a cluster that "show me just these" is worth a tap.
 */
export const SUBTYPE_FILTER_MIN_COUNT = 4;

/** Pluralize a subtype for its filter label ("Warrior" → "Warriors"). */
function pluralizeSubtype(subtype: string): string {
  if (/(?:s|x|z|ch|sh)$/i.test(subtype)) return `${subtype}es`;
  if (/[^aeiou]y$/i.test(subtype)) return `${subtype.slice(0, -1)}ies`;
  return `${subtype}s`;
}

/**
 * The type-filter options for a specific deck: the three base options, then a
 * "just <Subtype>" option for every subtype the deck holds more than
 * {@link SUBTYPE_FILTER_MIN_COUNT} of — most-represented subtype first, ties
 * broken alphabetically. So a deck with five Warriors offers a one-tap Warriors
 * filter, while a deck with a lone Warrior does not clutter the menu with it.
 */
export function buildDeckTypeFilterOptions(
  cards: readonly DeckCardView[],
): DeckControlOption<DeckTypeFilter>[] {
  const counts = new Map<string, number>();
  for (const view of cards) {
    const subtype = view.card.subtype.trim();
    if (subtype === "") continue;
    counts.set(subtype, (counts.get(subtype) ?? 0) + 1);
  }
  const subtypeOptions = [...counts.entries()]
    .filter(([, count]) => count > SUBTYPE_FILTER_MIN_COUNT - 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(
      ([subtype]): DeckControlOption<DeckTypeFilter> => ({
        value: `subtype:${subtype}`,
        label: pluralizeSubtype(subtype),
      }),
    );
  return [...BASE_DECK_TYPE_FILTER_OPTIONS, ...subtypeOptions];
}

/**
 * The sort-menu options, in display order. Every sort runs low to high, so each
 * label names only its key with no direction marker.
 */
export const DECK_SORT_OPTIONS: readonly DeckControlOption<DeckSortId>[] = [
  { value: "name", label: "Name" },
  { value: "drafted", label: "Acquired" },
  { value: "cost", label: "Cost" },
  { value: "spark", label: "Spark" },
  { value: "subtype", label: "Subtype" },
] as const;

/** The full label for the currently-selected sort (for an accessible name). */
export function deckSortLabel(sort: DeckSortId): string {
  return DECK_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";
}

/** The display label for the currently-selected type filter (accessible name). */
export function deckTypeFilterLabel(
  filter: DeckTypeFilter,
  options: readonly DeckControlOption<DeckTypeFilter>[],
): string {
  return options.find((option) => option.value === filter)?.label ?? "";
}

/**
 * A card's energy cost as a sortable number. A `null` cost is a variable-`X`
 * card; it sorts to the expensive end so an ascending list runs cheap → X.
 */
function costKey(card: DeckCardView["card"]): number {
  return card.energyCost ?? Number.POSITIVE_INFINITY;
}

/**
 * A card's spark as a sortable number. A `null` spark (most Events have none)
 * sorts to the low end so a low-to-high list runs no spark → high spark.
 */
function sparkKey(card: DeckCardView["card"]): number {
  return card.spark ?? Number.NEGATIVE_INFINITY;
}

/** Comparator for one sort order. Returns 0 for `drafted` so the caller keeps
 *  the incoming acquisition order via a stable sort. Shared with the desktop
 *  deck viewer's filter (`desktop-deck-filter`), which layers a sort direction
 *  on top of this low-to-high key so both surfaces order a deck identically. */
export function compareBySort(
  a: DeckCardView,
  b: DeckCardView,
  sort: DeckSortId,
): number {
  switch (sort) {
    case "drafted":
      return 0;
    case "name":
      return a.card.name.localeCompare(b.card.name);
    case "cost":
      return costKey(a.card) - costKey(b.card);
    case "spark":
      return sparkKey(a.card) - sparkKey(b.card);
    case "subtype":
      return a.card.subtype.localeCompare(b.card.subtype);
  }
}

/** Whether a card passes the active type filter. */
function matchesTypeFilter(view: DeckCardView, filter: DeckTypeFilter): boolean {
  if (filter === "all") return true;
  if (filter.startsWith("type:")) {
    return view.card.cardType === filter.slice("type:".length);
  }
  if (filter.startsWith("subtype:")) {
    return view.card.subtype === filter.slice("subtype:".length);
  }
  return true;
}

/**
 * Derive the visible deck grid from the full card list and the control state:
 * filter to the chosen type/subtype, then order by the chosen sort. Stable —
 * cards that tie on the sort key keep their acquisition order, and
 * `sort: "drafted"` returns the filtered list untouched. Pure: never mutates
 * `cards`.
 */
export function filterAndSortDeckCards(
  cards: readonly DeckCardView[],
  state: DeckFilterSort,
): DeckCardView[] {
  const filtered = cards.filter((view) =>
    matchesTypeFilter(view, state.typeFilter),
  );
  if (state.sort === "drafted") return filtered;
  // Array.prototype.sort is stable, so equal-key cards keep the filtered
  // (acquisition) order without threading an index.
  return [...filtered].sort((a, b) => compareBySort(a, b, state.sort));
}
