import type { CardId } from "../state/ids";
import type { BoardSetup } from "./board";

/**
 * Per-card adjustments to the card-lab board, keyed by card UUID, for cards
 * whose selectors the solver cannot satisfy on its own. Entries merge over
 * the solved board.
 */
export const LAB_OVERRIDES: Readonly<Record<CardId, Partial<BoardSetup>>> = {};
