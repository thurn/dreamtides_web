import type { ForwardModel, AiCard } from "../forward-model";
import type { AiTargetChoice, StarterCardModel } from "./index";
import { playEvent } from "./helpers";

/**
 * #516 Flashpoint Blast (Event, 2●) — "Dissolve an enemy with cost 3● or less."
 * (`battle_ai.md` §"The AI Deck"). Removal.
 *
 * The "cost ≤ 3" legality cannot be read from an abstract {@link
 * AiOpponentBody} (the asymmetric-knowledge principle hides opponent card
 * costs). The AI therefore proposes the blast OPTIMISTICALLY against the best
 * legal-looking target and the human approves or rejects it at the
 * proposal/driver layer.
 *
 * Target choice (`battle_ai.md` §"Per-Card Knowledge"): prefer a front-rank
 * body (a blocker to clear before challenging), else the highest-spark threat.
 */
export const flashpointBlast: StarterCardModel = {
  cardNumber: 516,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return model.aiEnergy >= self.energyCost && model.opponentBodies.length > 0;
  },
  chooseTargets(model: ForwardModel): AiTargetChoice | null {
    if (model.opponentBodies.length === 0) {
      return null;
    }
    const fronts = model.opponentBodies.filter((body) => body.rank === "front");
    const pool = fronts.length > 0 ? fronts : model.opponentBodies;
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
