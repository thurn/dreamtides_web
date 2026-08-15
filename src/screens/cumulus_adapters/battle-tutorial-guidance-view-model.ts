import type { BattleTutorialGuidanceView } from "../../cumulus/screens/BattleTutorialGuidance";
import type { BattleFoldState } from "../../rules/battle/fold";
import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import { dreamwellCardModel } from "../../battle/ui/dreamwell-card-model";
import type { TutorialGuidanceMessage } from "../../rules/battle/fold";
import { tutorialGuidanceMessageDurationSeconds } from "../../battle/tutorial-presentation-timing";
import { tx } from "@trox/runtime";
import { localizedSourceText } from "../../runtime/localization/runtime";

function guidanceDialogue(
  battle: BattleFoldState,
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
        avatar === null || avatar === undefined
          ? tx(
              "Player Avatar",
              "[battle] [tutorial] [avatar] Fallback name for the player's Avatar.",
            )
          : localizedSourceText(avatar.name),
      speakerName:
        avatar === null || avatar === undefined
          ? tx(
              "Dreamer",
              "[battle] [tutorial] Fallback speaker name for the player.",
            )
          : localizedSourceText(avatar.name),
      text: localizedSourceText(message.text),
    };
  }
  if (message.speaker === "enemy") {
    const enemy = battle.init.enemyDescriptor;
    return {
      portrait: {
        kind: "avatar",
        imageNumber: enemy.imageNumber ?? "001",
      },
      portraitAlt: localizedSourceText(enemy.name),
      speakerName: localizedSourceText(enemy.name),
      text: localizedSourceText(message.text),
    };
  }
  return {
    portrait: { kind: "character-portrait", characterId: "mira" },
    portraitAlt: tx("Mira", "[tutorial] Name of the tutorial guide."),
    speakerName: tx("Mira", "[tutorial] Name of the tutorial guide."),
    text: localizedSourceText(message.text),
  };
}

/** Resolve one persisted guidance checkpoint into UUID-backed Cumulus models. */
export function buildBattleTutorialGuidanceView(
  battle: BattleFoldState,
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
  const instance = battle.board.cardInstances[presentation.source.battleCardId];
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
      model: battleGameCardModel(instance),
      figment: presentation.source.kind === "figment",
      battleCardId: presentation.source.battleCardId,
    },
  };
}
