import type { BattleDebugEdit, BattleDebugZoneDestination } from "../debug/commands";
import {
  createBattleResultChangedLogFields,
  createEmptyTransitionData,
  createFlowStep,
} from "../engine/result";
import {
  createBattleLogBaseFields,
  createBattleProtoCardCreatedLogEvent,
  createBattleProtoDeckReorderedLogEvent,
  createBattleProtoMarkerSetLogEvent,
  createBattleProtoNoteAddedLogEvent,
  createBattleProtoNoteClearedLogEvent,
  createBattleProtoNoteDismissedLogEvent,
} from "../../logging";
import type {
  BattleCardInstance,
  BattleCardMarkers,
  BattleCardNote,
  BattleCardStatus,
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleEngineEmissionContext,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleResult,
  BattleSide,
  BattleTransitionData,
} from "../types";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import {
  allocateBattleCardInstance,
  allocateBattleStackEntryId,
  cloneBattleDeckCardDefinition,
  cloneBattleMutableState,
} from "./create-initial-state";
import { diffMarkerValue } from "./markers-utils";
import {
  isBattleFieldSlotAddressValid,
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectDefaultCharacterPlaySlot,
  selectKindleTargetBattleCardId,
} from "./selectors";
import {
  addFigmentsToStackInPlace,
  canMergeFigments,
  dissolveFigmentsFromStackInPlace,
  findBattlefieldFigmentStack,
  isFigmentInstance,
  mergeFigmentsIntoStackInPlace,
  selectFigmentCount,
  selectFigmentSparks,
} from "./figments";
import { lookupFigmentCatalogEntry, type FigmentKeyword } from "./figment-catalog";

