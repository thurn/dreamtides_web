import { parseCardSubtype } from "../../types/card-identity";
import { NO_DECK_MODS, type DeckMods } from "./types";

/** Strict transport boundary for an optional subset of the existing deck modifiers. */
export function deckModsFromUnknown(value: unknown): DeckMods {
  const invalid = (): never => { throw new Error("Invalid deck modifications"); };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["sparkBonus", "costReduction", "fast", "reclaim", "typeChange"].includes(key))) return invalid();
  const whole = (key: "sparkBonus" | "costReduction"): number => {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return NO_DECK_MODS[key];
    const number = input[key];
    return typeof number === "number" && Number.isSafeInteger(number) && (key === "sparkBonus" || number >= 0) ? number : invalid();
  };
  const sparkBonus = whole("sparkBonus");
  const costReduction = whole("costReduction");
  const fast = Object.prototype.hasOwnProperty.call(input, "fast") ? input.fast : false;
  if (typeof fast !== "boolean") return invalid();
  const reclaim = Object.prototype.hasOwnProperty.call(input, "reclaim") ? input.reclaim : null;
  if (reclaim !== null && (typeof reclaim !== "number" || !Number.isSafeInteger(reclaim) || reclaim < 0)) return invalid();
  const change = Object.prototype.hasOwnProperty.call(input, "typeChange") ? input.typeChange : null;
  if (change === null) return { sparkBonus, costReduction, fast, reclaim, typeChange: null };
  if (typeof change !== "object" || Array.isArray(change)) return invalid();
  const type = change as Record<string, unknown>;
  if (Object.keys(type).length !== 2 || !Object.prototype.hasOwnProperty.call(type, "cardType") || !Object.prototype.hasOwnProperty.call(type, "subtype") ||
      (type.cardType !== "character" && type.cardType !== "event") || typeof type.subtype !== "string") return invalid();
  return { sparkBonus, costReduction, fast, reclaim, typeChange: { cardType: type.cardType, subtype: parseCardSubtype(type.subtype) } };
}
