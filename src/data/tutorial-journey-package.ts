import { logEvent } from "../logging";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../types/content";
import type { CardData } from "../types/cards";
import type { RunPoolContext } from "./journey-content";
import type { TutorialJourneyPool } from "./tutorial-journey-pool";
import { extractGlossaryTerms } from "./glossary-terms";

const RULES_TEXT_SYMBOL_RE = /[●⍏✦▸⍟☾⧗❖]/u;

/**
 * Resolve the tutorial's authored UUID multiset into the same package shape as
 * an ordinary generated journey pool.
 */
export function buildTutorialJourneyPackage(
  dreamAvatar: DreamAvatarContent,
  context: RunPoolContext,
  tutorialPool: TutorialJourneyPool,
  cardDatabase: ReadonlyMap<number, CardData>,
): ResolvedDreamAvatarPackage {
  if (dreamAvatar.id !== tutorialPool.dreamAvatarId) {
    throw new Error(
      `Tutorial journey pool targets ${tutorialPool.dreamAvatarId}, received ${dreamAvatar.id}.`,
    );
  }

  const starterCardNumbers = new Set(context.starterCardNumbers);
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
          `Tutorial journey pool card ${card.id} is already in the fixed starter deck.`,
        );
      }
      const copyCap =
        context.poolCopyCapsByCardNumber?.get(cardNumber) ??
        context.defaultPoolCopyCap ??
        2;
      if (card.copies > copyCap) {
        throw new Error(
          `Tutorial journey pool exceeds the configured copy cap for ${card.id}.`,
        );
      }
      const key = String(cardNumber);
      if (draftPoolCopiesByCard[key] !== undefined) {
        throw new Error(
          `Tutorial journey pool UUIDs collide on card number ${key}.`,
        );
      }
      draftPoolCopiesByCard[key] = card.copies;
    }
  }

  if (unresolvedCardIds.length > 0) {
    throw new Error(
      `Tutorial journey pool references unknown card UUIDs: ${unresolvedCardIds.join(", ")}.`,
    );
  }

  const knownDreamsignIds = new Set(
    context.allDreamsignPoolIds.map((id) => id.toLocaleLowerCase()),
  );
  const unresolvedDreamsignIds = tutorialPool.openingDreamsignIds.filter(
    (id) => !knownDreamsignIds.has(id.toLocaleLowerCase()),
  );
  if (unresolvedDreamsignIds.length > 0) {
    throw new Error(
      `Tutorial opening Dreamsign offer references unknown UUIDs: ${unresolvedDreamsignIds.join(", ")}.`,
    );
  }

  const openingDraftOffers: Record<string, number[]> = {};
  for (const [offerIndex, cardIds] of tutorialPool.openingOffers.entries()) {
    const cardNumbers: number[] = [];
    for (const cardId of cardIds) {
      const cardNumber = context.idIndex.get(cardId.toLocaleLowerCase());
      if (cardNumber === undefined) {
        throw new Error(
          `Tutorial opening offer references unknown card ${cardId}.`,
        );
      }
      const card = cardDatabase.get(cardNumber);
      if (card === undefined) {
        throw new Error(
          `Tutorial opening offer references unknown card ${cardId}.`,
        );
      }
      if (card.isFast || card.isInterrupt === true) {
        throw new Error(
          `Tutorial opening offer card ${card.id} must not be fast or interrupt.`,
        );
      }
      if (RULES_TEXT_SYMBOL_RE.test(card.renderedText)) {
        throw new Error(
          `Tutorial opening offer card ${card.id} must not use rules symbols.`,
        );
      }
      const glossaryTerms = extractGlossaryTerms(card.renderedText);
      if (glossaryTerms.length > 0) {
        throw new Error(
          `Tutorial opening offer card ${card.id} must not reference glossary terms: ${glossaryTerms.map((entry) => entry.id).join(", ")}.`,
        );
      }
      cardNumbers.push(cardNumber);
    }
    openingDraftOffers[String(offerIndex + 1)] = cardNumbers;
  }

  const draftPoolSize = Object.values(draftPoolCopiesByCard).reduce(
    (sum, copies) => sum + copies,
    0,
  );
  if (draftPoolSize !== tutorialPool.poolSize) {
    throw new Error(
      `Tutorial journey pool resolved to ${String(draftPoolSize)} cards, expected ${String(tutorialPool.poolSize)}.`,
    );
  }

  logEvent("draft_pool_constructed", {
    dreamAvatarId: dreamAvatar.id,
    source: "authored_tutorial",
    seed: "authored",
    poolSize: draftPoolSize,
    distinctCardCount: Object.keys(draftPoolCopiesByCard).length,
    tideIds: tutorialPool.tides.map((tide) => tide.id),
    openingDreamsignIds: tutorialPool.openingDreamsignIds,
  });

  return {
    dreamAvatar,
    draftPoolCopiesByCard,
    openingDraftOffers,
    openingDreamsignOfferIds: [...tutorialPool.openingDreamsignIds],
    dreamsignPoolIds: [...context.allDreamsignPoolIds],
    mandatoryOnlyPoolSize: draftPoolSize,
    draftPoolSize,
    doubledCardCount: Object.values(draftPoolCopiesByCard).filter(
      (copies) => copies === 2,
    ).length,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
  };
}