export function applyDebugEdit(
  state: BattleMutableState,
  edit: BattleDebugEdit,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const nextState = cloneBattleMutableState(state);

  switch (edit.kind) {
    case "SET_SCORE":
      if (nextState.sides[edit.side].score === edit.value) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.sides[edit.side].score = edit.value;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
    case "SET_CURRENT_ENERGY":
      if (nextState.sides[edit.side].currentEnergy === edit.value) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.sides[edit.side].currentEnergy = edit.value;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
    case "SET_MAX_ENERGY":
      if (nextState.sides[edit.side].maxEnergy === edit.value) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.sides[edit.side].maxEnergy = edit.value;
      return {
        state: nextState,
        transition: createEnergyChangeTransition(
          state,
          edit.side,
          state.sides[edit.side].currentEnergy,
          nextState.sides[edit.side].currentEnergy,
          state.sides[edit.side].maxEnergy,
          nextState.sides[edit.side].maxEnergy,
          context,
        ),
      };
    case "INCREASE_MAX_ENERGY_AND_FILL": {
      const previousCurrentEnergy = state.sides[edit.side].currentEnergy;
      const previousMaxEnergy = state.sides[edit.side].maxEnergy;
      const nextMaxEnergy = previousMaxEnergy + 1;
      nextState.sides[edit.side].maxEnergy = nextMaxEnergy;
      nextState.sides[edit.side].currentEnergy = nextMaxEnergy;
      return {
        state: nextState,
        transition: createEnergyChangeTransition(
          state,
          edit.side,
          previousCurrentEnergy,
          nextState.sides[edit.side].currentEnergy,
          previousMaxEnergy,
          nextState.sides[edit.side].maxEnergy,
          context,
        ),
      };
    }
    case "ADJUST_SCORE":
      if (edit.amount === 0) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.sides[edit.side].score += edit.amount;
      return {
        state: nextState,
        transition: createScoreChangeTransition(
          state,
          edit.side,
          state.sides[edit.side].score,
          nextState.sides[edit.side].score,
          context,
        ),
      };
    case "ADJUST_CURRENT_ENERGY":
      if (edit.amount === 0) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.sides[edit.side].currentEnergy += edit.amount;
      return {
        state: nextState,
        transition: createEnergyChangeTransition(
          state,
          edit.side,
          state.sides[edit.side].currentEnergy,
          nextState.sides[edit.side].currentEnergy,
          state.sides[edit.side].maxEnergy,
          nextState.sides[edit.side].maxEnergy,
          context,
        ),
      };
    case "ADJUST_MAX_ENERGY":
      if (edit.amount === 0) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.sides[edit.side].maxEnergy += edit.amount;
      return {
        state: nextState,
        transition: createEnergyChangeTransition(
          state,
          edit.side,
          state.sides[edit.side].currentEnergy,
          nextState.sides[edit.side].currentEnergy,
          state.sides[edit.side].maxEnergy,
          nextState.sides[edit.side].maxEnergy,
          context,
        ),
      };
    case "SET_CARD_SPARK":
      if (nextState.cardInstances[edit.battleCardId]?.sparkDelta === undefined) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.cardInstances[edit.battleCardId].sparkDelta =
        edit.value - nextState.cardInstances[edit.battleCardId].definition.printedSpark;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
    case "SET_CARD_SPARK_DELTA":
      if (nextState.cardInstances[edit.battleCardId]?.sparkDelta === undefined) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      if (nextState.cardInstances[edit.battleCardId].sparkDelta === edit.value) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.cardInstances[edit.battleCardId].sparkDelta = edit.value;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
    case "MOVE_CARD_TO_ZONE":
      return moveCardToDebugZone(state, edit.battleCardId, edit.destination);
    case "SWAP_BATTLEFIELD_SLOTS":
      return swapBattlefieldSlots(state, edit.source, edit.target);
    case "DRAW_CARD":
      return drawCardToHand(state, edit.side);
    case "ERODE":
      return erodeDeck(state, edit.side, edit.count);
    case "DISCARD_CARD":
      return discardHandCard(state, edit.battleCardId);
    case "ABANDON":
      return abandonCard(state, edit.battleCardId);
    case "REMATERIALIZE":
      return rematerializeCard(state, edit.battleCardId);
    case "KINDLE":
      return kindleCard(state, edit.side, edit.amount, edit.preferredBattleCardId ?? null);
    case "SET_CARD_VISIBILITY":
      if (nextState.cardInstances[edit.battleCardId] === undefined) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      if (
        nextState.cardInstances[edit.battleCardId].isRevealedToPlayer
        === edit.isRevealedToPlayer
      ) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.cardInstances[edit.battleCardId].isRevealedToPlayer = edit.isRevealedToPlayer;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
    case "SET_SIDE_HAND_VISIBILITY":
      return setSideHandVisibility(
        state,
        nextState,
        edit.side,
        edit.isRevealedToPlayer,
        context,
      );
    case "ADD_CARD_NOTE":
      return addCardNote(
        state,
        nextState,
        edit.battleCardId,
        edit.noteId,
        edit.text,
        edit.createdAtMs,
        edit.expiry,
        context,
      );
    case "DISMISS_CARD_NOTE":
      return dismissCardNote(
        state,
        nextState,
        edit.battleCardId,
        edit.noteId,
        context,
      );
    case "CLEAR_CARD_NOTES":
      return clearCardNotes(state, nextState, edit.battleCardId, context);
    case "SET_CARD_MARKERS":
      return setCardMarkers(
        state,
        nextState,
        edit.battleCardId,
        edit.markers,
        context,
      );
    case "SET_CARD_STATUS":
      return setCardStatus(state, nextState, edit.battleCardId, edit.status);
    case "SET_COUNTERS":
      return setCounters(state, nextState, edit.battleCardId, edit.value);
    case "CREATE_CARD_COPY":
      return createCardCopy(
        state,
        nextState,
        edit.sourceBattleCardId,
        edit.destination,
        edit.createdAtMs,
        context,
      );
    case "CREATE_FIGMENT":
      return createFigment(
        state,
        nextState,
        edit.side,
        edit.chosenSubtype,
        edit.chosenSpark,
        edit.name,
        edit.destination,
        edit.createdAtMs,
        context,
      );
    case "CREATE_CARD_FROM_DEFINITION":
      return createCardFromDefinition(
        state,
        nextState,
        edit.definition,
        edit.destination,
        edit.createdAtMs,
        context,
      );
    case "REORDER_DECK":
      return reorderDeck(state, nextState, edit.side, edit.order, context);
    case "REVEAL_DECK_TOP":
      return revealDeckTop(state, nextState, edit.side, edit.count);
    case "HIDE_DECK_TOP":
      return hideDeckTop(state, nextState, edit.side, edit.count);
    case "PLAY_FROM_DECK_TOP":
      return playFromDeckTop(state, edit.side, edit.target);
    case "SET_PHASE":
      if (nextState.phase === edit.phase) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.phase = edit.phase;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
    case "SET_BATTLE_FLOW":
      if (
        nextState.phase === edit.phase &&
        nextState.activeSide === edit.activeSide &&
        nextState.turnNumber === edit.turnNumber
      ) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.phase = edit.phase;
      nextState.activeSide = edit.activeSide;
      nextState.turnNumber = edit.turnNumber;
      return {
        state: nextState,
        transition: createEmptyTransitionData(),
      };
  }
}

function reorderDeck(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  order: readonly string[],
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const currentDeck = nextState.sides[side].deck;
  if (!isDeckPermutation(currentDeck, order)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const orderBefore = [...currentDeck];
  const orderAfter = [...order];
  if (isSameOrder(orderBefore, orderAfter)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  nextState.sides[side].deck = orderAfter;

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoDeckReorderedLogEvent(
          nextState,
          { side, orderBefore, orderAfter },
          context,
        ),
      ],
    },
  };
}

function isDeckPermutation(
  current: readonly string[],
  candidate: readonly string[],
): boolean {
  if (current.length !== candidate.length) {
    return false;
  }

  const currentCounts = new Map<string, number>();
  for (const id of current) {
    currentCounts.set(id, (currentCounts.get(id) ?? 0) + 1);
  }

  for (const id of candidate) {
    const count = currentCounts.get(id);
    if (count === undefined || count === 0) {
      return false;
    }
    currentCounts.set(id, count - 1);
  }

  return true;
}

