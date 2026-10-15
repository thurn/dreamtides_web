/** Pure validation of the selected-slot declaration, shared by construction and cold saves. */
import { parseDeckEntryId, parseDreamsignId } from "../../types/identifiers";
import { SIDES } from "./ids";
import type { BattleInit } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function index(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** With an init, also checks original slot bounds, held occurrences and prepared setup. */
export function validOpeningHandGuarantees(value: unknown, init?: unknown): value is BattleInit["guaranteedOpeningHand"] {
  if (value === undefined) return true;
  if (!record(value) || !Object.keys(value).every(key => SIDES.some(side => side === key))) return false;
  for (const side of SIDES) {
    const declarations = value[side];
    if (declarations === undefined) {
      if (Object.prototype.hasOwnProperty.call(value, side)) return false;
      continue;
    }
    if (!Array.isArray(declarations)) return false;
    let previous = -1;
    const entries = new Map<ReturnType<typeof parseDeckEntryId>, number>();
    const slots = new Map<number, ReturnType<typeof parseDeckEntryId>>();
    const sources: readonly unknown[] = declarations;
    for (const source of sources) {
      if (!record(source) || Object.keys(source).length !== 4 ||
          !Object.keys(source).every(key => ["deckIndex", "entryId", "dreamsignId", "heldIndex"].includes(key)) ||
          !index(source.deckIndex) || !index(source.heldIndex) || source.heldIndex <= previous) return false;
      try {
        const entry = parseDeckEntryId(source.entryId);
        const sign = parseDreamsignId(source.dreamsignId);
        if (entry !== source.entryId || sign !== source.dreamsignId ||
            (entries.has(entry) && entries.get(entry) !== source.deckIndex) ||
            (slots.has(source.deckIndex) && slots.get(source.deckIndex) !== entry)) return false;
        entries.set(entry, source.deckIndex);
        slots.set(source.deckIndex, entry);
        if (init !== undefined) {
          if (!record(init) || init.setup !== undefined || !record(init.decks) || !Array.isArray(init.decks[side]) ||
              source.deckIndex >= init.decks[side].length || !record(init.dreamsigns) ||
              !Array.isArray(init.dreamsigns[side]) || init.dreamsigns[side][source.heldIndex] !== sign) return false;
        }
      } catch {
        return false;
      }
      previous = source.heldIndex;
    }
  }
  return true;
}
