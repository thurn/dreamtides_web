import { BATTLE } from "../../content/battle";
import { parseCardId } from "../../types/card-identity";
import { parseDreamwellCardId } from "../../types/identifiers";
import type { TransfigurationType } from "../../types/journey";
import { isTypeRemap } from "../dsl/type-remap";
import { isTransfigurationApplications } from "../transfiguration-application-data";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES, opponent, type Side } from "./ids";
import type { DeckEntry, ValidatedBattleSetup, VictorySides } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fields(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function side(value: unknown): value is Side {
  return value === "player" || value === "enemy";
}

/** Check every raw slot, including holes, without changing accepted array order. */
export function isVictorySides(value: unknown): value is VictorySides {
  if (!Array.isArray(value) || (value.length !== 1 && value.length !== 2)) return false;
  for (let slot = 0; slot < value.length; slot++) {
    if (!Object.prototype.hasOwnProperty.call(value, slot) || !side(value[slot])) return false;
  }
  return value.length === 1 || value[0] !== value[1];
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function index(value: unknown): value is number {
  return nonnegative(value) && Number.isSafeInteger(value);
}

const TRANSFIGURATIONS = {
  Empowered: true, Amplified: true, Kindled: true, Inspired: true, Enduring: true,
  Hastened: true, Resonant: true, Attuned: true, Perfected: true,
} satisfies Record<TransfigurationType, true>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isDeclaredDeckEntry(entry: unknown): entry is DeckEntry {
  if (!record(entry)) return false;
  try { parseCardId(entry.cardId); } catch { return false; }
  if (entry.typeRemap !== undefined && !isTypeRemap(entry.typeRemap)) return false;
  if (entry.transfigurationApplications !== undefined && (entry.transfigurations !== undefined || !isTransfigurationApplications(entry.transfigurationApplications))) return false;
  if (!fields(entry, ["cardId", "amplified", "transfigurations", "transfigurationApplications", "deckMods", "typeRemap"]) ||
      (entry.amplified !== undefined && typeof entry.amplified !== "boolean") ||
      (entry.transfigurations !== undefined && (!Array.isArray(entry.transfigurations) ||
        !entry.transfigurations.every((type) => typeof type === "string" && Object.prototype.hasOwnProperty.call(TRANSFIGURATIONS, type))))) return false;
  const mods = entry.deckMods;
  return mods === undefined || (fields(mods, ["sparkBonus", "costReduction", "fast", "reclaim", "typeChange"]) &&
    finite(mods.sparkBonus) && finite(mods.costReduction) && typeof mods.fast === "boolean" &&
    (mods.reclaim === null || finite(mods.reclaim)) &&
    (mods.typeChange === null || (fields(mods.typeChange, ["cardType", "subtype"]) &&
      (mods.typeChange.cardType === "character" || mods.typeChange.cardType === "event") && typeof mods.typeChange.subtype === "string")));
}

function dreamwellIds(value: unknown): value is readonly ReturnType<typeof parseDreamwellCardId>[] {
  if (!Array.isArray(value)) return false;
  try { for (const id of value) parseDreamwellCardId(id); } catch { return false; }
  return true;
}

/** Structural declaration rules shared by creation and cold saved-load; no catalog access. */
function isPreparedSetup(value: unknown, init: Record<string, unknown>): value is ValidatedBattleSetup {
  if (!fields(value, ["placements", "sides", "turn", "dreamwell"]) ||
      !Array.isArray(value.placements) || !fields(value.sides, SIDES) ||
      !fields(value.turn, ["active", "phase", "round", "turnNumber", "sideTurns", "lastNormal"]) ||
      !fields(value.dreamwell, ["deck", "next"]) || !record(init.decks)) return false;
  const decks = init.decks;
  for (const owner of SIDES) {
    const deck = decks[owner];
    if (!Array.isArray(deck)) return false;
    for (const entry of deck) if (!isDeclaredDeckEntry(entry)) return false;
    const resources = value.sides[owner];
    if (!fields(resources, ["currentEnergy", "maxEnergy", "score"]) ||
        ![resources.currentEnergy, resources.maxEnergy, resources.score].every(nonnegative)) return false;
  }
  if (init.nextBattle !== undefined) {
    if (!record(init.nextBattle)) return false;
    for (const effects of Object.values(init.nextBattle)) {
      if (effects === undefined) continue;
      if (!record(effects) || effects.startingEnergy !== 0 || !Array.isArray(effects.openingHand) || effects.openingHand.length !== 0 ||
          !Array.isArray(effects.smallerHandAndCostDiscount)) return false;
      for (const discount of effects.smallerHandAndCostDiscount) {
        if (!record(discount) || discount.openingHandDelta !== 0 || !finite(discount.costReduction)) return false;
      }
    }
  }
  const turn = value.turn;
  if (!side(turn.active) || turn.lastNormal !== turn.active ||
      (turn.phase !== "draw" && turn.phase !== "dawn" && turn.phase !== "day") ||
      !index(turn.round) || turn.round === 0 || !index(turn.turnNumber) || turn.turnNumber === 0 ||
      !fields(turn.sideTurns, SIDES)) return false;
  const sideTurns = turn.sideTurns;
  if (!SIDES.every((owner) => index(sideTurns[owner]))) return false;
  const first = init.startingSide ?? BATTLE.startingSide;
  const limit = init.turnLimit === undefined ? BATTLE.turnLimit : init.turnLimit;
  if (!side(first) || (limit !== null && (!index(limit) || limit === 0))) return false;
  const second = opponent(first);
  if (turn.sideTurns[first] !== Math.ceil(turn.turnNumber / 2) || turn.sideTurns[second] !== Math.floor(turn.turnNumber / 2) ||
      turn.round !== Math.ceil(turn.turnNumber / 2) || turn.active !== (turn.turnNumber % 2 === 1 ? first : second) ||
      (limit !== null && turn.round > limit)) return false;
  if (!dreamwellIds(init.dreamwell) || !dreamwellIds(value.dreamwell.deck) ||
      !index(value.dreamwell.next) || value.dreamwell.next > value.dreamwell.deck.length ||
      new Set(init.dreamwell).size !== init.dreamwell.length) return false;
  const catalog = init.dreamwell;
  if (!value.dreamwell.deck.every((id) => catalog.includes(id))) return false;
  const copies = new Set<string>();
  const slots = new Set<string>();
  for (const placement of value.placements) {
    if (!fields(placement, ["side", "deckIndex", "zone", "slot", "exhausted"]) || !side(placement.side) ||
        !index(placement.deckIndex) ||
        (placement.zone !== "hand" && placement.zone !== "void" && placement.zone !== "play")) return false;
    const deck = decks[placement.side];
    if (!Array.isArray(deck) || placement.deckIndex >= deck.length) return false;
    const copy = `${placement.side}:${placement.deckIndex}`;
    if (copies.has(copy)) return false;
    copies.add(copy);
    if (placement.zone !== "play") {
      if (placement.slot !== undefined || placement.exhausted !== undefined) return false;
      continue;
    }
    const slot = placement.slot;
    if (!fields(slot, ["rank", "index"]) || (slot.rank !== "front" && slot.rank !== "back") || !index(slot.index) ||
        slot.index >= (slot.rank === "front" ? FRONT_RANK_SIZE : BACK_RANK_SIZE) ||
        (placement.exhausted !== undefined && typeof placement.exhausted !== "boolean")) return false;
    const cell = `${placement.side}:${slot.rank}:${slot.index}`;
    if (slots.has(cell)) return false;
    slots.add(cell);
  }
  return true;
}

/** Undefined denotes ordinary initialization; null refuses a malformed prepared declaration. */
export function decodeBattleSetup(init: unknown): ValidatedBattleSetup | null | undefined {
  if (!record(init)) return null;
  if (init.setup === undefined) return undefined;
  return isPreparedSetup(init.setup, init) ? init.setup : null;
}
