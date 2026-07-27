import type { BattleTutorialGuidanceView } from "../../cumulus/screens/BattleTutorialGuidance";
import type { BattleFoldState } from "../../rules/battle/fold";
import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import { dreamwellCardModel } from "../../battle/ui/dreamwell-card-model";

/** Resolve one persisted guidance checkpoint into UUID-backed Cumulus models. */
export function buildBattleTutorialGuidanceView(
  battle: BattleFoldState,
): BattleTutorialGuidanceView | null {
  const presentation = battle.tutorialPresentation;
  if (presentation?.kind !== "tutorial-guidance") return null;
  const message = presentation.messages[presentation.messageIndex];
  if (message === undefined) return null;
  if (presentation.source.kind === "dreamwell") {
    const definition = battle.init.dreamwellDeck.find(
      (candidate) => candidate.id === presentation.source.cardId,
    );
    if (definition === undefined) return null;
    return {
      presentationId: presentation.id,
      triggerId: message.triggerId,
      messageIndex: presentation.messageIndex,
      messageCount: presentation.messages.length,
      duration: message.duration,
      text: message.text,
      source: {
        kind: "dreamwell",
        model: dreamwellCardModel(definition),
        side: presentation.source.side,
      },
    };
  }
  const instance =
    battle.board.cardInstances[presentation.source.battleCardId];
  if (instance === undefined) return null;
  return {
    presentationId: presentation.id,
    triggerId: message.triggerId,
    messageIndex: presentation.messageIndex,
    messageCount: presentation.messages.length,
    duration: message.duration,
    text: message.text,
    source: {
      kind: "card",
      model: battleGameCardModel(instance),
      figment: presentation.source.kind === "figment",
      battleCardId: presentation.source.battleCardId,
    },
  };
}
