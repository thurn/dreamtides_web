import { parse } from "smol-toml";
import tutorialJourneyPoolSource from "../../data/tutorial_journey_pool.toml?raw";
import { DEFAULT_TIDES4_TUNING } from "../draft/pool/variant-tides4";
import type { DreamAvatarId, DreamsignId, TideId } from "../types/identifiers";
import { asDreamAvatarId, asDreamsignId, asTideId } from "../types/identifiers";
import { asCardId, type CardId } from "../types/card-identity";

export interface TutorialJourneyPoolCard {
  readonly id: CardId;
  readonly copies: number;
}

export interface TutorialJourneyTide {
  readonly id: TideId;
  readonly name: string;
  readonly description: string;
  readonly type: "valor";
  readonly cards: readonly TutorialJourneyPoolCard[];
}

export interface TutorialJourneyPool {
  readonly dreamAvatarId: DreamAvatarId;
  readonly poolSize: number;
  readonly openingOffers: readonly (readonly CardId[])[];
  readonly openingDreamsignIds: readonly DreamsignId[];
  readonly tides: readonly TutorialJourneyTide[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIDE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function invalid(detail: string): never {
  throw new Error(`Tutorial journey pool is malformed: ${detail}.`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(`${label} must be a table`);
  }
  return value as Record<string, unknown>;
}

function nonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return invalid(`${label} must be a non-blank string`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return invalid(`${label} must be a positive integer`);
  }
  return value;
}

/**
 * Validate and normalize the authored tutorial pool. The expected size defaults
 * to the ordinary tides4 deal size so the tutorial cannot silently drift into
 * feeling like a smaller draft.
 */
export function validateTutorialJourneyPool(
  input: unknown,
  expectedPoolSize: number = DEFAULT_TIDES4_TUNING.dealSize,
): TutorialJourneyPool {
  const source = record(input, "root");
  const dreamAvatarId = nonBlankString(
    source["dream-avatar-id"],
    "dream-avatar-id",
  );
  if (!UUID_RE.test(dreamAvatarId)) {
    invalid("dream-avatar-id must be a UUID");
  }

  const poolSize = positiveInteger(source["pool-size"], "pool-size");
  if (poolSize !== expectedPoolSize) {
    invalid(
      `pool-size must match the normal journey pool size (${String(expectedPoolSize)})`,
    );
  }

  const rawOpeningDreamsignIds = source["opening-dreamsigns"];
  if (
    !Array.isArray(rawOpeningDreamsignIds) ||
    rawOpeningDreamsignIds.length === 0 ||
    rawOpeningDreamsignIds.length > 3
  ) {
    invalid("opening-dreamsigns must contain between one and three UUIDs");
  }
  const openingDreamsignIds = rawOpeningDreamsignIds.map((value, index) => {
    const id = nonBlankString(value, `opening-dreamsigns[${String(index)}]`);
    if (!UUID_RE.test(id)) {
      invalid(`opening-dreamsigns[${String(index)}] must be a UUID`);
    }
    return asDreamsignId(id);
  });
  if (
    new Set(openingDreamsignIds.map((id) => id.toLocaleLowerCase())).size !==
    openingDreamsignIds.length
  ) {
    invalid("opening-dreamsigns must not contain duplicate UUIDs");
  }

  if (!Array.isArray(source.tides) || source.tides.length === 0) {
    invalid("tides must contain at least one entry");
  }

  const rawOpeningOffers = source["opening-offers"];
  if (!Array.isArray(rawOpeningOffers) || rawOpeningOffers.length === 0) {
    invalid("opening-offers must contain at least one offer");
  }
  const openingCardIds = new Set<string>();
  const openingOffers = rawOpeningOffers.map((value, offerIndex) => {
    const label = `opening-offers[${String(offerIndex)}]`;
    if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
      return invalid(`${label} must contain between one and four card UUIDs`);
    }
    return value.map((cardIdValue, cardIndex) => {
      const cardId = nonBlankString(
        cardIdValue,
        `${label}[${String(cardIndex)}]`,
      );
      if (!UUID_RE.test(cardId)) {
        invalid(`${label}[${String(cardIndex)}] must be a UUID`);
      }
      const normalizedCardId = cardId.toLocaleLowerCase();
      if (openingCardIds.has(normalizedCardId)) {
        invalid(`${label} duplicates opening card ${JSON.stringify(cardId)}`);
      }
      openingCardIds.add(normalizedCardId);
      return asCardId(cardId);
    });
  });

