import { parse } from "smol-toml";
import tutorialQuestPoolSource from "../../data/tabula/tutorial_quest_pool.toml?raw";
import { TIDES4 } from "../draft/pool/variant-tides4";

export interface TutorialQuestPoolCard {
  readonly id: string;
  readonly copies: number;
}

export interface TutorialQuestTide {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: "valor";
  readonly cards: readonly TutorialQuestPoolCard[];
}

export interface TutorialQuestPool {
  readonly dreamAvatarId: string;
  readonly poolSize: number;
  readonly tides: readonly TutorialQuestTide[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIDE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function invalid(detail: string): never {
  throw new Error(`Tutorial quest pool is malformed: ${detail}.`);
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
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    return invalid(`${label} must be a positive integer`);
  }
  return value;
}

/**
 * Validate and normalize the authored tutorial pool. The expected size defaults
 * to the ordinary tides4 deal size so the tutorial cannot silently drift into
 * feeling like a smaller draft.
 */
export function validateTutorialQuestPool(
  input: unknown,
  expectedPoolSize: number = TIDES4.dealSize,
): TutorialQuestPool {
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
      `pool-size must match the normal quest pool size (${String(expectedPoolSize)})`,
    );
  }

  if (!Array.isArray(source.tides) || source.tides.length !== 3) {
    invalid("tides must contain exactly three entries");
  }

  const seenTideIds = new Set<string>();
  const seenTideNames = new Set<string>();
  const seenCardIds = new Set<string>();
  const tides = source.tides.map((value, tideIndex): TutorialQuestTide => {
    const label = `tides[${String(tideIndex)}]`;
    const tide = record(value, label);
    const id = nonBlankString(tide.id, `${label}.id`);
    if (!TIDE_ID_RE.test(id)) {
      invalid(`${label}.id must use lowercase kebab-case`);
    }
    if (seenTideIds.has(id)) {
      invalid(`${label}.id duplicates ${JSON.stringify(id)}`);
    }
    seenTideIds.add(id);

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
      (value, cardIndex): TutorialQuestPoolCard => {
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
        return { id: cardId, copies };
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

  return { dreamAvatarId, poolSize, tides };
}

export function parseTutorialQuestPool(source: string): TutorialQuestPool {
  return validateTutorialQuestPool(parse(source));
}

/** The fixed three-tide package used by the tutorial quest handoff. */
export const TUTORIAL_QUEST_POOL = parseTutorialQuestPool(
  tutorialQuestPoolSource,
);
