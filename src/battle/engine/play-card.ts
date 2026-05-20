import {
  cloneBattleMutableState,
} from "../state/create-initial-state";
import {
  isBattleFieldSlotAddressValid,
  selectBattleCardLocation,
  selectBattlefieldCardLocation,
  selectBattlefieldSlotOccupant,
  selectDefaultCharacterPlaySlot,
  selectIsBattleCardReservedThisTurn,
} from "../state/selectors";
import {
  addFigmentsToStackInPlace,
  canMergeFigments,
  findBattlefieldFigmentStack,
  isFigmentInstance,
  selectFigmentCount,
} from "../state/figments";
import {
  AUTO_SYSTEM_EMISSION_CONTEXT,
  createEmptyTransitionData,
  createFlowStep,
} from "./result";
import type {
  BattleEngineEmissionContext,
  BattleCardInstance,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleTransitionData,
  DeploySlotId,
  ReserveSlotId,
} from "../types";
import { createBattleLogBaseFields, logEvent } from "../../logging";

export function resolveMoveCard(
  state: BattleMutableState,
  battleCardId: string,
  target: BattleFieldSlotAddress,
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const source = selectBattlefieldCardLocation(state, battleCardId);
  if (
    source === null ||
    !isBattleFieldSlotAddressValid(target) ||
    source.side !== target.side
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  // Spec F-4/F-6: intra-zone moves (e.g. reserve→reserve, deployed→deployed)
  // are permitted and swap with the target occupant when present. Only the
  // exact same slot-address is a no-op.
  if (source.zone === target.zone && source.slotId === target.slotId) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const targetOccupant = selectBattlefieldSlotOccupant(state, target);
  const movingCard = state.cardInstances[battleCardId];
  if (
    targetOccupant !== null &&
    canMergeFigments(movingCard, state.cardInstances[targetOccupant])
  ) {
    const nextState = cloneBattleMutableState(state);
    setBattlefieldSlot(nextState, source, null);
    addFigmentsToStackInPlace(
      nextState,
      targetOccupant,
      selectFigmentCount(nextState.cardInstances[battleCardId]),
    );
    delete nextState.cardInstances[battleCardId];

    return {
      state: nextState,
      transition: createEmptyTransitionData(),
    };
  }
  if (
    source.zone === "reserve" &&
    target.zone === "deployed" &&
    selectIsBattleCardReservedThisTurn(state, battleCardId) &&
    movingCard !== undefined &&
    !isUnboundCard(movingCard)
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }
  const nextState = cloneBattleMutableState(state);

  setBattlefieldSlot(nextState, source, targetOccupant);
  setBattlefieldSlot(nextState, target, battleCardId);
  if (target.zone === "deployed") {
    nextState.cardInstances[battleCardId].enteredReserveTurnNumber = null;
  }

  // Spec §L-4 (bug-094): the design doc mentions "cardId, from, to" as the
  // conceptual fields for movement events. The implementation uses the
  // split-field schema `battleCardId` + `sourceZone`/`sourceSlotId` +
  // `targetZone`/`targetSlotId` so log consumers can query each axis
  // independently without reparsing a composite identifier. `from`/`to` are
  // the pair `{sourceZone, sourceSlotId}` / `{targetZone, targetSlotId}`.
  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        {
          event: "battle_proto_move_card",
          fields: {
            ...createBattleLogBaseFields(state, {
              sourceSurface: context.sourceSurface,
              selectedCardId: battleCardId,
            }),
            battleCardId,
            cardName: state.cardInstances[battleCardId]?.definition.name ?? "Card",
            isSwap: targetOccupant !== null,
            side: source.side,
            sourceSlotId: source.slotId,
            sourceZone: source.zone,
            swappedBattleCardId: targetOccupant,
            swappedCardName: targetOccupant === null
              ? null
              : state.cardInstances[targetOccupant]?.definition.name ?? "Card",
            targetSlotId: target.slotId,
            targetZone: target.zone,
          },
        },
      ],
    },
  };
}

