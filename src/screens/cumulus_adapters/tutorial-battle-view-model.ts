import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import type { TutorialBattleControllerPlan } from "../../battle/tutorial-battle-controller";
import type {
  BattleFoldState,
  TutorialBattlePresentation,
} from "../../rules/battle/fold";
import type { TutorialBattleView } from "../../cumulus/screens/TutorialBattleScreen";
import type { MobileBattleSideView } from "../../cumulus/screens/MobileBattleScreen";
import {
  buildMobileBattleCardView,
  buildMobileBattleView,
} from "./mobile-battle-view-model";
import { rankSlotIds } from "../../battle/types";

const INACTIVE_TUTORIAL_AVATAR_ABILITY = "Avatar ability is not active";

function withInactiveTutorialAvatarAbility(
  side: MobileBattleSideView,
): MobileBattleSideView {
  const profile = side.status.dreamAvatarProfile;
  if (profile === undefined) return side;
  return {
    ...side,
    status: {
      ...side.status,
      dreamAvatarProfile: {
        ...profile,
        ability: INACTIVE_TUTORIAL_AVATAR_ABILITY,
        unavailable: true,
      },
    },
  };
}

/**
 * Project a fold presentation onto the board presentation the screen renders.
 *
 * The screen reports a rendered presentation visible by id, and the shared
 * controller waits for that id before completing the presentation and
 * resuming the parked battle work. A kind that reaches the screen as `null`
 * therefore parks the tutorial permanently, so this switch is exhaustive over
 * the fold union: a new kind is a compile error here, not a silent stall.
 */
function tutorialPresentationView(
  presentation: TutorialBattlePresentation | null,
  battle: BattleFoldState,
): TutorialBattleView["presentation"] {
  if (presentation === null) return null;
  switch (presentation.kind) {
    case "opponent-play": {
      const card = battle.board.cardInstances[presentation.battleCardId];
      return card === undefined ||
        card.definition.cardId !== presentation.cardId
        ? null
        : {
            kind: presentation.kind,
            presentationId: presentation.id,
            cardId: presentation.cardId,
            battleCardId: presentation.battleCardId,
            cardKind: presentation.cardKind,
            card: buildMobileBattleCardView(card),
          };
    }
    case "dreamwell-reveal": {
      const definition = battle.init.dreamwellDeck.find(
        (candidate) => candidate.id === presentation.cardId,
      );
      return definition === undefined
        ? null
        : {
            kind: presentation.kind,
            presentationId: presentation.id,
            cardId: presentation.cardId,
            side: presentation.side,
          };
    }
    case "opponent-block":
      return {
        kind: presentation.kind,
        presentationId: presentation.id,
      };
    case "challenge-resolved":
      return {
        kind: presentation.kind,
        presentationId: presentation.id,
        paired: presentation.defenderBattleCardId !== null,
        scored: presentation.scored,
      };
    case "tutorial-guidance":
      // Guidance dwell is released by useBattleTutorialGuidance, and the
      // controller skips the visible-id gate for it, so guidance has no board
      // presentation of its own.
      return null;
    default: {
      const unhandled: never = presentation;
      return unhandled;
    }
  }
}

export function buildTutorialBattleView(
  battle: BattleFoldState,
  controller: TutorialBattleControllerPlan,
  confirmedPromptId: number | null,
  previewVictory = false,
): TutorialBattleView {
  const presentation = battle.tutorialPresentation ?? null;
  const mobile = buildMobileBattleView(
    battle.init,
    boardBeforeOpponentPlayPresentation(battle, presentation),
    {
      id: battle.init.enemyDescriptor.id,
      imageNumber: battle.init.enemyDescriptor.imageNumber ?? "001",
      name: battle.init.enemyDescriptor.name,
      renderedText: battle.init.enemyDescriptor.abilityText,
      title: battle.init.enemyDescriptor.subtitle,
    },
    null,
    {
      aiMode: false,
      isOpponentHandRevealed: false,
      isPlayerHandHidden: false,
      pendingPrompt: battle.pendingPrompt,
      confirmedPromptId,
    },
  );
  const player = withInactiveTutorialAvatarAbility(mobile.player);
  const enemy = withInactiveTutorialAvatarAbility(mobile.enemy);
  const prompt = battle.pendingPrompt;
  const confirmedHumanPrompt = controller.status === "driver" &&
    controller.isCurrentClientDriver &&
    controller.requiresHumanDecision &&
    prompt !== null &&
    confirmedPromptId === prompt.promptId;
  return {
    battle: {
      ...mobile,
      player,
      enemy,
      near: mobile.perspective === "player" ? player : enemy,
      far: mobile.perspective === "player" ? enemy : player,
      result: null,
    },
    ownership: controller.status === "not-tutorial" ? "observer" : controller.status,
    driverClientId: controller.driverClientId,
    manualControls: controller.status === "driver" && controller.isCurrentClientDriver && controller.requiresHumanDecision,
    foresee:
      confirmedHumanPrompt && prompt.options.kind === "foresee"
        ? {
            initialCount: prompt.options.count,
            cards: prompt.options.cardIds.flatMap((battleCardId) => {
              const card = battle.board.cardInstances[battleCardId];
              return card === undefined
                ? []
                : [{ battleCardId, model: battleGameCardModel(card) }];
            }),
          }
        : null,
    presentationId:
      presentation === null || presentation.kind === "tutorial-guidance"
        ? null
        : presentation.id,
    presentation: tutorialPresentationView(presentation, battle),
    victoryVisible:
      controller.isCurrentClientDriver &&
      controller.isDriverPresent &&
      (previewVictory ||
        (battle.board.result === "victory" &&
          controller.status === "terminal")),
    terminalRestartAvailable: controller.status === "terminal" && !controller.isDriverPresent,
  };
}

/**
 * The play is already committed in the room fold, but the tutorial presents
 * the physical card before revealing its destination. This projection removes
 * only that card from visible enemy zones until the persisted checkpoint
 * clears; card identity and rule state remain authoritative in the fold.
 */
function boardBeforeOpponentPlayPresentation(
  battle: BattleFoldState,
  presentation: TutorialBattlePresentation | null,
): BattleFoldState["board"] {
  if (presentation?.kind !== "opponent-play") return battle.board;
  const battleCardId = presentation.battleCardId;
  const enemy = battle.board.sides.enemy;
  const backRank = { ...enemy.backRank };
  const frontRank = { ...enemy.frontRank };
  for (const slotId of rankSlotIds(backRank)) {
    if (backRank[slotId] === battleCardId) backRank[slotId] = null;
  }
  for (const slotId of rankSlotIds(frontRank)) {
    if (frontRank[slotId] === battleCardId) frontRank[slotId] = null;
  }
  return {
    ...battle.board,
    sides: {
      ...battle.board.sides,
      enemy: {
        ...enemy,
        backRank,
        frontRank,
        void: enemy.void.filter((candidate) => candidate !== battleCardId),
      },
    },
  };
}
