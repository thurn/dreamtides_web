import type { DreamcallerContent } from "../types/content";
import type { Dreamcaller } from "../types/quest";

/** Pick a stable random offer of Dreamcallers without replacement. */
export function selectDreamcallerOffer(
  dreamcallers: readonly DreamcallerContent[],
  offerSize = 3,
): DreamcallerContent[] {
  if (dreamcallers.length < offerSize) {
    throw new Error(
      `Expected at least ${String(offerSize)} Dreamcallers, received ${String(dreamcallers.length)}`,
    );
  }

  const pool = [...dreamcallers];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, offerSize);
}

/** Convert normalized Dreamcaller content into quest-state display data. */
export function toQuestDreamcaller(
  dreamcaller: DreamcallerContent,
): Dreamcaller {
  return {
    id: dreamcaller.id,
    name: dreamcaller.name,
    title: dreamcaller.title,
    renderedText: dreamcaller.renderedText,
    imageNumber: dreamcaller.imageNumber,
    startingEssence: dreamcaller.startingEssence,
  };
}
