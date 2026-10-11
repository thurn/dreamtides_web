// Shared fixtures for the essence site screen tests: the media query stub,
// fixture cards and guides, and test-id helpers.
import { act } from "react";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import {
  testCardId,
  testGuideArtKey,
  testGuideId,
} from "../../types/test-identities";

export function stubMatchMedia(matches: boolean): void {
  window.matchMedia = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

export function makeCard(index: number): CardData {
  return {
    name: parseCardName(`Fixture ${String(index)}`),
    id: testCardId(
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    cardNumber: index,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Fixture text.",
    imageNumber: index,
    artOwned: true,
  };
}

export function guide(seed: Parameters<typeof testGuideId>[0]) {
  return {
    id: testGuideId(seed),
    name: "Fixture Guide",
    line: "Fixture line.",
    art: artRef.dreamGuide(testGuideArtKey(seed)),
    headTargetX: 0.6,
  };
}

export function q(container: ParentNode, marker: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${marker}"]`);
}

export function click(element: HTMLElement | null): void {
  act(() => element?.click());
}
