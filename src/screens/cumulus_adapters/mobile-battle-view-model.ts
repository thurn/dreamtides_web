import {
  selectBattleCardLocation,
  selectSidePlayAreaSize,
} from "../../battle/state/selectors";
import {
  selectFigmentCount,
} from "../../battle/state/figments";
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
import type { PendingPrompt } from "../../rules/battle/fold";
import {
  type MobileBattleCardView,
  type MobileBattleCardPickerCandidateView,
  type MobileBattleCardPickerView,
  type MobileBattleChoicePromptView,
  type MobileBattlePhase,
  type MobileBattleSideView,
  type MobileBattleSlotView,
  type MobileBattleStatusView,
  type MobileBattleInspectorSideView,
  type MobileBattleInspectorView,
  type MobileBattleDreamwellView,
  type MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { MobileBattleResultView } from "../../cumulus/screens/BattleResultSurface";

const FALLBACK_PLAYER_DREAMCALLER = {
  imageNumber: "001",
  name: "Dreamcaller",
  title: "",
} as const;

export type MobileBattleInit = BattleInit;
export type MobileBattleBoard = BattleMutableState;
export type MobileBattleDreamcaller = BattleDreamcallerSummary;
export type MobileBattlePendingPrompt = PendingPrompt;
export type MobileBattleAiProposal = Pick<AiProposal, "kind" | "description"> &
  Partial<Pick<AiProposal, "trace">>;

export interface MobileBattleViewOptions {
  readonly aiMode: boolean;
  readonly isOpponentHandRevealed: boolean;
  readonly isPlayerHandHidden: boolean;
  readonly pendingPrompt?: PendingPrompt | null;
  readonly confirmedPromptId?: number | null;
  readonly isResultOverlayDismissed?: boolean;
}

export function buildMobileBattleView(
  init: BattleInit,
  board: BattleMutableState,
  enemyDreamcaller: BattleDreamcallerSummary,
  aiProposal: MobileBattleAiProposal | null = null,
  viewOptions: MobileBattleViewOptions = {
    aiMode: false,
    isOpponentHandRevealed: false,
    isPlayerHandHidden: false,
  },
): MobileBattleView {
  return {
    battleId: init.battleId,
    aiApproval: aiProposal === null
      ? null
      : {
          description: aiProposal.description,
          canReject: aiProposal.kind === "action",
        },
    cardPicker: buildCardPickerView(
      viewOptions.pendingPrompt ?? null,
      viewOptions.confirmedPromptId ?? null,
      board,
    ),
    choicePrompt: buildChoicePromptView(
      viewOptions.pendingPrompt ?? null,
      viewOptions.confirmedPromptId ?? null,
    ),
    dreamwell: buildDreamwellView(init, board),
    activeSide: board.activeSide,
    phase: mobileBattlePhase(board.phase),
    enemyHandCardIds: [...board.sides.enemy.hand],
    enemyHand: buildCardViews(board.sides.enemy.hand, board),
    enemy: buildSideView(
      "enemy",
      enemyDreamcaller,
      board,
    ),
    player: buildSideView(
      "player",
      init.dreamcallerSummary ?? FALLBACK_PLAYER_DREAMCALLER,
      board,
    ),
    playerHand: buildCardViews(
      board.sides.player.hand,
      board,
      (instance) =>
        board.activeSide === "player" &&
        board.phase === "day" &&
        instance.definition.energyCost <= board.sides.player.currentEnergy,
    ),
    inspector: buildInspectorView(init, board, aiProposal, viewOptions),
    result: buildMobileBattleResultView(
      init,
      board,
      viewOptions.isResultOverlayDismissed ?? false,
    ),
  };
}

export function buildMobileBattleResultView(
  init: BattleInit,
  board: BattleMutableState,
  dismissed: boolean,
): MobileBattleResultView | null {
  if (board.result === null) return null;
  if (board.result !== "victory") {
    return { outcome: board.result, dismissed };
  }

  const turnLabel = `${String(board.turnNumber)} turn${board.turnNumber === 1 ? "" : "s"}`;
  return {
    outcome: "victory",
    essenceReward: init.essenceReward,
    summary:
      `Defeated ${init.enemyDescriptor.name} · ` +
      `${String(board.sides.player.score)}–${String(board.sides.enemy.score)} · ` +
      turnLabel,
  };
}

function buildChoicePromptView(
  pendingPrompt: PendingPrompt | null,
  confirmedPromptId: number | null,
): MobileBattleChoicePromptView | null {
  if (
    pendingPrompt === null ||
    pendingPrompt.options.kind !== "choice"
  ) {
    return null;
  }
  return {
    key: String(pendingPrompt.promptId),
    label: pendingPrompt.options.label,
    options: pendingPrompt.options.options.map((option) => ({
      label: option.label,
    })),
    canResolve: confirmedPromptId === pendingPrompt.promptId,
  };
}

function buildCardPickerView(
  pendingPrompt: PendingPrompt | null,
  confirmedPromptId: number | null,
  board: BattleMutableState,
): MobileBattleCardPickerView | null {
  if (
    pendingPrompt === null ||
    pendingPrompt.options.kind !== "pick-cards"
  ) {
    return null;
  }
  const highlightedIds = new Set(pendingPrompt.options.highlightCardIds);
  const candidates = pendingPrompt.options.candidateIds.flatMap(
    (instanceId): MobileBattleCardPickerCandidateView[] => {
      const instance = board.cardInstances[instanceId];
      const location = selectBattleCardLocation(board, instanceId);
      if (instance === undefined || location === null) return [];
      return [{
        instanceId,
        cardUuid: instance.definition.cardId,
        owner: location.side,
        zone: location.zone,
        card: buildMobileBattleCardView(instance),
        highlighted: highlightedIds.has(instanceId),
      }];
    },
  );
  const staysOnBoard = candidates.every((candidate) =>
    candidate.zone === "hand" ||
    candidate.zone === "backRank" ||
    candidate.zone === "frontRank"
  );
  return {
    key: String(pendingPrompt.promptId),
    label: pendingPrompt.options.label,
    side: candidates[0]?.owner ?? pendingPrompt.run.side,
    candidates,
    candidateIds: [...pendingPrompt.options.candidateIds],
    count: pendingPrompt.options.count,
    optional: pendingPrompt.options.optional,
    canResolve: confirmedPromptId === pendingPrompt.promptId,
    presentation: staysOnBoard ? "board" : "gallery",
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
  options: MobileBattleViewOptions,
): MobileBattleInspectorView {
  const nextDreamwell = init.dreamwellDeck[board.dreamwellDeckIndex];
  return {
    opponentName: init.enemyDescriptor.name,
    turn: String(board.turnNumber),
    phase: formatPhaseLabel(board.phase),
    activeSide: formatSideLabel(board.activeSide),
    result: board.result === null ? "In progress" : titleCase(board.result),
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
    figmentCount: selectFigmentCount(instance),
    storedTime: instance.status.counters,
    showPlayableOutline,
  };
}

function buildSideView(
  side: BattleSide,
  dreamcaller: BattleDreamcallerSummary | typeof FALLBACK_PLAYER_DREAMCALLER,
  board: BattleMutableState,
): MobileBattleSideView {
  const sideState = board.sides[side];
  const { frontSize, backSize } = selectSidePlayAreaSize(board, side);
  return {
    deckCardIds: [...sideState.deck],
    banishedCardCount: sideState.banished.length,
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
      : [
          buildMobileBattleCardView(instance, showPlayableOutline(instance)),
        ];
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
    card:
      instance === undefined
        ? null
        : buildMobileBattleCardView(instance),
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
