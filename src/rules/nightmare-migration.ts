import { NIGHTMARE_CARD_NUMBER } from "../data/nightmare";
import {
  deckEntryIdFromUnknown,
  type DeckEntryId,
} from "../types/identifiers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Normalize a journey snapshot to the Nightmare-only Bane contract. Every
 * historical Bane marker and temporary-grant reference becomes Nightmare.
 */
export function normalizePersistedNightmareJourney(value: unknown): unknown {
  if (!isRecord(value)) return value;

  let changed = false;
  const temporaryNightmareEntryIds = new Set<DeckEntryId>();
  if (Array.isArray(value.battleModifiers)) {
    for (const modifier of value.battleModifiers) {
      if (!isRecord(modifier) || modifier.kind !== "temporary_bane_grant") {
        continue;
      }
      if (!Array.isArray(modifier.addedEntryIds)) continue;
      for (const entryId of modifier.addedEntryIds) {
        const parsedEntryId = deckEntryIdFromUnknown(entryId);
        if (parsedEntryId !== null) temporaryNightmareEntryIds.add(parsedEntryId);
      }
    }
  }

  let deck = value.deck;
  if (Array.isArray(deck)) {
    const entries: unknown[] = deck;
    deck = entries.map((entry): unknown => {
      if (!isRecord(entry) || typeof entry.isBane !== "boolean") return entry;
      const entryId = deckEntryIdFromUnknown(entry.entryId);
      const isBane =
        entry.isBane ||
        entry.cardNumber === NIGHTMARE_CARD_NUMBER ||
        (entryId !== null && temporaryNightmareEntryIds.has(entryId));
      const cardNumber = isBane ? NIGHTMARE_CARD_NUMBER : entry.cardNumber;
      if (entry.isBane === isBane && entry.cardNumber === cardNumber) return entry;
      changed = true;
      return { ...entry, cardNumber, isBane };
    });
  }

  let dreamsigns = value.dreamsigns;
  if (Array.isArray(dreamsigns)) {
    const entries: unknown[] = dreamsigns;
    dreamsigns = entries.map((dreamsign): unknown => {
      if (
        !isRecord(dreamsign) ||
        (!("isBane" in dreamsign) && !("isNegative" in dreamsign))
      ) {
        return dreamsign;
      }
      const { isBane: _isBane, isNegative: _isNegative, ...current } = dreamsign;
      changed = true;
      return current;
    });
  }

  let battleModifiers = value.battleModifiers;
  if (Array.isArray(battleModifiers)) {
    const modifiers: unknown[] = battleModifiers;
    battleModifiers = modifiers.flatMap((modifier): unknown[] => {
      if (!isRecord(modifier) || modifier.kind !== "temporary_bane_grant") {
        return [modifier];
      }
      changed = true;
      const addedEntryIds = Array.isArray(modifier.addedEntryIds)
        ? modifier.addedEntryIds.filter(
            (entryId): entryId is DeckEntryId =>
              deckEntryIdFromUnknown(entryId) !== null,
          )
        : [];
      if (addedEntryIds.length === 0) return [];
      return [{ ...modifier, kind: "temporary_nightmare_grant" }];
    });
  }

  return changed ? { ...value, deck, dreamsigns, battleModifiers } : value;
}

/** Normalize the journey slice of a decoded event-log compaction snapshot. */
export function normalizePersistedNightmareState(value: unknown): unknown {
  if (!isRecord(value) || !("journey" in value)) return value;
  const journey = normalizePersistedNightmareJourney(value.journey);
  return journey === value.journey ? value : { ...value, journey };
}
