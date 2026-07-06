// Pure filter + sort logic for the mobile deck viewer.
//
// The deck viewer holds the player's whole deck as an ordered list of resolved
// cards (see MobileDeckViewer's `DeckCardView`). The filter/sort controls are
// local presentation state — which card type to show, which order to show them
// in — so the derivation from "all cards + control state" to "the visible list"
// lives here as a pure, deterministic function the screen calls on each render.
// No React, no DOM: this is the tested core the interactive controls drive.

import type { DeckCardView } from "./MobileDeckViewer";

/** Which card type the grid is filtered to. */
export type DeckTypeFilter = "all" | "Character" | "Event";

/**
 * A deck sort order. Each names both the key and the direction, because a
 * single Select dropdown presents field-and-direction combinations as one flat
 * list rather than a field picker plus a separate direction toggle:
 *
 *  - `deck`       — acquisition order (the order cards entered the deck).
 *  - `cost-asc`   — energy cost, low to high.
 *  - `cost-desc`  — energy cost, high to low.
 *  - `spark-desc` — spark, high to low.
 *  - `name-asc`   — card name, A to Z.
 */
export type DeckSortId =
  | "deck"
  | "cost-asc"
  | "cost-desc"
  | "spark-desc"
  | "name-asc";

/** The resolved filter + sort state the controls drive. */
export interface DeckFilterSort {
  typeFilter: DeckTypeFilter;
  sort: DeckSortId;
}

/** The default view: the whole deck, in acquisition order. */
export const DEFAULT_DECK_FILTER_SORT: DeckFilterSort = {
  typeFilter: "all",
  sort: "deck",
};

/** A labelled option, shared shape for both the type filter and the sort menu. */
export interface DeckControlOption<T extends string> {
  value: T;
  label: string;
  /** Compact form for the collapsed dropdown button; falls back to `label`. */
  triggerLabel?: string;
}

/** The type-filter segments, in display order. */
export const DECK_TYPE_FILTER_OPTIONS: readonly DeckControlOption<DeckTypeFilter>[] =
  [
    { value: "all", label: "All" },
    { value: "Character", label: "Characters" },
    { value: "Event", label: "Events" },
  ] as const;

/**
 * The sort-menu options, in display order. Each carries a compact `triggerLabel`
 * (with a direction arrow) so the collapsed sort button stays narrow enough to
 * share one line with the filter button, while the menu shows the full phrase.
 */
export const DECK_SORT_OPTIONS: readonly DeckControlOption<DeckSortId>[] = [
  { value: "deck", label: "Deck Order", triggerLabel: "Deck" },
  { value: "cost-asc", label: "Cost (Low to High)", triggerLabel: "Cost ↑" },
  { value: "cost-desc", label: "Cost (High to Low)", triggerLabel: "Cost ↓" },
  {
    value: "spark-desc",
    label: "Spark (High to Low)",
    triggerLabel: "Spark ↓",
  },
  { value: "name-asc", label: "Name (A to Z)", triggerLabel: "Name" },
] as const;

/** The full label for the currently-selected sort (for an accessible name). */
export function deckSortLabel(sort: DeckSortId): string {
  return DECK_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";
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
 * sorts to the low end so a high-to-low list runs high spark → no spark.
 */
function sparkKey(card: DeckCardView["card"]): number {
  return card.spark ?? Number.NEGATIVE_INFINITY;
}

/** Comparator for one sort order. Returns 0 for `deck` so the caller keeps the
 *  incoming acquisition order via a stable sort. */
function compareBySort(
  a: DeckCardView,
  b: DeckCardView,
  sort: DeckSortId,
): number {
  switch (sort) {
    case "deck":
      return 0;
    case "cost-asc":
      return costKey(a.card) - costKey(b.card);
    case "cost-desc":
      return costKey(b.card) - costKey(a.card);
    case "spark-desc":
      return sparkKey(b.card) - sparkKey(a.card);
    case "name-asc":
      return a.card.name.localeCompare(b.card.name);
  }
}

/**
 * Derive the visible deck grid from the full card list and the control state:
 * filter to the chosen card type, then order by the chosen sort. Stable — cards
 * that tie on the sort key keep their acquisition order, and `sort: "deck"`
 * returns the filtered list untouched. Pure: never mutates `cards`.
 */
export function filterAndSortDeckCards(
  cards: readonly DeckCardView[],
  state: DeckFilterSort,
): DeckCardView[] {
  const filtered = cards.filter(
    (view) =>
      state.typeFilter === "all" || view.card.cardType === state.typeFilter,
  );
  if (state.sort === "deck") return filtered;
  // Array.prototype.sort is stable, so equal-key cards keep the filtered
  // (acquisition) order without threading an index.
  return [...filtered].sort((a, b) => compareBySort(a, b, state.sort));
}
