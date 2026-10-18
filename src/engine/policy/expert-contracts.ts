/**
 * The Expert's strategy boundary (phase-7-ai § 7.3): what each Expert
 * strategy module (Dusk assignment, valuation and Day sequencing, prompts)
 * is handed for one decision of one side. It binds the 7.2a position
 * evaluation and the AST features to that side, the engine and both
 * decklists, so a strategy injects them rather than importing a policy.
 */
import type { CardId, Side } from "../state/ids";
import type { Engine } from "../engine";
import { cardFeatures, type CardFeatures } from "../dsl/ai-features";
import type { Decklists } from "../view/determinize";
import type { BattleView } from "../view/view";
import { evaluate, type Evaluation } from "./evaluation";

export interface ExpertContext {
  /** Simulates and determinizes; never handed the battle's state. */
  readonly engine: Engine;
  readonly side: Side;
  readonly decklists: Decklists;
  /** The position evaluation of a view of the battle, for `side`. */
  evaluate(view: BattleView): Evaluation;
  /** The AST features of a printed card, read once per context. */
  features(cardId: CardId): CardFeatures;
}

/** The strategy context for `side`'s decisions. */
export function expertContext(engine: Engine, side: Side, decklists: Decklists): ExpertContext {
  const features = new Map<CardId, CardFeatures>();
  return {
    engine,
    side,
    decklists,
    evaluate: (view) => evaluate(view, side, { catalog: engine.catalog, decklists }),
    features: (cardId) => {
      const known = features.get(cardId);
      if (known !== undefined) return known;
      const read = cardFeatures(engine.catalog.card(cardId));
      features.set(cardId, read);
      return read;
    },
  };
}
