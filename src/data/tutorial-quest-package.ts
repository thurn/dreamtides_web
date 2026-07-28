import { logEvent } from "../logging";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../types/content";
import type { RunPoolContext } from "./quest-content";
import { STARTER_CARD_NUMBERS } from "./starter-cards";
import type { TutorialQuestPool } from "./tutorial-quest-pool";

/**
 * Resolve the tutorial's authored UUID multiset into the same package shape as
 * an ordinary generated quest pool.
 */
export function buildTutorialQuestPackage(
  dreamAvatar: DreamAvatarContent,
  context: RunPoolContext,
  tutorialPool: TutorialQuestPool,
): ResolvedDreamAvatarPackage {
  if (dreamAvatar.id !== tutorialPool.dreamAvatarId) {
    throw new Error(
      `Tutorial quest pool targets ${tutorialPool.dreamAvatarId}, received ${dreamAvatar.id}.`,
    );
  }

  const starterCardNumbers = new Set(STARTER_CARD_NUMBERS);
  const draftPoolCopiesByCard: Record<string, number> = {};
  const unresolvedCardIds: string[] = [];
  for (const tide of tutorialPool.tides) {
    for (const card of tide.cards) {
      const cardNumber = context.idIndex.get(card.id.toLocaleLowerCase());
      if (cardNumber === undefined) {
        unresolvedCardIds.push(card.id);
        continue;
      }
      if (starterCardNumbers.has(cardNumber)) {
        throw new Error(
          `Tutorial quest pool card ${card.id} is already in the fixed starter deck.`,
        );
      }
      if (
        card.copies > 1 &&
        context.legendaryCardNumbers?.has(cardNumber) === true
      ) {
        throw new Error(
          `Tutorial quest pool duplicates legendary card ${card.id}.`,
        );
      }
      const key = String(cardNumber);
      if (draftPoolCopiesByCard[key] !== undefined) {
        throw new Error(
          `Tutorial quest pool UUIDs collide on card number ${key}.`,
        );
      }
      draftPoolCopiesByCard[key] = card.copies;
    }
  }

  if (unresolvedCardIds.length > 0) {
    throw new Error(
      `Tutorial quest pool references unknown card UUIDs: ${unresolvedCardIds.join(", ")}.`,
    );
  }

  const draftPoolSize = Object.values(draftPoolCopiesByCard).reduce(
    (sum, copies) => sum + copies,
    0,
  );
  if (draftPoolSize !== tutorialPool.poolSize) {
    throw new Error(
      `Tutorial quest pool resolved to ${String(draftPoolSize)} cards, expected ${String(tutorialPool.poolSize)}.`,
    );
  }

  logEvent("draft_pool_constructed", {
    dreamAvatarId: dreamAvatar.id,
    algo: "tutorial_tides",
    seed: "authored",
    poolSize: draftPoolSize,
    distinctCardCount: Object.keys(draftPoolCopiesByCard).length,
    tideIds: tutorialPool.tides.map((tide) => tide.id),
  });

  return {
    dreamAvatar,
    draftPoolCopiesByCard,
    dreamsignPoolIds: [...context.allDreamsignPoolIds],
    mandatoryOnlyPoolSize: draftPoolSize,
    draftPoolSize,
    doubledCardCount: Object.values(draftPoolCopiesByCard).filter(
      (copies) => copies === 2,
    ).length,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
    starterDecklistCardNumbers: [],
  };
}
