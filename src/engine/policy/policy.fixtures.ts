/**
 * Shared synthetic fixtures for the policy tests: the cards, engine, fold,
 * budgets, and request helpers.
 */
import type { EngineCardDefinition } from "../catalog";
import { createEngine, type Engine } from "../engine";
import { createFoldAdapter, type FoldAdapter } from "../fold/slice";
import { battleSeed, type Side } from "../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../state/types";
import { boardState, type BoardSetup } from "../testing/board";
import { CYCLE_CARDS } from "../testing/loop-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { PolicyRequest } from "./decide";
import type { PolicyBudget, PolicyId } from "./types";

/** Two 1● characters that differ only in spark. */
export const weak: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x4501) };
export const strong: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x4502), spark: 4 };
/** A pending (text-less) character, as a loaded card the content modules lack plays (D36). */
export const textless: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x4503), status: "pending" };

export const engine: Engine = createEngine(testCatalog([weak, strong, textless, ...CYCLE_CARDS]));
export const fold: FoldAdapter = createFoldAdapter(engine);

export const ITERATIONS_ONLY: Readonly<Record<"turnPlanning" | "response", PolicyBudget>> = {
  turnPlanning: { iterations: 256 },
  response: { iterations: 64 },
};

export const deck = Array.from({ length: 6 }, () => SYNTHETIC.vanilla1.id);
export const entries = (ids: readonly EngineCardDefinition["id"][]): DeckEntry[] => ids.map((cardId) => ({ cardId }));

export function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "enemy", phase: "day", ...setup });
}

/** A request for `side`'s top-level decision in a board state. */
export function topLevelRequest(state: BattleState, side: Side, policy: PolicyId, decklists: Record<Side, DeckEntry[]>, budget: PolicyBudget = { iterations: 64 }): PolicyRequest {
  const decision = engine.decision(state);
  if (decision?.side !== side) throw new Error(`not ${side}'s decision`);
  return {
    policy,
    side,
    key: `${state.version}:0:decision`,
    view: engine.view(state, side),
    decision: { kind: "topLevel", decision, legal: engine.legalActions(state, side) },
    decklists,
    seed: battleSeed(`policy-test|${side}`),
    budget,
  };
}

export const boardInit: BattleInit = { seed: battleSeed("board"), scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] };