function isSameOrder(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function revealDeckTop(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  count: number,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  return setDeckTopVisibility(state, nextState, side, count, true);
}

function hideDeckTop(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  count: number,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  return setDeckTopVisibility(state, nextState, side, count, false);
}

function setDeckTopVisibility(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  count: number,
  isRevealedToPlayer: boolean,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const deck = nextState.sides[side].deck;
  const effective = Math.max(0, Math.min(count, deck.length));
  if (effective === 0) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  let changed = false;
  for (let index = 0; index < effective; index += 1) {
    const battleCardId = deck[index];
    const instance = nextState.cardInstances[battleCardId];
    if (instance === undefined) {
      continue;
    }
    if (instance.isRevealedToPlayer !== isRevealedToPlayer) {
      instance.isRevealedToPlayer = isRevealedToPlayer;
      changed = true;
    }
  }

  if (!changed) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

function playFromDeckTop(
  state: BattleMutableState,
  side: BattleSide,
  target: BattleFieldSlotAddress | undefined,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const topBattleCardId = state.sides[side].deck[0];
  if (topBattleCardId === undefined || state.cardInstances[topBattleCardId] === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  // Manual, energy-free play: move the top deck card straight onto an open
  // battlefield slot on that side. The destination is the explicit target when
  // given, otherwise the first open reserve slot, then the first open deployed
  // slot (selectDefaultCharacterPlaySlot). No-op when nothing is open or the
  // explicit target is occupied/invalid.
  const resolvedTarget = target ?? selectDefaultCharacterPlaySlot(state, side) ?? undefined;
  if (resolvedTarget === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  if (!isDebugDestinationPlaceable(state, resolvedTarget)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  nextState.sides[side].deck = nextState.sides[side].deck.slice(1);
  insertBattleCardAtDebugDestination(nextState, topBattleCardId, resolvedTarget);
  nextState.cardInstances[topBattleCardId].controller = resolvedTarget.side;
  nextState.cardInstances[topBattleCardId].isRevealedToPlayer = true;

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

function setSideHandVisibility(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  isRevealedToPlayer: boolean,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  let affectedCount = 0;
  for (const battleCardId of nextState.sides[side].hand) {
    const card = nextState.cardInstances[battleCardId];
    if (card === undefined || card.isRevealedToPlayer === isRevealedToPlayer) {
      continue;
    }
    card.isRevealedToPlayer = isRevealedToPlayer;
    affectedCount += 1;
  }

  if (affectedCount === 0) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        {
          event: "battle_proto_hand_visibility_set",
          fields: {
            ...createBattleLogBaseFields(nextState, context),
            affectedCount,
            isRevealedToPlayer,
            side,
          },
        },
      ],
    },
  };
}

function addCardNote(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  noteId: string,
  text: string,
  createdAtMs: number,
  expiry: BattleCardNote["expiry"],
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (nextState.cardInstances[battleCardId] === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const createdAtTurnNumber = nextState.turnNumber;
  const createdAtSide = nextState.activeSide;
  const note: BattleCardNote = {
    noteId,
    text,
    createdAtTurnNumber,
    createdAtSide,
    createdAtMs,
    expiry,
  };
  nextState.cardInstances[battleCardId].notes = [
    ...nextState.cardInstances[battleCardId].notes,
    note,
  ];

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoNoteAddedLogEvent(
          nextState,
          {
            battleCardId,
            noteId,
            text,
            expiry,
            createdAtTurnNumber,
            createdAtSide,
          },
          context,
        ),
      ],
    },
  };
}

function dismissCardNote(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  noteId: string,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = nextState.cardInstances[battleCardId];
  if (card === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const filtered = card.notes.filter((note) => note.noteId !== noteId);
  if (filtered.length === card.notes.length) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  nextState.cardInstances[battleCardId].notes = filtered;

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoNoteDismissedLogEvent(
          nextState,
          { battleCardId, noteId },
          context,
        ),
      ],
    },
  };
}

function clearCardNotes(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = nextState.cardInstances[battleCardId];
  if (card === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const noteCount = card.notes.length;
  if (noteCount === 0) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  nextState.cardInstances[battleCardId].notes = [];

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoNoteClearedLogEvent(
          nextState,
          { battleCardId, noteCount },
          context,
        ),
      ],
    },
  };
}

function setCardMarkers(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  markers: BattleCardMarkers,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = nextState.cardInstances[battleCardId];
  if (card === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const previous = card.markers;
  if (
    previous.isPrevented === markers.isPrevented &&
    previous.isCopied === markers.isCopied
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  nextState.cardInstances[battleCardId].markers = {
    isPrevented: markers.isPrevented,
    isCopied: markers.isCopied,
  };

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoMarkerSetLogEvent(
          nextState,
          {
            battleCardId,
            markers: {
              isPrevented: markers.isPrevented,
              isCopied: markers.isCopied,
            },
            diff: {
              prevented: diffMarkerValue(previous.isPrevented, markers.isPrevented),
              copied: diffMarkerValue(previous.isCopied, markers.isCopied),
            },
          },
          context,
        ),
      ],
    },
  };
}

/**
 * Merges a partial `BattleCardStatus` onto the instance's status. Basic
 * automation uses this to clear `isExhausted` on the incoming side's characters
 * during the Dawn phase (rules §Dawn). Acts only on the status FIELD; the merge
 * leaves untouched fields intact. A merge that changes nothing is a no-op.
 *
 * ☪ auto-retreat (rules §Exhaust and Awaken): when the merge sets
 * `isExhausted: true` on a front-rank character, the body is automatically moved
 * to an available back-rank position so it does not remain a potential
 * challenger or defender. If the back rank has no open position, the exhaust is
 * rejected entirely (the state is returned unchanged), matching the rule that a
 * front-rank source which cannot retreat cannot pay the ☪ cost.
 */
