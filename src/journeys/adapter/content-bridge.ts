// Content bridge: quest-prototype content types → journey-internal content
// types.
//
// This is one of two files (with `buildContext.ts`) responsible for keeping
// the rest of `src/journeys/` sealed off from the rest of the quest
// prototype. Every translation rule the spec dictates lives here so a single
// audit covers the whole boundary.

import type { CardContent, ContentBundle, DreamcallerContent as JourneyDreamcaller, DreamsignContent } from "../content/types";
import type { CardData } from "../../types/cards";
import type { DreamcallerContent, DreamsignTemplate } from "../../types/content";

/**
 * Map a quest-prototype rarity into the journey module's rarity bucket. The
 * journey side uses three values:
 * - `"Rare"` for cards the prototype marks `"Legendary"`.
 * - `"Starter"` for cards in the fixed starter deck.
 * - `"Uncommon"` for everything else (including cards with no rarity).
 */
export function normalizeRarity(rarity: string | undefined): string {
  if (rarity === "Legendary") {
    return "Rare";
  }
  if (rarity === "Starter") {
    return "Starter";
  }
  return "Uncommon";
}

/**
 * Translate a single `CardData` record into the journey-internal
 * `CardContent` shape. The `raw` map mirrors the keys the CLI's effect
 * resolvers consume (`rendered-text`, `is-fast`, `subtype`, etc.), so the
 * ported predicate helpers see the same byte content they would have seen
 * had they been fed a CLI-loaded card.
 */
export function cardDataToCardContent(card: CardData): CardContent {
  const energyCost: CardContent["energyCost"] = card.energyCost ?? "*";
  const spark: CardContent["spark"] = card.spark ?? "";

  return {
    id: card.id,
    name: card.name,
    rarity: normalizeRarity(card.rarity),
    cardType: card.cardType,
    energyCost,
    spark,
    cardNumber: card.cardNumber,
    raw: {
      id: card.id,
      name: card.name,
      "card-number": card.cardNumber,
      "card-type": card.cardType,
      subtype: card.subtype,
      "is-starter": card.isStarter,
      isStarter: card.isStarter,
      rarity: card.rarity ?? "",
      "energy-cost": card.energyCost,
      energyCost: card.energyCost,
      spark: card.spark,
      "is-fast": card.isFast,
      isFast: card.isFast,
      "rendered-text": card.renderedText,
      renderedText: card.renderedText,
      "image-number": card.imageNumber,
    },
  };
}

/**
 * Translate a `DreamcallerContent` record into the journey-internal
 * `Dreamcaller`. The journey side carries an `awakening` field the quest
 * prototype does not model; default it to `"0"` so downstream renderers see
 * a stable empty value.
 */
export function dreamcallerContentToJourneyDreamcaller(
  source: DreamcallerContent,
): JourneyDreamcaller {
  return {
    id: source.id,
    name: source.name,
    title: source.title,
    awakening: "0",
    raw: {
      id: source.id,
      name: source.name,
      title: source.title,
      "rendered-text": source.renderedText,
      renderedText: source.renderedText,
      "image-number": source.imageNumber,
      "starting-essence": source.startingEssence,
      startingEssence: source.startingEssence,
    },
  };
}

/**
 * Translate a `DreamsignTemplate` into the journey-internal `Dreamsign`.
 * Dreamsigns are `neutral`: the quest prototype does not distinguish tidal
 * dreamsigns. The `orientation` axis is omitted: the quest prototype does not
 * distinguish quest- vs. battle-oriented dreamsigns.
 */
export function dreamsignTemplateToJourneyDreamsign(
  source: DreamsignTemplate,
): DreamsignContent {
  return {
    id: source.id,
    name: source.name,
    kind: "neutral",
    renderedText: source.effectDescription,
    raw: {
      id: source.id,
      name: source.name,
      "effect-description": source.effectDescription,
      effectDescription: source.effectDescription,
      ...(source.imageName === undefined ? {} : { "image-name": source.imageName }),
      ...(source.imageAlt === undefined ? {} : { "image-alt": source.imageAlt }),
    },
  };
}

/**
 * Build the journey-internal `ContentBundle` from the prototype's content.
 * The arrays preserve the input ordering so downstream determinism does not
 * depend on a Map iteration.
 */
export function buildJourneyContentBundle(input: {
  readonly cards: readonly CardData[];
  readonly dreamcallers: readonly DreamcallerContent[];
  readonly dreamsignTemplates: readonly DreamsignTemplate[];
}): ContentBundle {
  return {
    cards: input.cards.map(cardDataToCardContent),
    dreamcallers: input.dreamcallers.map(dreamcallerContentToJourneyDreamcaller),
    dreamsigns: input.dreamsignTemplates.map(dreamsignTemplateToJourneyDreamsign),
  };
}
