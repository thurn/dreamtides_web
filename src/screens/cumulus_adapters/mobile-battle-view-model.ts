import { selectPlayAreaSize } from "../../battle/state/selectors";
import type { AiProposal } from "../../battle/ai/use-battle-ai";
import { evaluate } from "../../battle/ai/evaluate";
import { forwardModelFromState } from "../../battle/ai/forward-model";
import { formatPhaseLabel, formatSideLabel } from "../../battle/ui/format";
import {
  backRankSlotIds,
  frontRankSlotIds,
  type BattleCardInstance,
  type BattleDreamcallerSummary,
  type BattleInit,
  type BattleMutableState,
  type BattleSide,
} from "../../battle/types";
import { battleGameCardModel } from "../../battle/ui/battle-game-card-model";
import { asCardId } from "../../types/card-identity";
import {
  MOBILE_BATTLE_STARTING_BACK_RANK_SLOTS,
  MOBILE_BATTLE_STARTING_FRONT_RANK_SLOTS,
} from "../../cumulus/screens/mobile-battle-layout";
import {
  type MobileBattleCardView,
  type MobileBattlePhase,
  type MobileBattleSideView,
  type MobileBattleSlotView,
  type MobileBattleStatusView,
  type MobileBattleInspectorSideView,
  type MobileBattleInspectorView,
  type MobileBattleDreamwellView,
  type MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";

const FALLBACK_PLAYER_DREAMCALLER = {
  imageNumber: "001",
  name: "Dreamcaller",
  title: "",
} as const;

export type MobileBattleInit = BattleInit;
export type MobileBattleBoard = BattleMutableState;
export type MobileBattleDreamcaller = BattleDreamcallerSummary;
export type MobileBattleAiProposal = Pick<AiProposal, "kind" | "description"> &
  Partial<Pick<AiProposal, "trace">>;

export interface MobileBattleInspectorOptions {
  readonly aiMode: boolean;
  readonly isOpponentHandRevealed: boolean;
  readonly isPlayerHandHidden: boolean;
}

export function buildMobileBattleView(
  init: BattleInit,
  board: BattleMutableState,
  enemyDreamcaller: BattleDreamcallerSummary,
  aiProposal: MobileBattleAiProposal | null = null,
  inspectorOptions: MobileBattleInspectorOptions = {
    aiMode: false,
    isOpponentHandRevealed: false,
    isPlayerHandHidden: false,
  },
): MobileBattleView {
  const { frontSize: activeFrontSize, backSize: activeBackSize } = selectPlayAreaSize(board);
  const frontSize = Math.max(activeFrontSize, MOBILE_BATTLE_STARTING_FRONT_RANK_SLOTS);
  const backSize = Math.max(activeBackSize, MOBILE_BATTLE_STARTING_BACK_RANK_SLOTS);
  return {
    battleId: init.battleId,
    aiApproval: aiProposal === null
      ? null
      : {
          description: aiProposal.description,
          canReject: aiProposal.kind === "action",
        },
    dreamwell: buildDreamwellView(init, board),
    activeSide: board.activeSide,
    phase: mobileBattlePhase(board.phase),
    enemyHandCardIds: [...board.sides.enemy.hand],
    enemyHand: buildCardViews(board.sides.enemy.hand, board),
    enemy: buildSideView("enemy", enemyDreamcaller, board, frontSize, backSize),
    player: buildSideView(
      "player",
      init.dreamcallerSummary ?? FALLBACK_PLAYER_DREAMCALLER,
      board,
      frontSize,
      backSize,
    ),
    playerHand: buildCardViews(
      board.sides.player.hand,
      board,
      (instance) =>
        board.activeSide === "player" &&
        board.phase === "day" &&
        instance.definition.energyCost <= board.sides.player.currentEnergy,
    ),
    inspector: buildInspectorView(init, board, aiProposal, inspectorOptions),
  };
}

function buildDreamwellView(
  init: BattleInit,
  board: BattleMutableState,
): MobileBattleDreamwellView | null {
  if (
    board.result !== null ||
    board.phase !== "dreamwell" ||
    board.turnNumber <= 1
  ) {
    return null;
  }

  const side = board.activeSide;
  const sideState = board.sides[side];
  if (
    sideState.dreamwellCardIndex === null ||
    sideState.dreamwellDrawnTurn !== board.turnNumber
  ) {
    return null;
  }

  const definition = init.dreamwellDeck[sideState.dreamwellCardIndex];
  if (definition === undefined) {
    return null;
  }

  const cardId = asCardId(definition.id);
  return {
    side,
    model: {
      cardId,
      displaySnapshot: {
        id: cardId,
        name: definition.name,
        renderedText: definition.renderedText,
        energyAdded: definition.energyAdded,
        imageNumber: definition.imageNumber,
        ...(definition.art === undefined ? {} : { art: definition.art }),
      },
    },
  };
}

function buildInspectorView(
  init: BattleInit,
  board: BattleMutableState,
  aiProposal: MobileBattleAiProposal | null,
  options: MobileBattleInspectorOptions,
): MobileBattleInspectorView {
  const nextDreamwell = init.dreamwellDeck[board.dreamwellDeckIndex];
  return {
    opponentName: init.enemyDescriptor.name,
    turn: String(board.turnNumber),
    phase: formatPhaseLabel(board.phase),
    activeSide: formatSideLabel(board.activeSide),
    result: board.result === null ? "In progress" : titleCase(board.result),
    stackCount: board.stack?.length ?? 0,
    nextDreamwellOrder: nextDreamwell === undefined ? "Complete" : String(nextDreamwell.order),
    isOpponentHandRevealed: options.isOpponentHandRevealed,
    isPlayerHandHidden: options.isPlayerHandHidden,
    sides: {
      player: buildInspectorSideView("player", board),
      enemy: buildInspectorSideView("enemy", board),
    },
    ai: options.aiMode ? buildAiView(board, aiProposal) : null,
  };
}

function buildInspectorSideView(
  side: BattleSide,
  board: BattleMutableState,
): MobileBattleInspectorSideView {
  const state = board.sides[side];
  return {
    side,
    heading: side === "player" ? "Your" : "Enemy",
    points: state.score,
    currentEnergy: state.currentEnergy,
    maxEnergy: state.maxEnergy,
    zones: {
      hand: state.hand.length,
      deck: state.deck.length,
      void: state.void.length,
      banished: state.banished.length,
      backRank: Object.values(state.backRank).filter((id) => id !== null).length,
      frontRank: Object.values(state.frontRank).filter((id) => id !== null).length,
    },
    canDiscard: state.hand.length > 0,
    canShuffle: state.deck.length >= 2,
  };
}

function buildAiView(
  board: BattleMutableState,
  proposal: MobileBattleAiProposal | null,
): NonNullable<MobileBattleInspectorView["ai"]> {
  const trace = proposal?.trace ?? null;
  const liveEvaluation = evaluate(forwardModelFromState(board, "enemy"));
  const before = trace?.heuristicScoreBefore;
  const after = trace?.heuristicScoreAfter;
  return {
    proposal: proposal?.description ?? "No active proposal",
    kind: proposal === null ? "Idle" : titleCase(proposal.kind),
    card: trace?.cardName ?? trace?.battleCardId ?? "—",
    target: trace?.targetSlotId ?? trace?.targetBattleCardId ?? "—",
    heuristicChange: before === null || before === undefined || after === null || after === undefined
      ? "—"
      : `${formatEvaluation(before)} → ${formatEvaluation(after)}`,
    liveEvaluation: formatEvaluation(liveEvaluation),
  };
}

function formatEvaluation(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "+∞";
  if (value === Number.NEGATIVE_INFINITY) return "−∞";
  return value.toFixed(2);
}

function titleCase(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function mobileBattlePhase(
  phase: BattleMutableState["phase"],
): MobileBattlePhase {
  switch (phase) {
    case "dreamwell":
    case "draw":
    case "dawn":
      return "dawn";
    case "ending":
      return "challenge";
    default:
      return phase;
  }
}

export function buildMobileBattleCardView(
  instance: BattleCardInstance,
  showPlayableOutline = false,
): MobileBattleCardView {
  const figment = instance.provenance.kind === "generated-figment";
  return {
    id: instance.battleCardId,
    model: battleGameCardModel(instance),
    exhausted: instance.status.isExhausted,
    figment,
    figmentTitleBar: figment && instance.definition.name.trim() !== "",
    showPlayableOutline,
  };
}

function buildSideView(
  side: BattleSide,
  dreamcaller: BattleDreamcallerSummary | typeof FALLBACK_PLAYER_DREAMCALLER,
  board: BattleMutableState,
  frontSize: number,
  backSize: number,
): MobileBattleSideView {
  const sideState = board.sides[side];
  return {
    deckCardIds: [...sideState.deck],
    voidCards: buildCardViews([...sideState.void].reverse(), board),
    backRank: backRankSlotIds(backSize).map((slotId) =>
      buildSlotView(slotId, sideState.backRank[slotId] ?? null, board),
    ),
    frontRank: frontRankSlotIds(frontSize).map((slotId) =>
      buildSlotView(slotId, sideState.frontRank[slotId] ?? null, board),
    ),
    status: buildStatusView(dreamcaller, sideState),
  };
}

function buildCardViews(
  battleCardIds: readonly string[],
  board: BattleMutableState,
  showPlayableOutline: (instance: BattleCardInstance) => boolean = () => false,
): MobileBattleCardView[] {
  return battleCardIds.flatMap((battleCardId) => {
    const instance = board.cardInstances[battleCardId];
    return instance === undefined
      ? []
      : [buildMobileBattleCardView(instance, showPlayableOutline(instance))];
  });
}

function buildSlotView(
  id: string,
  battleCardId: string | null,
  board: BattleMutableState,
): MobileBattleSlotView {
  const instance = battleCardId === null ? undefined : board.cardInstances[battleCardId];
  return {
    id,
    card: instance === undefined ? null : buildMobileBattleCardView(instance),
  };
}

function buildStatusView(
  dreamcaller: BattleDreamcallerSummary | typeof FALLBACK_PLAYER_DREAMCALLER,
  sideState: BattleMutableState["sides"][BattleSide],
): MobileBattleStatusView {
  return {
    dreamcaller: {
      imageNumber: dreamcaller.imageNumber,
      name: dreamcaller.name,
      title: dreamcaller.title,
      ...("portraitFocus" in dreamcaller &&
      dreamcaller.portraitFocus !== undefined
        ? { portraitFocus: dreamcaller.portraitFocus }
        : {}),
    },
    currentEnergy: sideState.currentEnergy,
    maxEnergy: sideState.maxEnergy,
    points: sideState.score,
  };
}
