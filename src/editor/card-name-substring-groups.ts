import type { EditorCardRecord, EditorSortDirection } from "./types";
import type { CardId } from "../types/card-identity";

declare const cardNameSubstringKeyBrand: unique symbol;
declare const cardParticipantSetKeyBrand: unique symbol;

export type CardNameSubstringKey = string & {
  readonly [cardNameSubstringKeyBrand]: "CardNameSubstringKey";
};

type CardParticipantSetKey = string & {
  readonly [cardParticipantSetKeyBrand]: "CardParticipantSetKey";
};

export type CardNameSubstringOccurrenceKey =
  | CardId
  | `${CardNameSubstringKey}\u0000${CardId}`;

export const MIN_CARD_NAME_SUBSTRING_LENGTH = 5;

export interface CardNameSubstringGroup {
  /** Case-folded substring used as the stable render occurrence key. */
  key: CardNameSubstringKey;
  /** Substring with casing preserved from the first matching card name. */
  substring: string;
  cards: readonly EditorCardRecord[];
}

interface CandidateGroup {
  key: CardNameSubstringKey;
  substring: string;
  cardsById: Map<CardId, EditorCardRecord>;
}

function cardNameSubstringKey(value: string): CardNameSubstringKey {
  return value as CardNameSubstringKey;
}

function participantKey(group: CandidateGroup): CardParticipantSetKey {
  return Array.from(group.cardsById.keys()).sort().join("\u0000") as CardParticipantSetKey;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Groups cards by every maximal substring with 5+ non-space characters shared
 * by at least two card names. Matching is case-insensitive, surrounding
 * whitespace is excluded from labels, and card participation is tracked by
 * UUID. A shorter substring is suppressed only when a longer matching
 * substring has the exact same participants; distinct overlaps remain
 * separate groups, so one UUID may intentionally appear in several groups.
 */
export function buildCardNameSubstringGroups(
  cards: readonly EditorCardRecord[],
  direction: EditorSortDirection = "asc",
): CardNameSubstringGroup[] {
  const candidatesByKey = new Map<CardNameSubstringKey, CandidateGroup>();

  for (const card of cards) {
    const foldedName = card.name.toLocaleLowerCase();
    const seenForCard = new Set<CardNameSubstringKey>();

    for (let start = 0; start < foldedName.length; start += 1) {
      for (
        let end = start + MIN_CARD_NAME_SUBSTRING_LENGTH;
        end <= foldedName.length;
        end += 1
      ) {
        const raw = foldedName.slice(start, end);
        const key = cardNameSubstringKey(raw.trim());
        if (
          key.replace(/\s/gu, "").length <
            MIN_CARD_NAME_SUBSTRING_LENGTH ||
          seenForCard.has(key)
        ) {
          continue;
        }

        seenForCard.add(key);
        const leadingWhitespace = raw.length - raw.trimStart().length;
        const trailingWhitespace = raw.length - raw.trimEnd().length;
        const substring = card.name.slice(
          start + leadingWhitespace,
          end - trailingWhitespace,
        );
        const candidate = candidatesByKey.get(key) ?? {
          key,
          substring,
          cardsById: new Map<CardId, EditorCardRecord>(),
        };
        candidate.cardsById.set(card.id, card);
        candidatesByKey.set(key, candidate);
      }
    }
  }

  const matchingCandidates = Array.from(candidatesByKey.values()).filter(
    (candidate) => candidate.cardsById.size >= 2,
  );
  const candidatesByParticipants = new Map<CardParticipantSetKey, CandidateGroup[]>();
  for (const candidate of matchingCandidates) {
    const key = participantKey(candidate);
    const bucket = candidatesByParticipants.get(key) ?? [];
    bucket.push(candidate);
    candidatesByParticipants.set(key, bucket);
  }

  const directionMultiplier = direction === "asc" ? 1 : -1;
  const groups: CardNameSubstringGroup[] = [];
  for (const candidates of candidatesByParticipants.values()) {
    for (const candidate of candidates) {
      const isContainedByEquivalentMatch = candidates.some(
        (other) =>
          other.key.length > candidate.key.length &&
          other.key.includes(candidate.key),
      );
      if (isContainedByEquivalentMatch) {
        continue;
      }

      groups.push({
        key: candidate.key,
        substring: candidate.substring,
        cards: Array.from(candidate.cardsById.values()).sort(
          (left, right) =>
            (compareText(left.name, right.name) ||
              left.cardNumber - right.cardNumber ||
              left.id.localeCompare(right.id)) *
            directionMultiplier,
        ),
      });
    }
  }

  return groups.sort(
    (left, right) =>
      (compareText(left.substring, right.substring) ||
        left.key.localeCompare(right.key)) *
      directionMultiplier,
  );
}
