// Shared fixtures for the Augury site and starting deck overlay tests.
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { testCardId } from "../../types/test-identities";

export function stubMatchMedia(matches: (query: string) => boolean): void {
  window.matchMedia = (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

export function card(index: number): CardData {
  return {
    id: testCardId(
      `81000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    name: parseCardName(`Fixture ${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
}
