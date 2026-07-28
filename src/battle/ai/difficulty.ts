import type { OpponentMode } from "./opponent-model";

/**
 * The three axes along which the battle AI's difficulty can be tuned
 * (`battle_ai.md` §"The Planner"):
 *
 * - `beamWidth` — SEARCH BREADTH. The top-K partial plans kept each beam round.
 *   Wider beams explore more order-sensitive lines (at more compute), narrower
 *   beams play more greedily.
 * - `opponentMode` — OPPONENT CAUTION. `"expectiminimax"` scores a play against
 *   the opponent's *expected* response (a competent, non-paranoid read);
 *   `"worstCase"` scores against the opponent's *best* reply (maximally cautious,
 *   conservative play).
 * - `sampleCap` — OPPONENT-SAMPLING DEPTH. How many opponent replies the
 *   opponent model samples when scoring a committed challenger. Deeper sampling
 *   is a sharper (and costlier) read of the opponent's likely blocking.
 */
export interface AiDifficulty {
  beamWidth: number;
  opponentMode: OpponentMode;
  sampleCap: number;
}

/**
 * v1 ships ONE competent difficulty. Harder or easier presets (wider/narrower
 * beams, `"worstCase"` caution, deeper/shallower sampling) would be added here
 * as additional named {@link AiDifficulty} configs.
 */
export const AI_DIFFICULTY_V1: AiDifficulty = {
  beamWidth: 12,
  opponentMode: "expectiminimax",
  sampleCap: 8,
};