function setCardStatus(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  status: Partial<BattleCardStatus>,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = nextState.cardInstances[battleCardId];
  if (card === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const current = card.status;
  const changed = (Object.keys(status) as (keyof BattleCardStatus)[]).some(
    (key) => status[key] !== undefined && status[key] !== current[key],
  );
  if (!changed) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  // The exhaust is becoming newly true: a front-rank source must retreat first.
  const isExhausting = status.isExhausted === true && !current.isExhausted;
  if (isExhausting) {
    const location = selectBattleCardLocation(nextState, battleCardId);
    if (location !== null && location.zone === "frontRank") {
      const retreatSlot = selectFirstOpenBackRankSlot(nextState, location.side);
      if (retreatSlot === null) {
        // No open back-rank position to retreat into: reject the exhaust whole.
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      removeBattleCardFromLocation(nextState, location);
      setBattlefieldSlotOccupant(nextState, retreatSlot, battleCardId);
    }
  }

  nextState.cardInstances[battleCardId].status = {
    ...current,
    ...status,
  };

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

/**
 * Sets the card's stored ⧗ counters to `value`, clamped to ≥ 0 (rules
 * §Counters). Counters are local to a card; the leave-play path (see
 * {@link clearCountersOnLeavingPlay}) zeroes them when the card leaves the
 * battlefield.
 * A set that does not change the clamped value is a no-op.
 */
function setCounters(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  value: number,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const card = nextState.cardInstances[battleCardId];
  if (card === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const clamped = Math.max(0, Math.trunc(value));
  if (card.status.counters === clamped) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  nextState.cardInstances[battleCardId].status = {
    ...card.status,
    counters: clamped,
  };

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

/**
 * Returns the first open back-rank slot address on `side`, scanning B0…B4 in
 * order, or null when every back-rank position is occupied.
 */
function selectFirstOpenBackRankSlot(
  state: BattleMutableState,
  side: BattleSide,
): BattleFieldSlotAddress | null {
  for (const slotId of BACK_RANK_SLOT_IDS) {
    if (state.sides[side].backRank[slotId] === null) {
      return { side, zone: "backRank", slotId };
    }
  }
  return null;
}

function createCardCopy(
  state: BattleMutableState,
  nextState: BattleMutableState,
  sourceBattleCardId: string,
  destination: BattleDebugZoneDestination,
  createdAtMs: number,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const sourceInstance = nextState.cardInstances[sourceBattleCardId];
  if (sourceInstance === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  if (!isDestinationAvailable(nextState, destination)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const definition = cloneBattleDeckCardDefinition(sourceInstance.definition);
  const provenance: BattleCardProvenance = {
    kind: "generated-copy",
    sourceBattleCardId,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: nextState.turnNumber,
    createdAtSide: nextState.activeSide,
    createdAtMs,
  };
  const battleCardId = allocateBattleCardInstance(nextState, {
    definition,
    owner: destination.side,
    controller: destination.side,
    isRevealedToPlayer: true,
    provenance,
  });

  insertBattleCardAtDebugDestination(nextState, battleCardId, destination);

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoCardCreatedLogEvent(
          nextState,
          {
            battleCardId,
            destinationZone: formatDestinationZoneLabel(destination),
            name: definition.name,
            ownerSide: destination.side,
            printedSpark: definition.printedSpark,
            provenanceKind: "generated-copy",
            sourceBattleCardId,
            subtype: definition.subtype,
          },
          context,
        ),
      ],
    },
  };
}

function createFigment(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  chosenSubtype: string,
  chosenSpark: number,
  name: string,
  destination: BattleDebugZoneDestination,
  createdAtMs: number,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  // A negative `chosenSpark` is the "use catalog default" sentinel: resolve it to
  // the catalog base spark for this figment type (rules §Figments), falling back
  // to 0 for an unknown subtype.
  const catalogEntry = lookupFigmentCatalogEntry(chosenSubtype);
  const resolvedSpark = chosenSpark < 0
    ? catalogEntry?.baseSpark ?? 0
    : chosenSpark;

  if ("slotId" in destination) {
    const existingStack = findBattlefieldFigmentStack(
      nextState,
      destination.side,
      chosenSubtype,
    );
    if (existingStack !== null) {
      addFigmentsToStackInPlace(nextState, existingStack.battleCardId, 1, resolvedSpark);
      const stack = nextState.cardInstances[existingStack.battleCardId];
      return {
        state: nextState,
        transition: {
          ...createEmptyTransitionData(),
          logEvents: [
            createBattleProtoCardCreatedLogEvent(
              nextState,
              {
                battleCardId: existingStack.battleCardId,
                destinationZone: formatDestinationZoneLabel(existingStack.location),
                figmentCount: stack === undefined ? 1 : selectFigmentCount(stack),
                name: stack?.definition.name ?? name,
                ownerSide: side,
                printedSpark: stack?.definition.printedSpark ?? resolvedSpark,
                provenanceKind: "generated-figment",
                sourceBattleCardId: null,
                subtype: chosenSubtype,
              },
              context,
            ),
          ],
        },
      };
    }
  }

  if (!isDestinationAvailable(nextState, destination)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const definition: BattleDeckCardDefinition = {
    sourceDeckEntryId: null,
    cardNumber: 0,
    name,
    battleCardKind: "character",
    subtype: chosenSubtype,
    energyCost: 0,
    printedEnergyCost: 0,
    printedSpark: resolvedSpark,
    isFast: false,
    reclaimCost: null,
    renderedText: "",
    imageNumber: 0,
    transfiguration: null,
    isBane: false,
  };
  const provenance: BattleCardProvenance = {
    kind: "generated-figment",
    sourceBattleCardId: null,
    chosenSpark: resolvedSpark,
    chosenSubtype,
    createdAtTurnNumber: nextState.turnNumber,
    createdAtSide: nextState.activeSide,
    createdAtMs,
  };
  const battleCardId = allocateBattleCardInstance(nextState, {
    definition,
    owner: side,
    controller: destination.side,
    isRevealedToPlayer: true,
    provenance,
  });

  insertBattleCardAtDebugDestination(nextState, battleCardId, destination);

  applyFigmentKeywordToStatus(nextState, battleCardId, catalogEntry?.keyword);

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoCardCreatedLogEvent(
          nextState,
          {
            battleCardId,
            destinationZone: formatDestinationZoneLabel(destination),
            figmentCount: selectFigmentCount(nextState.cardInstances[battleCardId]),
            name,
            ownerSide: side,
            printedSpark: resolvedSpark,
            provenanceKind: "generated-figment",
            sourceBattleCardId: null,
            subtype: chosenSubtype,
          },
          context,
        ),
      ],
    },
  };
}

/**
 * Stamps a figment type's implicit keyword onto the new instance's status. The
 * four combat keywords map onto the matching `granted*` flag; `support` is a
 * static Support benefit resolved at challenge time and has no status flag.
 */
function applyFigmentKeywordToStatus(
  state: BattleMutableState,
  battleCardId: string,
  keyword: FigmentKeyword | undefined,
): void {
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined || keyword === undefined) {
    return;
  }

  switch (keyword) {
    case "unstoppable":
      instance.status.grantedUnstoppable = true;
      return;
    case "vengeful":
      instance.status.grantedVengeful = true;
      return;
    case "preeminence":
      instance.status.grantedPreeminence = true;
      return;
    case "awakened":
      instance.status.grantedAwakened = true;
      return;
    case "support":
      return;
  }
}

function createCardFromDefinition(
  state: BattleMutableState,
  nextState: BattleMutableState,
  definition: BattleDeckCardDefinition,
  destination: BattleDebugZoneDestination,
  createdAtMs: number,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (!isDestinationAvailable(nextState, destination)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const clonedDefinition = cloneBattleDeckCardDefinition(definition);
  const provenance: BattleCardProvenance = {
    kind: "generated-pool",
    sourceBattleCardId: null,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: nextState.turnNumber,
    createdAtSide: nextState.activeSide,
    createdAtMs,
  };
  const battleCardId = allocateBattleCardInstance(nextState, {
    definition: clonedDefinition,
    owner: destination.side,
    controller: destination.side,
    isRevealedToPlayer: true,
    provenance,
  });

  insertBattleCardAtDebugDestination(nextState, battleCardId, destination);

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        createBattleProtoCardCreatedLogEvent(
          nextState,
          {
            battleCardId,
            destinationZone: formatDestinationZoneLabel(destination),
            name: clonedDefinition.name,
            ownerSide: destination.side,
            printedSpark: clonedDefinition.printedSpark,
            provenanceKind: "generated-pool",
            sourceBattleCardId: null,
            subtype: clonedDefinition.subtype,
          },
          context,
        ),
      ],
    },
  };
}

