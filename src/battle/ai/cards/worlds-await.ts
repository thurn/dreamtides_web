import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../../types";
import type { ForwardModel, AiCard } from "../forward-model";
import type { AiTargetChoice, StarterCardModel } from "./index";
import { playEvent } from "./helpers";

const WILDFLOWER_COLOSSUS = 515;

/** Every AI ally on the board, deployed cards first (preferred challengers). */
function friendlyAllies(model: ForwardModel): AiCard[] {
  const allies: AiCard[] = [];
  for (const slot of FRONT_RANK_SLOT_IDS) {
    const card = model.aiFrontRank[slot];
    if (card !== null) {
      allies.push(card);
    }
  }
  for (const slot of BACK_RANK_SLOT_IDS) {
    const card = model.aiBackRank[slot];
    if (card !== null) {
      allies.push(card);
    }
  }
  return allies;
}

function baseSpark(card: AiCard): number {
  return card.basePrintedSpark * card.figmentCount + card.sparkDelta;
}

/**
 * #519 Worlds Await (Event, 1●) — "Give an ally +3✦." (`battle_ai.md`
 * §"The AI Deck"). A proactive pump: standard timing, so the AI plays it to
 * push a challenger past a likely blocker or grow Wildflower Colossus toward
 * lethal.
 *
 * Target choice: prefer a deployed challenger (allies are listed deployed-first
 * and chosen by highest base spark); a Wildflower Colossus is favored on a
 * tie since its own static stacks with the pump.
 */
export const worldsAwait: StarterCardModel = {
  cardNumber: 519,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return model.aiEnergy >= self.energyCost && friendlyAllies(model).length > 0;
  },
  chooseTargets(model: ForwardModel): AiTargetChoice | null {
    const allies = friendlyAllies(model);
    if (allies.length === 0) {
      return null;
    }
    // Allies are deployed-first; pick the highest base spark, breaking ties
    // toward Wildflower Colossus. The stable scan keeps the earlier
    // (deployed) ally on equal base spark.
    let best = allies[0];
    for (const ally of allies) {
      const beats = baseSpark(ally) > baseSpark(best);
      const tieToColossus =
        baseSpark(ally) === baseSpark(best) &&
        ally.cardNumber === WILDFLOWER_COLOSSUS &&
        best.cardNumber !== WILDFLOWER_COLOSSUS;
      if (beats || tieToColossus) {
        best = ally;
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
      for (const ally of friendlyAllies(model)) {
        if (ally.battleCardId === targetId) {
          ally.sparkDelta += 3;
          return;
        }
      }
    });
  },
};
