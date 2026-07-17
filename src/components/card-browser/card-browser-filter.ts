import type { CardData, CardType } from "../../types/cards";
import type {
  CardBrowserCostFilter,
  CardBrowserSearchScope,
  CardBrowserToolbarValues,
  CardBrowserTypeFilter,
} from "./card-browser-types";

/** Whether a card's energy cost satisfies the selected cost filter. */
export function matchesCostFilter(
  energyCost: number | null,
  filter: CardBrowserCostFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "x":
      return energyCost === null;
    case "5plus":
      return energyCost !== null && energyCost >= 5;
    default:
      return energyCost === Number(filter);
  }
}

/** Whether a card's type satisfies the selected type filter. */
export function matchesTypeFilter(
  cardType: CardType,
  filter: CardBrowserTypeFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "character":
      return cardType === "Character";
    case "event":
      return cardType === "Event";
  }
}

/** The text a card exposes to the search box for the given scope. */
function cardSearchText(card: CardData, scope: CardBrowserSearchScope): string {
  if (scope === "mtg") {
    return card.mtgName ?? "";
  }
  if (scope === "imageNumber") {
    return String(card.imageNumber);
  }
  if (scope === "all") {
    return `${card.name} ${card.renderedText}`;
  }
  return card.name;
}

/** Whether a card matches a (possibly blank) search query under a scope. */
export function matchesSearch(
  card: CardData,
  searchText: string,
  scope: CardBrowserSearchScope,
): boolean {
  const query = searchText.trim().toLowerCase();
  if (query === "") {
    return true;
  }
  return cardSearchText(card, scope).toLowerCase().includes(query);
}

function compareSortValues(
  left: string | number,
  right: string | number,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortValue(card: CardData, sort: string): string | number {
  switch (sort) {
    case "cardNumber":
      return card.cardNumber;
    case "cost":
      return card.energyCost ?? Number.POSITIVE_INFINITY;
    case "type":
      return card.cardType;
    case "subtype":
      return card.subtype;
    case "spark":
      return card.spark ?? Number.POSITIVE_INFINITY;
    case "rulesTextLength":
      return card.renderedText.length;
    case "nameLength":
      return card.name.length;
    case "name":
    default:
      return card.name;
  }
}

/**
 * Filters and sorts a flat list of cards by the toolbar's display values. The
 * sort is stable: cards with equal sort keys keep their input order. Subtype
 * filtering matches a card's subtype exactly; an empty subtype value imposes no
 * subtype constraint.
 */
export function filterAndSortCardData(
  cards: readonly CardData[],
  values: CardBrowserToolbarValues,
): CardData[] {
  const subtype = values.subtype.trim();

  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => {
      if (!matchesSearch(card, values.searchText, values.searchScope)) {
        return false;
      }
      if (!matchesTypeFilter(card.cardType, values.type)) {
        return false;
      }
      if (!matchesCostFilter(card.energyCost, values.cost)) {
        return false;
      }
      return subtype === "" || card.subtype === subtype;
    })
    .sort((left, right) => {
      const direction = values.dir === "asc" ? 1 : -1;
      const comparison =
        compareSortValues(
          sortValue(left.card, values.sort),
          sortValue(right.card, values.sort),
        ) * direction;
      return comparison === 0 ? left.index - right.index : comparison;
    })
    .map(({ card }) => card);
}

/**
 * The sorted, de-duplicated list of nonblank Character subtypes present in a
 * card list, used to populate the subtype filter dropdown.
 */
export function subtypeOptionsFromCards(
  cards: readonly CardData[],
): string[] {
  return Array.from(
    new Set(
      cards
        .filter(
          (card) =>
            card.cardType === "Character" && card.subtype.trim() !== "",
        )
        .map((card) => card.subtype),
    ),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}
