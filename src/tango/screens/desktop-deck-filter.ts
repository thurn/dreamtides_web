// Pure filter + sort logic for the DESKTOP deck viewer.
//
// The desktop viewer has room the mobile band does not, so it spends it on more
// granular controls: the type filter, the subtype filter, the sort key, and the
// sort direction are each their own axis rather than the single combined
// type/subtype dropdown (and fixed low-to-high order) the mobile viewer uses.
// This module is the pure, tested core those controls drive — the derivation
// from "the whole deck + the four control values" to "the visible grid", plus
// the option lists the controls populate from the deck itself. No React, no DOM.
//
// The low-to-high ordering of each sort key is shared verbatim with the mobile
// viewer (`compareBySort` in `mobile-deck-filter`) so a deck sorts identically
// on both surfaces; the desktop module only adds the direction flip on top.

import type { CardType } from "../../types/cards";
import type { DeckCardView } from "./MobileDeckViewer";
import {
  type DeckControlOption,
  type DeckSortId,
  DECK_SORT_OPTIONS,
  compareBySort,
} from "./mobile-deck-filter";

export type { DeckSortId };
export { DECK_SORT_OPTIONS };

/** The card-type toggle: everything, or one card type. */
export type DeckTypeToggle = "all" | CardType;

/**
 * The subtype filter: `"all"` shows every subtype; any other value keeps only
 * cards whose subtype matches it exactly. The concrete subtype values are minted
 * from the deck by {@link buildSubtypeFilterOptions}.
 */
export type SubtypeFilter = string;

/** Which way a sort key runs. Every key's ascending order is its low-to-high
 *  order (see `compareBySort`); descending is that reversed. */
export type SortDirection = "asc" | "desc";

/** Which card size the grid renders at — the S / M / L display-size control. */
export type DeckCardSize = "small" | "medium" | "large";

/** The four resolved control values the desktop viewer's controls drive. */
export interface DesktopDeckFilterSort {
  type: DeckTypeToggle;
  subtype: SubtypeFilter;
  sort: DeckSortId;
  direction: SortDirection;
  size: DeckCardSize;
}

/** The default view: the whole deck, acquisition order, medium cards. */
export const DEFAULT_DESKTOP_DECK_FILTER_SORT: DesktopDeckFilterSort = {
  type: "all",
  subtype: "all",
  sort: "drafted",
  direction: "asc",
  size: "medium",
};

/** The card-type toggle segments, in display order. */
export const DECK_TYPE_TOGGLE_OPTIONS: readonly DeckControlOption<DeckTypeToggle>[] =
  [
    { value: "all", label: "All" },
    { value: "Character", label: "Characters" },
    { value: "Event", label: "Events" },
  ] as const;

/** The sort-direction segments — a compact up/down arrow toggle. */
export const SORT_DIRECTION_OPTIONS: readonly DeckControlOption<SortDirection>[] =
  [
    { value: "asc", label: "↑" },
    { value: "desc", label: "↓" },
  ] as const;

/** The card-size segments — the S / M / L display-size control. */
export const DECK_CARD_SIZE_OPTIONS: readonly DeckControlOption<DeckCardSize>[] =
  [
    { value: "small", label: "S" },
    { value: "medium", label: "M" },
    { value: "large", label: "L" },
  ] as const;

/**
 * On-screen tile width (px) for each display-size preset. Box measures —
 * content-driven layout numbers outside the token scale — so they live as
 * plain, commented constants. Tuned so "M" matches a comfortable browse size,
 * "S" packs a full deck onto one screen, and "L" reads rules text at a glance.
 */
export const DECK_CARD_SIZE_PX: Readonly<Record<DeckCardSize, number>> = {
  small: 150,
  medium: 190,
  large: 240,
};

/**
 * The subtype-filter dropdown options for a specific deck: an "All Subtypes"
 * entry, then every subtype the deck actually holds, alphabetical. A dropdown
 * (unlike the mobile combined menu) has room to list every subtype present, not
 * only the heavily-represented ones, so a player can isolate even a lone
 * subtype.
 */
export function buildSubtypeFilterOptions(
  cards: readonly DeckCardView[],
): DeckControlOption<SubtypeFilter>[] {
  const subtypes = new Set<string>();
  for (const view of cards) {
    const subtype = view.card.subtype.trim();
    if (subtype !== "") subtypes.add(subtype);
  }
  const options = [...subtypes]
    .sort((a, b) => a.localeCompare(b))
    .map(
      (subtype): DeckControlOption<SubtypeFilter> => ({
        value: subtype,
        label: subtype,
      }),
    );
  return [{ value: "all", label: "All Subtypes" }, ...options];
}

/** Whether a card passes the active card-type toggle. */
function matchesType(view: DeckCardView, type: DeckTypeToggle): boolean {
  return type === "all" || view.card.cardType === type;
}

/** Whether a card passes the active subtype filter. */
function matchesSubtype(view: DeckCardView, subtype: SubtypeFilter): boolean {
  return subtype === "all" || view.card.subtype === subtype;
}

/**
 * Derive the visible desktop grid from the full card list and the control
 * state: filter to the chosen type and subtype, order by the chosen sort key,
 * then apply the direction. Stable — cards that tie on the sort key keep their
 * acquisition order in an ascending list. Pure: never mutates `cards`.
 *
 * `drafted` has no comparable key (it *is* the acquisition order), so ascending
 * returns the filtered list untouched and descending reverses it; every other
 * key sorts low-to-high via the shared comparator and flips for descending.
 */
export function filterAndSortDesktopDeckCards(
  cards: readonly DeckCardView[],
  state: DesktopDeckFilterSort,
): DeckCardView[] {
  const subtype = state.type === "Event" ? "all" : state.subtype;
  const filtered = cards.filter(
    (view) => matchesType(view, state.type) && matchesSubtype(view, subtype),
  );
  if (state.sort === "drafted") {
    return state.direction === "asc" ? filtered : [...filtered].reverse();
  }
  const sorted = [...filtered].sort((a, b) => compareBySort(a, b, state.sort));
  return state.direction === "asc" ? sorted : sorted.reverse();
}