function isDestinationAvailable(
  state: BattleMutableState,
  destination: BattleDebugZoneDestination,
): boolean {
  // bug-079: shared helper so the occupancy/validity check for debug-zone
  // destinations lives in one place (was duplicated in moveCardToDebugZone).
  return isDebugDestinationPlaceable(state, destination);
}

function isDebugDestinationPlaceable(
  state: BattleMutableState,
  destination: BattleDebugZoneDestination,
): boolean {
  if ("slotId" in destination) {
    if (!isBattleFieldSlotAddressValid(destination)) {
      return false;
    }
    return selectBattlefieldSlotOccupant(state, destination) === null;
  }

  return true;
}

function formatDestinationZoneLabel(
  destination: BattleDebugZoneDestination,
): string {
  if ("slotId" in destination) {
    return `${destination.side}:${destination.zone}:${destination.slotId}`;
  }

  if (destination.zone === "deck") {
    return `${destination.side}:deck:${destination.position}`;
  }

  return `${destination.side}:${destination.zone}`;
}

export function forceBattleResult(
  state: BattleMutableState,
  result: BattleResult,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (state.forcedResult === result && state.result === result) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  nextState.forcedResult = result;
  nextState.result = result;

  const evaluation = { result, reason: "forced_result" as const };

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      resultChange: {
        at: createFlowStep(state.activeSide, state.phase),
        previousResult: state.result,
        result,
        reason: "forced_result",
      },
      logEvents: [
        {
          event: "battle_proto_result_changed",
          fields: createBattleResultChangedLogFields(
            nextState,
            state.result,
            evaluation,
            state.phase,
            context,
          ),
        },
      ],
    },
  };
}

