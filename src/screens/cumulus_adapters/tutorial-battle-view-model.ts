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
        paired: presentation.blockerBattleCardId !== null,
        dissolved: presentation.dissolved.map((entry) => ({ ...entry })),
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
  const enemyDreamAvatar = {
    id: battle.init.enemyDescriptor.id,
    imageNumber: battle.init.enemyDescriptor.imageNumber ?? "001",
    name: battle.init.enemyDescriptor.name,
    renderedText: battle.init.enemyDescriptor.abilityText,
    title: battle.init.enemyDescriptor.subtitle,
  };
  const mobileOptions = {
    aiMode: false,
    isOpponentHandRevealed: false,
    isPlayerHandHidden: false,
    pendingPrompt: battle.pendingPrompt,
    confirmedPromptId,
  } as const;
  const buildBattleView = (
    board: BattleFoldState["board"],
  ): TutorialBattleView["battle"] => {
    const projected = buildMobileBattleView(
      battle.init,
      board,
      enemyDreamAvatar,
      null,
      mobileOptions,
    );
    const player = withInactiveTutorialAvatarAbility(projected.player);
    const enemy = withInactiveTutorialAvatarAbility(projected.enemy);
    return {
      ...projected,
      player,
      enemy,
      near: projected.perspective === "player" ? player : enemy,
      far: projected.perspective === "player" ? enemy : player,
      result: null,
    };
  };
  const mobile = buildBattleView(
    boardBeforeOpponentPlayPresentation(battle, presentation),
  );
  const challengeOriginBoard = boardBeforeChallengeResolutionPresentation(
    battle,
    presentation,
  );
  const prompt = battle.pendingPrompt;
  const confirmedHumanPrompt = controller.status === "driver" &&
    controller.isCurrentClientDriver &&
    controller.requiresHumanDecision &&
    prompt !== null &&
    confirmedPromptId === prompt.promptId;
  return {
    battle: mobile,
    challengeOriginBattle:
      challengeOriginBoard === null
        ? null
        : buildBattleView(challengeOriginBoard),
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
 * Reconstruct the last painted Challenge lane from persisted UUIDs. The
 * authoritative board already contains the void moves; this local projection
 * supplies a source frame even when the screen mounts after those moves were
 * folded from the room log.
 */
function boardBeforeChallengeResolutionPresentation(
  battle: BattleFoldState,
  presentation: TutorialBattlePresentation | null,
): BattleFoldState["board"] | null {
  if (
    presentation?.kind !== "challenge-resolved" ||
    presentation.dissolved.length === 0
  ) {
    return null;
  }
  const sides = {
    player: { ...battle.board.sides.player },
    enemy: { ...battle.board.sides.enemy },
  };
  for (const entry of presentation.dissolved) {
    const side = sides[entry.side];
    const backRank = { ...side.backRank };
    const frontRank = { ...side.frontRank };
    for (const slotId of rankSlotIds(backRank)) {
      if (backRank[slotId] === entry.battleCardId) backRank[slotId] = null;
    }
    for (const slotId of rankSlotIds(frontRank)) {
      if (frontRank[slotId] === entry.battleCardId) frontRank[slotId] = null;
    }
    sides[entry.side] = {
      ...side,
      deck: side.deck.filter((candidate) => candidate !== entry.battleCardId),
      hand: side.hand.filter((candidate) => candidate !== entry.battleCardId),
      void: side.void.filter((candidate) => candidate !== entry.battleCardId),
      banished: side.banished.filter(
        (candidate) => candidate !== entry.battleCardId,
      ),
      backRank,
      frontRank: {
        ...frontRank,
        [presentation.slotId]: entry.battleCardId,
      },
    };
  }
  return {
    ...battle.board,
    sides,
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
