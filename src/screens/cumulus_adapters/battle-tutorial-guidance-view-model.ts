import type { BattleTutorialGuidanceView } from "../../cumulus/screens/BattleTutorialGuidance";
import type { BattleGuidanceHost } from "../../rules/battle/journey-tutorial-guidance";
import type { Engine } from "../../engine";
import type { EngineCardModels } from "../../battle/ui/engine-card-model";
import { parseBattleCardId } from "../../types/identifiers";
import { dreamwellCardModel } from "../../battle/ui/dreamwell-card-model";
import type { TutorialGuidanceMessage } from "../../rules/battle/fold";
import { tutorialGuidanceMessageDurationSeconds } from "../../battle/tutorial-presentation-timing";

function guidanceDialogue(
  battle: BattleGuidanceHost,
  message: TutorialGuidanceMessage,
): BattleTutorialGuidanceView["dialogue"] {
  if (message.speaker === "player") {
    const avatar = battle.init.avatarSummary;
    return {
      portrait: {
        kind: "avatar",
        imageNumber: avatar?.imageNumber ?? "001",
      },
      portraitAlt:
        avatar === null || avatar === undefined ? "Player Avatar" : avatar.name,
      speakerName:
        avatar === null || avatar === undefined ? "Dreamer" : avatar.name,
      text: message.text,
    };
  }
  if (message.speaker === "enemy") {
    const enemy = battle.init.enemyDescriptor;
    return {
      portrait: {
        kind: "avatar",
        imageNumber: enemy.imageNumber ?? "001",
      },
      portraitAlt: enemy.name,
      speakerName: enemy.name,
      text: message.text,
    };
  }
  return {
    portrait: { kind: "character-portrait", characterId: "mira" },
    portraitAlt: "Mira",
    speakerName: "Mira",
    text: message.text,
  };
}

/** Resolve one persisted guidance checkpoint into UUID-backed Cumulus models. */
export function buildBattleTutorialGuidanceView(
  battle: BattleGuidanceHost,
  engine: Engine,
  cards: EngineCardModels,
): BattleTutorialGuidanceView | null {
  const presentation = battle.tutorialPresentation;
  if (presentation?.kind !== "tutorial-guidance") return null;
  const message = presentation.messages[presentation.messageIndex];
  if (message === undefined) return null;
  if (
    presentation.source.kind === "challenge" ||
    presentation.source.kind === "battle"
  ) {
    return {
      presentationId: presentation.id,
      triggerId: message.triggerId,
      messageIndex: presentation.messageIndex,
      messageCount: presentation.messages.length,
      delay: message.delay ?? 0,
      duration: tutorialGuidanceMessageDurationSeconds(presentation),
      dialogue: guidanceDialogue(battle, message),
      horizontalOffset: message.horizontalOffset ?? 0,
      verticalOffset: message.verticalOffset ?? 0,
      bubbleWidth: message.bubbleWidth ?? 700,
      source: { kind: "battle" },
    };
  }
  if (presentation.source.kind === "dreamwell") {
    const source = presentation.source;
    const definition = battle.init.dreamwellDeck.find(
      (candidate) => candidate.id === source.cardId,
    );
    if (definition === undefined) return null;
    return {
      presentationId: presentation.id,
      triggerId: message.triggerId,
      messageIndex: presentation.messageIndex,
      messageCount: presentation.messages.length,
      delay: message.delay ?? 0,
      duration: tutorialGuidanceMessageDurationSeconds(presentation),
      dialogue: guidanceDialogue(battle, message),
      horizontalOffset: message.horizontalOffset ?? 0,
      verticalOffset: message.verticalOffset ?? 0,
      bubbleWidth: message.bubbleWidth ?? 700,
      source: {
        kind: "dreamwell",
        model: dreamwellCardModel(definition),
        side: source.side,
      },
    };
  }
  const sourceId = presentation.source.battleCardId;
  const frame = battle.checkpoints[0]?.state ?? battle.engine.slice.committed;
  const instance = Object.values(engine.view(frame,"player").instances).find(card=>parseBattleCardId(card.id) === sourceId);
  if (instance === undefined) return null;
  return {
    presentationId: presentation.id,
    triggerId: message.triggerId,
    messageIndex: presentation.messageIndex,
    messageCount: presentation.messages.length,
    delay: message.delay ?? 0,
    duration: tutorialGuidanceMessageDurationSeconds(presentation),
    dialogue: guidanceDialogue(battle, message),
    horizontalOffset: message.horizontalOffset ?? 0,
    verticalOffset: message.verticalOffset ?? 0,
    bubbleWidth: message.bubbleWidth ?? 700,
    source: {
      kind: "card",
      model: cards(instance),
      figment: presentation.source.kind === "figment",
      battleCardId: presentation.source.battleCardId,
    },
  };
}
