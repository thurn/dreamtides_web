import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { playEvent } from "./helpers";
import { asBattleCardId } from "../../../types/identifiers";

/**
 * Monotonic counter making each approximated discovery's synthetic
 * `battleCardId` unique within a process.
 */
let discoverCounter = 0;

/**
 * #518 Sign of Arrival (Event, 2●) — "Discover a character." (`battle_ai.md`
 * §"The AI Deck"). A toolbox / card-advantage event.
 *
 * The real Discover offers three characters revealed from the AI's own Starter
 * deck and is resolved INTERACTIVELY at the proposal/driver layer. For
 * planning the forward model approximates it by adding one representative
 * Starter character — Marked Direwolf (#512), a solid front body and a fine
 * default for the deck's role needs — to the hand as a fresh {@link AiCard}
 * with a synthetic `discovered:<n>` id. `valueHint` reflects the
 * card-advantage the event provides.
 */
export const signOfArrival: StarterCardModel = {
  cardNumber: 518,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return model.aiEnergy >= self.energyCost;
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playEvent(model, self, () => {
      discoverCounter += 1;
      const discovered: AiCard = {
        battleCardId: asBattleCardId(`discovered:${discoverCounter}`),
        cardNumber: 512,
        name: "Marked Direwolf",
        energyCost: 4,
        basePrintedSpark: 4,
        sparkDelta: 0,
        figmentCount: 1,
        canChallengeThisTurn: false,
      };
      model.aiHand.push(discovered);
    });
  },
  valueHint(): number {
    // Small positive card-advantage bonus; the magnitude is tuned by the
    // evaluation function (Task 3.3), this just registers the value direction.
    return 1;
  },
};
