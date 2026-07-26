import type { CardData, FrozenCardData } from "../types/cards";
import type { ResolvedDreamAvatarPackage } from "../types/content";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
  CardSourceDebugSurface,
} from "../types/quest";

function buildCardSourceDebugEntry(
  card: CardData | FrozenCardData,
  resolvedPackage: ResolvedDreamAvatarPackage | null,
): CardSourceDebugEntry {
  const starterDecklist = new Set(
    resolvedPackage?.starterDecklistCardNumbers ?? [],
  );
  const draftPoolCopies =
    resolvedPackage?.draftPoolCopiesByCard[String(card.cardNumber)] ?? 0;

  return {
    cardNumber: card.cardNumber,
    cardName: card.name,
    inStarterDecklist: starterDecklist.has(card.cardNumber),
    draftPoolCopies,
  };
}

export function buildCardSourceDebugState(
  screenLabel: string,
  surface: CardSourceDebugSurface,
  cards: readonly (CardData | FrozenCardData)[],
  resolvedPackage: ResolvedDreamAvatarPackage | null,
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