export function resolvePlayCard(
  state: BattleMutableState,
  battleCardId: string,
  target?: BattleFieldSlotAddress,
  context: BattleEngineEmissionContext = AUTO_SYSTEM_EMISSION_CONTEXT,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = state.cardInstances[battleCardId];
  const location = selectBattleCardLocation(state, battleCardId);
  const reclaimCost = card?.definition.reclaimCost ?? null;
  const isReclaimPlay =
    location?.zone === "void" && reclaimCost !== null && reclaimCost >= 0;
  if (
    card === undefined ||
    location === null ||
    (location.zone !== "hand" && !isReclaimPlay)
  ) {
    return {
      state,
      transition: buildPlayRejectedTransition(
        state,
        battleCardId,
        "card_not_in_hand",
        context,
      ),
    };
  }
  if (location.zone !== "hand" && location.zone !== "void") {
    return {
      state,
      transition: buildPlayRejectedTransition(
        state,
        battleCardId,
        "card_not_in_hand",
        context,
      ),
    };
  }

  const playCost = isReclaimPlay ? reclaimCost : card.definition.energyCost;

  if (card.definition.battleCardKind === "character") {
    return resolveCharacterPlay(
      state,
      battleCardId,
      location.side,
      location.zone,
      location.index,
      playCost,
      target,
      context,
    );
  }

  if (target !== undefined) {
    return {
      state,
      transition: buildPlayRejectedTransition(
        state,
        battleCardId,
        "event_play_with_target",
        context,
      ),
    };
  }

  return resolveNonCharacterPlay(
    state,
    battleCardId,
    location.side,
    location.zone,
    location.index,
    playCost,
    context,
  );
}

function resolveCharacterPlay(
  state: BattleMutableState,
  battleCardId: string,
  side: "player" | "enemy",
  sourceZone: "hand" | "void",
  sourceIndex: number,
  playCost: number,
  requestedTarget: BattleFieldSlotAddress | undefined,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = state.cardInstances[battleCardId];
  const isUnbound = card !== undefined && isUnboundCard(card);
  const target = isUnbound
    ? requestedTarget ?? selectDefaultCharacterPlaySlot(state, side)
    : requestedTarget?.zone === "reserve"
      ? requestedTarget
      : selectDefaultReservePlaySlot(state, side);
  if (target === null) {
    return {
      state,
      transition: buildPlayRejectedTransition(state, battleCardId, "no_open_slot", context),
    };
  }
  if (!isBattleFieldSlotAddressValid(target)) {
    return {
      state,
      transition: buildPlayRejectedTransition(state, battleCardId, "invalid_target", context),
    };
  }
  if (target.side !== side) {
    return {
      state,
      transition: buildPlayRejectedTransition(state, battleCardId, "cross_side_target", context),
    };
  }
  if (selectBattlefieldSlotOccupant(state, target) !== null) {
    const targetOccupant = selectBattlefieldSlotOccupant(state, target);
    if (!canMergeFigments(card, targetOccupant === null ? null : state.cardInstances[targetOccupant])) {
      return {
        state,
        transition: buildPlayRejectedTransition(state, battleCardId, "slot_occupied", context),
      };
    }
  }

  const nextState = cloneBattleMutableState(state);
  nextState.sides[side][sourceZone].splice(sourceIndex, 1);
  nextState.sides[side].currentEnergy -= playCost;
  const stack = isFigmentInstance(card)
    ? findBattlefieldFigmentStack(nextState, target.side, card.definition.subtype, battleCardId)
    : null;
  if (stack !== null) {
    addFigmentsToStackInPlace(nextState, stack.battleCardId, selectFigmentCount(card));
    delete nextState.cardInstances[battleCardId];
  } else {
    setBattlefieldSlot(nextState, target, battleCardId);
  }
  if (target.zone === "reserve" && nextState.cardInstances[battleCardId] !== undefined) {
    nextState.cardInstances[battleCardId].enteredReserveTurnNumber = isUnbound ? null : state.turnNumber;
  }
  const cardContext: BattleEngineEmissionContext = {
    sourceSurface: context.sourceSurface,
    selectedCardId: battleCardId,
  };
  const resolvedTarget = stack?.location ?? target;

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      energyChanges: [
        {
          at: createFlowStep(state.activeSide, state.phase),
          side,
          previousCurrentEnergy: state.sides[side].currentEnergy,
          currentEnergy: nextState.sides[side].currentEnergy,
          previousMaxEnergy: state.sides[side].maxEnergy,
          maxEnergy: nextState.sides[side].maxEnergy,
        },
      ],
      logEvents: [
        {
          event: "battle_proto_play_card",
          fields: {
            ...createBattleLogBaseFields(state, cardContext),
            battleCardId,
            cardKind: card.definition.battleCardKind,
            cardName: card.definition.name,
            currentEnergy: nextState.sides[side].currentEnergy,
            side,
            sourceHandIndex: sourceZone === "hand" ? sourceIndex : null,
            sourceZone,
            targetSlotId: resolvedTarget.slotId,
            targetZone: resolvedTarget.zone,
          },
        },
        {
          event: "battle_proto_energy_changed",
          fields: {
            ...createBattleLogBaseFields(state, cardContext),
            currentEnergy: nextState.sides[side].currentEnergy,
            currentEnergyDelta: nextState.sides[side].currentEnergy - state.sides[side].currentEnergy,
            maxEnergy: nextState.sides[side].maxEnergy,
            maxEnergyDelta: nextState.sides[side].maxEnergy - state.sides[side].maxEnergy,
            previousCurrentEnergy: state.sides[side].currentEnergy,
            previousMaxEnergy: state.sides[side].maxEnergy,
            side,
          },
        },
      ],
    },
  };
}