  const seenTideIds = new Set<string>();
  const seenTideNames = new Set<string>();
  const seenCardIds = new Set<string>();
  const tides = source.tides.map((value, tideIndex): TutorialJourneyTide => {
    const label = `tides[${String(tideIndex)}]`;
    const tide = record(value, label);
    const rawId = nonBlankString(tide.id, `${label}.id`);
    if (!TIDE_ID_RE.test(rawId)) {
      invalid(`${label}.id must use lowercase kebab-case`);
    }
    if (seenTideIds.has(rawId)) {
      invalid(`${label}.id duplicates ${JSON.stringify(rawId)}`);
    }
    seenTideIds.add(rawId);
    const id = asTideId(rawId);

    const name = nonBlankString(tide.name, `${label}.name`);
    const normalizedName = name.toLocaleLowerCase();
    if (seenTideNames.has(normalizedName)) {
      invalid(`${label}.name duplicates ${JSON.stringify(name)}`);
    }
    seenTideNames.add(normalizedName);

    const description = nonBlankString(
      tide.description,
      `${label}.description`,
    );
    if (tide.type !== "valor") {
      invalid(`${label}.type must be "valor"`);
    }
    if (!Array.isArray(tide.cards) || tide.cards.length === 0) {
      invalid(`${label}.cards must be a non-empty array`);
    }

    const cards = tide.cards.map(
      (value, cardIndex): TutorialJourneyPoolCard => {
        const cardLabel = `${label}.cards[${String(cardIndex)}]`;
        const card = record(value, cardLabel);
        const cardId = nonBlankString(card.id, `${cardLabel}.id`);
        if (!UUID_RE.test(cardId)) {
          invalid(`${cardLabel}.id must be a UUID`);
        }
        const normalizedCardId = cardId.toLocaleLowerCase();
        if (seenCardIds.has(normalizedCardId)) {
          invalid(`${cardLabel}.id duplicates ${JSON.stringify(cardId)}`);
        }
        seenCardIds.add(normalizedCardId);

        const copies = positiveInteger(card.copies, `${cardLabel}.copies`);
        if (copies > 2) {
          invalid(`${cardLabel}.copies exceeds the normal two-copy limit`);
        }
        return { id: asCardId(cardId), copies };
      },
    );
    return { id, name, description, type: "valor", cards };
  });

  const authoredCopyCount = tides.reduce(
    (poolTotal, tide) =>
      poolTotal +
      tide.cards.reduce((tideTotal, card) => tideTotal + card.copies, 0),
    0,
  );
  if (authoredCopyCount !== poolSize) {
    invalid(
      `tide cards contain ${String(authoredCopyCount)} copies, expected ${String(poolSize)}`,
    );
  }

  for (const openingCardId of openingCardIds) {
    if (!seenCardIds.has(openingCardId)) {
      invalid(
        `opening card ${JSON.stringify(openingCardId)} is not in a tutorial tide`,
      );
    }
  }

  return {
    dreamAvatarId: asDreamAvatarId(dreamAvatarId),
    poolSize,
    openingOffers,
    openingDreamsignIds,
    tides,
  };
}

export function parseTutorialJourneyPool(source: string): TutorialJourneyPool {
  return validateTutorialJourneyPool(parse(source));
}

/** The authored package used by the tutorial journey handoff. */
export const TUTORIAL_JOURNEY_POOL = parseTutorialJourneyPool(
  tutorialJourneyPoolSource,
);
