import { battleSeed, type Side } from "../../state/ids";
import type { BattleInit, DeckEntry } from "../../state/types";

/** Public initialized battles place the original input slot in hand at a real Day boundary. */
export function chronologicalInit(side: Side, entry: DeckEntry, filler: DeckEntry): BattleInit {
  return {
    seed: battleSeed("chronological-forms"), scoreToWin: 100, startingSide: side,
    decks: { player: side === "player" ? [entry, filler, filler, filler] : [], enemy: side === "enemy" ? [entry, filler, filler, filler] : [] }, dreamwell: [],
    setup: {
      placements: [{ side, deckIndex: 0, zone: "hand" }],
      sides: { player: { currentEnergy: 20, maxEnergy: 20, score: 0 }, enemy: { currentEnergy: 20, maxEnergy: 20, score: 0 } },
      turn: { active: side, lastNormal: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 } },
      dreamwell: { deck: [], next: 0 },
    },
  };
}
