import { buildDreamwellDeck } from "../../rules/dreamwell";
import { drawCard } from "../../rules/resources";
import { beginFirstTurn } from "../../rules/turn";
import { SIDES } from "../../state/ids";
import { shuffleInPlace } from "../../state/rng";
import type { DreamwellCardId } from "../../state/ids";
import type { StepDefinition } from "../types";

/** Shuffles both decks, builds the Dreamwell, deals opening hands, and starts turn 1. */
export interface BeginBattleStep {
  readonly kind: "beginBattle";
  readonly dreamwell: readonly DreamwellCardId[];
}

export const beginBattle: StepDefinition<BeginBattleStep> = {
  kind: "beginBattle",
  canceller: () => null,
  run(ctx, step) {
    const { state } = ctx;
    for (const side of SIDES) {
      shuffleInPlace(state, `shuffle:${side}`, state.sides[side].deck);
    }
    buildDreamwellDeck(state, ctx.catalog, step.dreamwell);
    for (const side of SIDES) {
      for (let count = 0; count < state.config.openingHandSize[side]; count++) {
        drawCard(ctx, side);
      }
    }
    beginFirstTurn(ctx);
  },
};