function moveCardToDebugZone(
  state: BattleMutableState,
  battleCardId: string,
  destination: Extract<BattleDebugEdit, { kind: "MOVE_CARD_TO_ZONE" }>["destination"],
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const source = selectBattleCardLocation(state, battleCardId);

  if (source === null || state.cardInstances[battleCardId] === undefined) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  if (isSameLocation(source, destination, state)) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  // Rules §The Play Area: an exhausted character cannot be moved to the front
  // rank by either player. Reject the move as a no-op when the moving instance
  // is exhausted and it would advance into a front-rank slot from elsewhere. A
  // reposition that begins in the front rank is already there and stays legal.
  if (
    "slotId" in destination &&
    destination.zone === "frontRank" &&
    source.zone !== "frontRank" &&
    state.cardInstances[battleCardId].status.isExhausted
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const sourceInstance = state.cardInstances[battleCardId];
  const destinationStack = "slotId" in destination && isFigmentInstance(sourceInstance)
    ? findBattlefieldFigmentStack(state, destination.side, sourceInstance.definition.subtype, battleCardId)
    : null;
  const destinationOccupant = "slotId" in destination
    ? selectBattlefieldSlotOccupant(state, destination)
    : null;
  const canMergeIntoDestination = destinationStack !== null ||
    (
      destinationOccupant !== null &&
      canMergeFigments(sourceInstance, state.cardInstances[destinationOccupant])
    );

  if (!isDebugDestinationPlaceable(state, destination)) {
    if (!canMergeIntoDestination) {
      return {
        state,
        transition: createEmptyTransitionData(),
      };
    }
  }

  const sourceFigmentSparks = selectFigmentSparks(sourceInstance);
  const nextState = cloneBattleMutableState(state);
  removeBattleCardFromLocation(nextState, source);
  if (destinationStack !== null) {
    mergeFigmentsIntoStackInPlace(
      nextState,
      destinationStack.battleCardId,
      sourceFigmentSparks,
    );
    delete nextState.cardInstances[battleCardId];
  } else if (
    destinationOccupant !== null &&
    canMergeFigments(sourceInstance, state.cardInstances[destinationOccupant])
  ) {
    mergeFigmentsIntoStackInPlace(
      nextState,
      destinationOccupant,
      sourceFigmentSparks,
    );
    delete nextState.cardInstances[battleCardId];
  } else {
    insertBattleCardAtDebugDestination(nextState, battleCardId, destination);
    const moved = nextState.cardInstances[battleCardId];
    moved.controller = destination.side;
    clearCountersOnLeavingPlay(moved, source.zone, destination.zone);
  }

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

const BATTLEFIELD_ZONE_NAMES = new Set<string>(["backRank", "frontRank"]);

/**
 * Resets a card's stored ⧗ counters to 0 when it leaves the battlefield (rules
 * §Counters): counters are local to a card and do not travel with it across a
 * zone change out of play. A move within the battlefield (a reposition between
 * back and front rank) or into play leaves the counters untouched.
 */
function clearCountersOnLeavingPlay(
  instance: BattleCardInstance,
  sourceZone: string,
  destinationZone: string,
): void {
  const leavingPlay =
    !BATTLEFIELD_ZONE_NAMES.has(destinationZone) && BATTLEFIELD_ZONE_NAMES.has(sourceZone);
  if (leavingPlay) {
    instance.status = {
      ...instance.status,
      counters: 0,
    };
  }
}

function swapBattlefieldSlots(
  state: BattleMutableState,
  source: Extract<BattleDebugEdit, { kind: "SWAP_BATTLEFIELD_SLOTS" }>["source"],
  target: Extract<BattleDebugEdit, { kind: "SWAP_BATTLEFIELD_SLOTS" }>["target"],
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (
    !isBattleFieldSlotAddressValid(source) ||
    !isBattleFieldSlotAddressValid(target) ||
    (
      source.side === target.side &&
      source.zone === target.zone &&
      source.slotId === target.slotId
    )
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const sourceOccupant = selectBattlefieldSlotOccupant(state, source);
  const targetOccupant = selectBattlefieldSlotOccupant(state, target);

  if (sourceOccupant === null || targetOccupant === null) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  // Rules §The Play Area: an exhausted character cannot be moved to the front
  // rank by either player. A swap that would carry an exhausted occupant from
  // the back rank into a front-rank slot is rejected as a no-op. The source
  // occupant lands on `target`; the target occupant lands on `source`. A
  // front-to-front swap repositions a body already in the front rank and does
  // not advance it, so it stays legal.
  const sourceAdvancesToFront = target.zone === "frontRank" && source.zone !== "frontRank";
  const targetAdvancesToFront = source.zone === "frontRank" && target.zone !== "frontRank";
  if (
    (sourceAdvancesToFront && state.cardInstances[sourceOccupant].status.isExhausted) ||
    (targetAdvancesToFront && state.cardInstances[targetOccupant].status.isExhausted)
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  setBattlefieldSlotOccupant(nextState, source, targetOccupant);
  setBattlefieldSlotOccupant(nextState, target, sourceOccupant);
  nextState.cardInstances[sourceOccupant].controller = target.side;
  nextState.cardInstances[targetOccupant].controller = source.side;

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

function drawCardToHand(
  state: BattleMutableState,
  side: BattleSide,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const battleCardId = state.sides[side].deck[0];

  // Drawing from an empty deck causes Fatigue instead (rules §Fatigue): the
  // opponent scores the next term of the doubling sequence and the drawing
  // side's `fatigueCount` increments.
  if (battleCardId === undefined) {
    const nextState = cloneBattleMutableState(state);
    applyFatigueInPlace(nextState, side);
    return {
      state: nextState,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  nextState.sides[side].deck.shift();
  nextState.sides[side].hand.push(battleCardId);
  nextState.cardInstances[battleCardId].controller = side;

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

/**
 * Erode: moves the top `count` cards of `side`'s deck to its void (rules
 * §Erode). Each card the side cannot supply from its deck triggers Fatigue
 * instead (rules §Fatigue), awarding the opponent the doubling ⍟ sequence.
 */
function erodeDeck(
  state: BattleMutableState,
  side: BattleSide,
  count: number,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (count <= 0) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  for (let index = 0; index < count; index += 1) {
    const battleCardId = nextState.sides[side].deck[0];
    if (battleCardId === undefined) {
      applyFatigueInPlace(nextState, side);
      continue;
    }
    nextState.sides[side].deck.shift();
    nextState.sides[side].void.push(battleCardId);
    nextState.cardInstances[battleCardId].controller = side;
  }

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

/**
 * Applies a single Fatigue event to `side` in place (rules §Fatigue): the
 * opponent scores `2^fatigueCount` ⍟ and `side.fatigueCount` increments by one,
 * so the doubling sequence (1⍟, 2⍟, 4⍟, …) is reproducible across snapshots.
 */
function applyFatigueInPlace(
  state: BattleMutableState,
  side: BattleSide,
): void {
  const opponent: BattleSide = side === "player" ? "enemy" : "player";
  const sideState = state.sides[side];
  state.sides[opponent].score += 2 ** sideState.fatigueCount;
  sideState.fatigueCount += 1;
}

function discardHandCard(
  state: BattleMutableState,
  battleCardId: string,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const source = selectBattleCardLocation(state, battleCardId);

  if (source === null || source.zone !== "hand") {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  nextState.sides[source.side].hand.splice(source.index, 1);
  nextState.sides[source.side].void.push(battleCardId);
  nextState.cardInstances[battleCardId].controller = source.side;

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

/**
 * Abandon: voluntarily moves one of `battleCardId`'s controller's characters
 * from play to the void (rules §Abandon). Abandon applies only to a character
 * currently in the back or front rank; a target off the battlefield is a no-op.
 *
 * When the target is a figment stack of more than one member, only the topmost
 * figment is abandoned (rules §Abandon, §Figments): the top member is dropped
 * and the stack stays in play with its remaining members. A single-member
 * figment, or any other character, moves wholesale to its controller's void.
 */
function abandonCard(
  state: BattleMutableState,
  battleCardId: string,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const location = selectBattleCardLocation(state, battleCardId);
  const instance = state.cardInstances[battleCardId];
  if (
    location === null ||
    instance === undefined ||
    (location.zone !== "backRank" && location.zone !== "frontRank")
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  // A multi-member figment stack abandons only its topmost member, leaving the
  // rest of the stack in play.
  if (isFigmentInstance(instance) && selectFigmentCount(instance) > 1) {
    const nextState = cloneBattleMutableState(state);
    dissolveFigmentsFromStackInPlace(nextState, battleCardId, 1);
    return {
      state: nextState,
      transition: createEmptyTransitionData(),
    };
  }

  // Otherwise the whole character moves from play to its controller's void.
  return moveCardToDebugZone(state, battleCardId, {
    side: location.side,
    zone: "void",
  });
}

/**
 * Rematerialize: re-runs an in-play character's ▸Materialized resolution
 * manually (rules §Rematerialize). The keyword's actual effects are player
 * resolved through the debug rail, so this edit makes no structural change to
 * the battle state. It is a state no-op whose command envelope records the
 * intent in the battle log.
 */
function rematerializeCard(
  state: BattleMutableState,
  _battleCardId: string,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  return {
    state,
    transition: createEmptyTransitionData(),
  };
}

function kindleCard(
  state: BattleMutableState,
  side: BattleSide,
  amount: number,
  preferredBattleCardId: string | null,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (amount === 0) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const battleCardId = selectKindleTargetBattleCardId(state, side, preferredBattleCardId);

  if (battleCardId === null) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const nextState = cloneBattleMutableState(state);
  nextState.cardInstances[battleCardId].sparkDelta += amount;

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
}

// Spec §L-5 (bug-094): the design doc lists "target, oldValue, newValue,
// delta" as numeric-edit fields. The implementation emits domain-specific
// field names (`side` as the target, `previousScore`/`score` as oldValue /
// newValue, `delta` literal) so separate dashboards can read each axis
// without parsing a polymorphic payload. The semantic mapping is
// `target → side`, `oldValue → previousScore | previousCurrentEnergy |
// previousMaxEnergy`, `newValue → score | currentEnergy | maxEnergy`.
function createScoreChangeTransition(
  state: BattleMutableState,
  side: BattleSide,
  previousScore: number,
  score: number,
  context: BattleEngineEmissionContext,
): BattleTransitionData {
  return {
    ...createEmptyTransitionData(),
    scoreChanges: [
      {
        at: {
          side: state.activeSide,
          phase: state.phase,
        },
        side,
        previousScore,
        score,
        delta: score - previousScore,
      },
    ],
    logEvents: [
      {
        event: "battle_proto_score_changed",
        fields: {
          ...createBattleLogBaseFields(state, context),
          delta: score - previousScore,
          previousScore,
          score,
          side,
        },
      },
    ],
  };
}

function createEnergyChangeTransition(
  state: BattleMutableState,
  side: BattleSide,
  previousCurrentEnergy: number,
  currentEnergy: number,
  previousMaxEnergy: number,
  maxEnergy: number,
  context: BattleEngineEmissionContext,
): BattleTransitionData {
  const nextPhaseState = { ...state, phase: state.phase };
  return {
    ...createEmptyTransitionData(),
    energyChanges: [
      {
        at: {
          side: state.activeSide,
          phase: state.phase,
        },
        side,
        previousCurrentEnergy,
        currentEnergy,
        previousMaxEnergy,
        maxEnergy,
      },
    ],
    logEvents: [
      {
        event: "battle_proto_energy_changed",
        fields: {
          ...createBattleLogBaseFields(nextPhaseState, context),
          currentEnergy,
          currentEnergyDelta: currentEnergy - previousCurrentEnergy,
          maxEnergy,
          maxEnergyDelta: maxEnergy - previousMaxEnergy,
          previousCurrentEnergy,
          previousMaxEnergy,
          side,
        },
      },
    ],
  };
}

function isSameLocation(
  source: NonNullable<ReturnType<typeof selectBattleCardLocation>>,
  destination: Extract<BattleDebugEdit, { kind: "MOVE_CARD_TO_ZONE" }>["destination"],
  state: BattleMutableState,
): boolean {
  if ("slotId" in destination) {
    return (
      (source.zone === "backRank" || source.zone === "frontRank") &&
      source.side === destination.side &&
      source.zone === destination.zone &&
      source.slotId === destination.slotId
    );
  }

  if (destination.zone === "deck") {
    if (source.zone === "stack") {
      return false;
    }
    if (source.zone !== "deck" || source.side !== destination.side) {
      return false;
    }

    if (destination.position === "top") {
      return source.index === 0;
    }

    return source.index === state.sides[destination.side].deck.length - 1;
  }

  if (destination.zone === "stack") {
    // A card already on the stack stays put when re-targeted at the stack;
    // re-pushing would mint a duplicate entry. Side is irrelevant — the stack
    // is a single shared pile.
    return source.zone === "stack";
  }

  return source.side === destination.side && source.zone === destination.zone;
}

function removeBattleCardFromLocation(
  state: BattleMutableState,
  source: NonNullable<ReturnType<typeof selectBattleCardLocation>>,
): void {
  switch (source.zone) {
    case "hand":
    case "deck":
    case "void":
    case "banished":
      state.sides[source.side][source.zone].splice(source.index, 1);
      return;
    case "stack":
      state.stack?.splice(source.index, 1);
      return;
    case "backRank":
    case "frontRank":
      setBattlefieldSlotOccupant(
        state,
        {
          side: source.side,
          zone: source.zone,
          slotId: source.slotId,
        },
        null,
      );
      return;
  }
}

function insertBattleCardAtDebugDestination(
  state: BattleMutableState,
  battleCardId: string,
  destination: BattleDebugZoneDestination,
): void {
  if ("slotId" in destination) {
    setBattlefieldSlotOccupant(state, destination, battleCardId);
    return;
  }

  if (destination.zone === "deck") {
    if (destination.position === "top") {
      state.sides[destination.side].deck.unshift(battleCardId);
      return;
    }

    state.sides[destination.side].deck.push(battleCardId);
    return;
  }

  if (destination.zone === "stack") {
    const stackEntryId = allocateBattleStackEntryId(state);
    state.stack ??= [];
    state.stack.push({
      stackEntryId,
      battleCardId,
      side: destination.side,
      paidCost: 0,
    });
    return;
  }

  state.sides[destination.side][destination.zone].push(battleCardId);
}

function setBattlefieldSlotOccupant(
  state: BattleMutableState,
  target: BattleFieldSlotAddress,
  battleCardId: string | null,
): void {
  if (target.zone === "backRank") {
    state.sides[target.side].backRank[target.slotId as (typeof BACK_RANK_SLOT_IDS)[number]] = battleCardId;
    return;
  }

  state.sides[target.side].frontRank[target.slotId as (typeof FRONT_RANK_SLOT_IDS)[number]] = battleCardId;
}

// `createEmptyTransitionData` imported from ../engine/result (bug-015).
