import type { CardData } from "../types/cards";
import type { ResolvedAvatarPackage } from "../types/content";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
  CardSourceDebugSurface,
} from "../types/journey";
import { serializeCardNumber } from "../types/draft";

function buildCardSourceDebugEntry(
  card: Readonly<CardData>,
  resolvedPackage: ResolvedAvatarPackage | null,
): CardSourceDebugEntry {
  const draftPoolCopies =
    resolvedPackage?.draftPoolCopiesByCard[
      serializeCardNumber(card.cardNumber)
    ] ?? 0;

  return {
    cardNumber: card.cardNumber,
    cardName: card.name,
    draftPoolCopies,
  };
}

export function buildCardSourceDebugState(
  screenLabel: string,
  surface: CardSourceDebugSurface,
  cards: readonly Readonly<CardData>[],
  resolvedPackage: ResolvedAvatarPackage | null,
): CardSourceDebugState | null {
  if (cards.length === 0) {
    return null;
  }

  return {
    screenLabel,
    surface,
    entries: cards.map((card) => buildCardSourceDebugEntry(card, resolvedPackage)),
  };
}
