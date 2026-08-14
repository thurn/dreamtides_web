import type { BattleFoldState } from "../rules/battle/fold";
import type { TutorialBattleAiActionOverride } from "../types/tutorial";
import { battleModeOf } from "../rules/battle/fold";
import {
  isBattleCardSemanticPlayAutomated,
  semanticPlayTargetsAreLegal,
} from "./semantic-play";
import { selectCenterPreferredCharacterPlaySlot } from "./state/selectors";
import type { BattleFieldSlotAddress } from "./types";
import type {
  BattleCardId,
  TutorialAiActionOverrideId,
} from "../types/identifiers";

export interface TutorialAiPlayCardOverrideSelection {
  readonly override: TutorialBattleAiActionOverride;
  readonly battleCardId: BattleCardId;
  readonly sourceHandIndex: number;
  readonly characterDestination: BattleFieldSlotAddress | null;
}

export type TutorialAiActionOverrideBlockReason =
  | "card-not-in-hand"
  | "card-automation-unavailable"
  | "unsupported-card-kind"
  | "fast-card-unsupported"
  | "insufficient-energy"
  | "targets-required"
  | "no-character-slot";

export type TutorialAiActionOverridePlan =
  | { readonly kind: "none" }
  | {
      readonly kind: "play-card";
      readonly selection: TutorialAiPlayCardOverrideSelection;
    }
  | {
      readonly kind: "blocked";
      readonly override: TutorialBattleAiActionOverride;
      readonly reason: TutorialAiActionOverrideBlockReason;
    };

/**
 * Plan the first authored action whose state trigger matches. Source ordering
 * is the priority order; a blocked matching action is reported explicitly.
 */
export function planTutorialAiActionOverride(
  battle: BattleFoldState,
): TutorialAiActionOverridePlan {
  if (battleModeOf(battle).kind !== "tutorial") return { kind: "none" };
  for (const override of battle.tutorialAiActionOverrides ?? []) {
    if (!tutorialAiActionOverrideMatches(battle, override)) continue;
    return selectPlayCard(battle, override);
  }
  return { kind: "none" };
}

/** Resolve and authenticate one override id against the pre-action fold. */
export function resolveTutorialAiPlayCardOverride(
  battle: BattleFoldState,
  overrideId: TutorialAiActionOverrideId,
  battleCardId: BattleCardId,
): TutorialBattleAiActionOverride | null {
  const override = (battle.tutorialAiActionOverrides ?? []).find(
    (candidate) => candidate.id === overrideId,
  );
  if (
    override === undefined ||
    !tutorialAiActionOverrideMatches(battle, override) ||
    battle.board.cardInstances[battleCardId]?.definition.cardId !==
      override.action.cardId
  ) {
    return null;
  }
  return override;
}

/** Persist exact-once consumption in the same fold step as the action. */
export function consumeTutorialAiActionOverride(
  battle: BattleFoldState,
  overrideId: TutorialAiActionOverrideId | null,
): BattleFoldState {
  if (overrideId === null) return battle;
  return {
    ...battle,
    consumedTutorialAiActionOverrideIds: [
      ...(battle.consumedTutorialAiActionOverrideIds ?? []),
      overrideId,
    ],
  };
}

function tutorialAiActionOverrideMatches(
  battle: BattleFoldState,
  override: TutorialBattleAiActionOverride,
): boolean {
  if (
    (battle.consumedTutorialAiActionOverrideIds ?? []).includes(override.id)
  ) {
    return false;
  }
  const { board } = battle;
  const { side, cardId } = override.trigger;
  if (
    board.activeSide !== side ||
    board.phase !== "day" ||
    board.sides[side].dreamwellDrawnTurn !== board.turnNumber
  ) {
    return false;
  }
  const dreamwellIndex = board.sides[side].dreamwellCardIndex;
  return (
    dreamwellIndex !== null &&
    battle.init.dreamwellDeck[dreamwellIndex]?.id === cardId
  );
}

function selectPlayCard(
  battle: BattleFoldState,
  override: TutorialBattleAiActionOverride,
): TutorialAiActionOverridePlan {
  const { board } = battle;
  const side = override.trigger.side;
  const sourceHandIndex = board.sides[side].hand.findIndex(
    (battleCardId) =>
      board.cardInstances[battleCardId]?.definition.cardId ===
      override.action.cardId,
  );
  if (sourceHandIndex < 0) {
    return { kind: "blocked", override, reason: "card-not-in-hand" };
  }
  const battleCardId = board.sides[side].hand[sourceHandIndex];
  if (battleCardId === undefined) {
    return { kind: "blocked", override, reason: "card-not-in-hand" };
  }
  const instance = board.cardInstances[battleCardId];
  if (instance === undefined || instance.controller !== side) {
    return { kind: "blocked", override, reason: "card-not-in-hand" };
  }
  if (!isBattleCardSemanticPlayAutomated(instance.definition.cardId)) {
    return {
      kind: "blocked",
      override,
      reason: "card-automation-unavailable",
    };
  }
  if (
    instance.definition.battleCardKind !== "character" &&
    instance.definition.battleCardKind !== "event"
  ) {
    return { kind: "blocked", override, reason: "unsupported-card-kind" };
  }
  if (instance.definition.isFast) {
    return { kind: "blocked", override, reason: "fast-card-unsupported" };
  }
  if (board.sides[side].currentEnergy < instance.definition.energyCost) {
    return { kind: "blocked", override, reason: "insufficient-energy" };
  }
  if (
    !semanticPlayTargetsAreLegal(board, side, instance.definition.cardId, [])
  ) {
    return { kind: "blocked", override, reason: "targets-required" };
  }
  const characterDestination =
    instance.definition.battleCardKind === "character"
      ? selectCenterPreferredCharacterPlaySlot(board, side)
      : null;
  if (
    instance.definition.battleCardKind === "character" &&
    characterDestination === null
  ) {
    return { kind: "blocked", override, reason: "no-character-slot" };
  }
  return {
    kind: "play-card",
    selection: {
      override,
      battleCardId,
      sourceHandIndex,
      characterDestination,
    },
  };
}