function resolveNonCharacterPlay(
  state: BattleMutableState,
  battleCardId: string,
  side: "player" | "enemy",
  sourceZone: "hand" | "void",
  sourceIndex: number,
  playCost: number,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const nextState = cloneBattleMutableState(state);
  nextState.sides[side][sourceZone].splice(sourceIndex, 1);
  const targetZone = sourceZone === "void" ? "banished" : "void";
  nextState.sides[side][targetZone].push(battleCardId);
  nextState.sides[side].currentEnergy -= playCost;
  const cardContext: BattleEngineEmissionContext = {
    sourceSurface: context.sourceSurface,
    selectedCardId: battleCardId,
  };

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      energyChanges: [
        {
          at: createFlowStep(state.activeSide, state.phase),
          side,
          previousCurrentEnergy: state.sides[side].currentEnergy,
          currentEnergy: nextState.sides[side].currentEnergy,
          previousMaxEnergy: state.sides[side].maxEnergy,
          maxEnergy: nextState.sides[side].maxEnergy,
        },
      ],
      logEvents: [
        {
          event: "battle_proto_play_card",
          fields: {
            ...createBattleLogBaseFields(state, cardContext),
            battleCardId,
            cardKind: nextState.cardInstances[battleCardId].definition.battleCardKind,
            cardName: nextState.cardInstances[battleCardId].definition.name,
            currentEnergy: nextState.sides[side].currentEnergy,
            side,
            sourceHandIndex: sourceZone === "hand" ? sourceIndex : null,
            sourceZone,
            targetSlotId: null,
            targetZone,
          },
        },
        {
          event: "battle_proto_energy_changed",
          fields: {
            ...createBattleLogBaseFields(state, cardContext),
            currentEnergy: nextState.sides[side].currentEnergy,
            currentEnergyDelta: nextState.sides[side].currentEnergy - state.sides[side].currentEnergy,
            maxEnergy: nextState.sides[side].maxEnergy,
            maxEnergyDelta: nextState.sides[side].maxEnergy - state.sides[side].maxEnergy,
            previousCurrentEnergy: state.sides[side].currentEnergy,
            previousMaxEnergy: state.sides[side].maxEnergy,
            side,
          },
        },
      ],
    },
  };
}

function setBattlefieldSlot(
  state: BattleMutableState,
  target: BattleFieldSlotAddress,
  battleCardId: string | null,
): void {
  if (target.zone === "reserve") {
    state.sides[target.side].reserve[target.slotId as ReserveSlotId] = battleCardId;
    return;
  }

  state.sides[target.side].deployed[target.slotId as DeploySlotId] = battleCardId;
}

function selectDefaultReservePlaySlot(
  state: BattleMutableState,
  side: "player" | "enemy",
): BattleFieldSlotAddress | null {
  for (const slotId of ["R0", "R1", "R2", "R3", "R4"] as const) {
    if (state.sides[side].reserve[slotId] === null) {
      return {
        side,
        zone: "reserve",
        slotId,
      };
    }
  }
  return null;
}

function isUnboundCard(card: BattleCardInstance): boolean {
  return card.definition.renderedText.toLowerCase().includes("unbound");
}

function buildPlayRejectedTransition(
  state: BattleMutableState,
  battleCardId: string,
  reason:
    | "card_not_in_hand"
    | "event_play_with_target"
    | "no_open_slot"
    | "invalid_target"
    | "cross_side_target"
    | "slot_occupied",
  context: BattleEngineEmissionContext,
): BattleTransitionData {
  const cardContext: BattleEngineEmissionContext = {
    sourceSurface: context.sourceSurface,
    selectedCardId: battleCardId,
  };

  // The reducer suppresses `lastTransition` updates when state is unchanged,
  // so emit the rejection log immediately for debug visibility (bug-048).
  logEvent("battle_proto_play_rejected", {
    ...createBattleLogBaseFields(state, cardContext),
    battleCardId,
    cardName: state.cardInstances[battleCardId]?.definition.name ?? null,
    reason,
  });

  return {
    ...createEmptyTransitionData(),
    logEvents: [
      {
        event: "battle_proto_play_rejected",
        fields: {
          ...createBattleLogBaseFields(state, cardContext),
          battleCardId,
          cardName: state.cardInstances[battleCardId]?.definition.name ?? null,
          reason,
        },
      },
    ],
  };
}
