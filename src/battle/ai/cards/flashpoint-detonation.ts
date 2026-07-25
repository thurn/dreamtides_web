import type { ForwardModel, AiCard } from "../forward-model";
import type { AiTargetChoice, StarterCardModel } from "./index";
import { playEvent } from "./helpers";

/** Flashpoint Detonation only dissolves an enemy whose cost is at most this. */
const MAX_TARGET_COST = 2;

/**
 * #516 Flashpoint Detonation (Event, 3●) — "Dissolve an enemy with cost 2● or less."
 * (`battle_ai.md` §"The AI Deck"). Removal.
 *
 * The "cost ≤ 2" legality is read from the body's `energyCost`: a card in play
 * is public, so its cost is known even though the rest of the opponent's hand
 * and deck stay abstract. Only bodies at or under {@link MAX_TARGET_COST} are
 * legal targets, so the AI never proposes dissolving a body the spell cannot
 * actually hit.
 *
 * Target choice (`battle_ai.md` §"Per-Card Knowledge"): among the legal targets,
 * prefer a front-rank body (a blocker to clear before challenging), else the
 * highest-spark threat.
 */
export const flashpointDetonation: StarterCardModel = {
  cardNumber: 516,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return model.aiEnergy >= self.energyCost && hasLegalTarget(model);
  },
  chooseTargets(model: ForwardModel): AiTargetChoice | null {
    const legal = model.opponentBodies.filter((body) => body.energyCost <= MAX_TARGET_COST);
    if (legal.length === 0) {
      return null;
    }
    const fronts = legal.filter((body) => body.rank === "front");
    const pool = fronts.length > 0 ? fronts : legal;
    let best = pool[0];
    for (const body of pool) {
      if (body.effectiveSpark > best.effectiveSpark) {
        best = body;
      }
    }
    return { targetBattleCardId: best.battleCardId };
  },
  play(model: ForwardModel, self: AiCard, targets: AiTargetChoice | null): void {
    playEvent(model, self, () => {
      const targetId = targets?.targetBattleCardId;
      if (targetId === undefined || targetId === null) {
        return;
      }
      const index = model.opponentBodies.findIndex((body) => body.battleCardId === targetId);
      if (index === -1) {
        return;
      }
      model.opponentBodies.splice(index, 1);
      model.opponentVoidCount += 1;
    });
  },
};

/** Whether any enemy body is cheap enough for Flashpoint Detonation to dissolve. */
function hasLegalTarget(model: ForwardModel): boolean {
  return model.opponentBodies.some((body) => body.energyCost <= MAX_TARGET_COST);
}
