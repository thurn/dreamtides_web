import type { BattleDebugEdit, BattleDebugZoneDestination } from "../../battle/debug/commands";
import {
  createBattleResultChangedLogFields,
  createEmptyTransitionData,
  createFlowStep,
} from "../../battle/engine/result";
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
} from "../../battle/types";
import {
  backRankSlotId,
  ensureContiguousRankSlots,
  frontRankSlotId,
  rankSlotIds,
} from "../../battle/types";
import {
  allocateBattleCardInstance,
  cloneBattleDeckCardDefinition,
  cloneBattleMutableState,
} from "../../battle/state/create-initial-state";
import { diffMarkerValue } from "../../battle/state/markers-utils";
import {
  isBattleFieldSlotAddressValid,
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectDefaultCharacterPlaySlot,
  selectKindleTargetBattleCardId,
} from "../../battle/state/selectors";
import {
  addFigmentsToStackInPlace,
  canMergeFigments,
  dissolveFigmentsFromStackInPlace,
  findBattlefieldFigmentStack,
  isFigmentInstance,
  mergeFigmentsIntoStackInPlace,
  selectFigmentCount,
  selectFigmentSparks,
} from "../../battle/state/figments";
import { lookupFigmentCatalogEntry, type FigmentKeyword } from "../../battle/state/figment-catalog";

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
    case "SET_CARD_STATIC_SPARK_BONUS":
      if (nextState.cardInstances[edit.battleCardId]?.staticSparkBonus === undefined) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      if (nextState.cardInstances[edit.battleCardId].staticSparkBonus === edit.value) {
        return {
          state,
          transition: createEmptyTransitionData(),
        };
      }
      nextState.cardInstances[edit.battleCardId].staticSparkBonus = edit.value;
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
    case "DRAW_DREAMWELL_CARD":
      return drawDreamwellCard(state, edit.side, edit.turnNumber, edit.additional ?? false);
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
    case "ADD_FIGMENTS":
      return addFigmentsToCard(state, nextState, edit.battleCardId, edit.count);
    case "CREATE_CARD_FROM_DEFINITION":
      return createCardFromDefinition(
        state,
        nextState,
        edit.definition,
        edit.destination,
        edit.createdAtMs,
        context,
      );
    case "FILL_BATTLEFIELD_PREVIEW":
      return fillBattlefieldPreview(
        state,
        edit.definitions,
        edit.createdAtMs,
        context,
      );
    case "REORDER_DECK":
      return reorderDeck(state, nextState, edit.side, edit.order, context);
    case "FORESEE":
      return resolveForesee(
        state,
        nextState,
        edit.side,
        edit.viewedCardIds,
        edit.orderedCardIds,
        edit.voidCardIds,
        context,
      );
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

function resolveForesee(
  state: BattleMutableState,
  nextState: BattleMutableState,
  side: BattleSide,
  viewedCardIds: readonly string[],
  orderedCardIds: readonly string[],
  voidCardIds: readonly string[],
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const deckBefore = state.sides[side].deck;
  const viewedCount = viewedCardIds.length;
  const livePrefix = deckBefore.slice(0, viewedCount);
  const resolvedIds = [...orderedCardIds, ...voidCardIds];

  if (
    viewedCount === 0 ||
    !isSameOrder(livePrefix, viewedCardIds) ||
    !isDeckPermutation(viewedCardIds, resolvedIds)
  ) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const deckAfter = [...orderedCardIds, ...deckBefore.slice(viewedCount)];
  nextState.sides[side].deck = deckAfter;
  nextState.sides[side].void = [
    ...nextState.sides[side].void,
    ...voidCardIds,
  ];

  for (const battleCardId of viewedCardIds) {
    const instance = nextState.cardInstances[battleCardId];
    if (instance !== undefined) {
      instance.isRevealedToPlayer = true;
    }
  }

  const cardUuids = (battleCardIds: readonly string[]): string[] =>
    battleCardIds.map(
      (battleCardId) => nextState.cardInstances[battleCardId]?.definition.cardId ?? "",
    );

  return {
    state: nextState,
    transition: {
      ...createEmptyTransitionData(),
      logEvents: [
        {
          event: "battle_proto_foresee_resolved",
          fields: {
            ...createBattleLogBaseFields(nextState, context),
            side,
            viewedCardIds: [...viewedCardIds],
            viewedCardUuids: cardUuids(viewedCardIds),
            orderedCardIds: [...orderedCardIds],
            orderedCardUuids: cardUuids(orderedCardIds),
            voidCardIds: [...voidCardIds],
            voidCardUuids: cardUuids(voidCardIds),
            deckOrderBefore: [...deckBefore],
            deckOrderAfter: deckAfter,
          },
        },
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
      // The reserve has no upper bound, so a retreat always finds a slot.
      const retreatSlot = selectFirstOpenBackRankSlot(nextState, location.side);
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
 * Returns the first open back-rank slot address on `side`, scanning materialized
 * reserve slots left to right. When every materialized reserve is occupied it
 * grows the back rank with a fresh slot rather than blocking the play, so the
 * reserve has no upper bound.
 */
function selectFirstOpenBackRankSlot(
  state: BattleMutableState,
  side: BattleSide,
): BattleFieldSlotAddress {
  const { backRank } = state.sides[side];
  for (const slotId of rankSlotIds(backRank)) {
    if (backRank[slotId] === null) {
      return { side, zone: "backRank", slotId };
    }
  }
  return { side, zone: "backRank", slotId: backRankSlotId(rankSlotIds(backRank).length) };
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
    // Synthetic generated figment with no catalog card; never registered for
    // automation, so an empty UUID is correct here.
    cardId: "",
    cardNumber: 0,
    name,
    battleCardKind: "character",
    subtype: chosenSubtype,
    energyCost: 0,
    printedEnergyCost: 0,
    printedSpark: resolvedSpark,
    isFast: false,
    reclaimCost: null,
    // Rules text and art are sourced from the figment catalog (figments.toml via
    // the figment editor) so a created figment renders the type's authored
    // description and image; an un-hydrated catalog falls back to no text/art.
    renderedText: catalogEntry?.renderedText ?? "",
    imageNumber: catalogEntry?.imageNumber ?? 0,
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

  // A figment materialized into the back rank enters exhausted unless it is
  // Awakened, matching the rule that a created character enters the back rank
  // exhausted (rules §Exhaust and Awaken, §Figments). Without this, a figment
  // created mid-turn — e.g. Foxfire Thicket's dreamwell ability spawning an
  // Ethereal Figment — could be repositioned to the front rank and declared as
  // a challenger on the same turn, which is an illegal play.
  const materializedFigment = nextState.cardInstances[battleCardId];
  if (
    materializedFigment !== undefined &&
    "slotId" in destination &&
    destination.zone === "backRank" &&
    !materializedFigment.status.grantedAwakened
  ) {
    materializedFigment.status.isExhausted = true;
  }

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
 * Stamps a figment type's inherent keyword onto the new instance's status. Each
 * figment keyword maps onto the matching combat-keyword `granted*` flag.
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
    case "awakened":
      instance.status.grantedAwakened = true;
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

function fillBattlefieldPreview(
  state: BattleMutableState,
  definitions: Record<BattleSide, readonly BattleDeckCardDefinition[]>,
  createdAtMs: number,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const playerLayout = battlefieldPreviewLayout(definitions.player.length);
  const enemyLayout = battlefieldPreviewLayout(definitions.enemy.length);
  if (
    playerLayout === null ||
    enemyLayout === null ||
    [...definitions.player, ...definitions.enemy].some(
      (definition) => definition.battleCardKind !== "character",
    )
  ) {
    return { state, transition: createEmptyTransitionData() };
  }
  const layouts = { player: playerLayout, enemy: enemyLayout };

  let current = state;
  const logEvents: BattleTransitionData["logEvents"] = [];
  for (const side of ["player", "enemy"] as const) {
    for (const zone of ["frontRank", "backRank"] as const) {
      for (const battleCardId of Object.values(current.sides[side][zone])) {
        if (battleCardId === null) continue;
        current = moveCardToDebugZone(current, battleCardId, {
          side,
          zone: "void",
        }).state;
      }
    }
  }

  for (const side of ["player", "enemy"] as const) {
    const layout = layouts[side];
    const destinations = [
      ...Array.from({ length: layout.frontRank }, (_, index) => ({
        side,
        zone: "frontRank" as const,
        slotId: frontRankSlotId(index),
      })),
      ...Array.from({ length: layout.backRank }, (_, index) => ({
        side,
        zone: "backRank" as const,
        slotId: backRankSlotId(index),
      })),
      ...Array.from({ length: layout.void }, () => ({
        side,
        zone: "void" as const,
      })),
    ];
    for (let index = 0; index < destinations.length; index += 1) {
      const result = createCardFromDefinition(
        current,
        cloneBattleMutableState(current),
        definitions[side][index],
        destinations[index],
        createdAtMs,
        context,
      );
      current = result.state;
      logEvents.push(...result.transition.logEvents);
    }
  }

  return {
    state: current,
    transition: {
      ...createEmptyTransitionData(),
      logEvents,
    },
  };
}

function battlefieldPreviewLayout(definitionCount: number): {
  frontRank: number;
  backRank: number;
  void: number;
} | null {
  if (definitionCount === 9) {
    return { frontRank: 4, backRank: 5, void: 0 };
  }
  if (definitionCount === 14) {
    return { frontRank: 4, backRank: 5, void: 5 };
  }
  if (definitionCount === 25) {
    return { frontRank: 10, backRank: 10, void: 5 };
  }
  return null;
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

  // Dissolving a figment stack to the void removes only its topmost figment
  // (rules §Figments — Challenge resolution, Removal). A multi-member stack
  // stays in play with its remaining figments; a single-member stack falls
  // through to the normal void move below.
  if (
    !("slotId" in destination) &&
    destination.zone === "void" &&
    isFigmentInstance(sourceInstance) &&
    selectFigmentCount(sourceInstance) > 1
  ) {
    const nextState = cloneBattleMutableState(state);
    dissolveFigmentsFromStackInPlace(nextState, battleCardId, 1);
    return {
      state: nextState,
      transition: createEmptyTransitionData(),
    };
  }

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
 * Reveals `side`'s next Dreamwell card (rules §The Dreamwell and Energy): points
 * the side's `dreamwellCardIndex` at the shared deck's current draw position,
 * stamps `dreamwellDrawnTurn` so the per-turn reveal fires once, and advances the
 * shared `dreamwellDeckIndex`. The maximum-● gain the card grants is applied by
 * basic automation (which reads the drawn card's `energyAdded`), keeping this
 * edit a pure reveal. The card definition is read from `BattleInit.dreamwellDeck`
 * at the recorded index by the display and automation layers.
 *
 * The mandatory per-turn reveal is idempotent: when `side` has already drawn for
 * `turnNumber` (`dreamwellDrawnTurn === turnNumber`) and this is not an explicit
 * additional draw, it returns the original state unchanged so the shared deck
 * index advances exactly once per turn. The per-turn reveal effect runs on every
 * connected client and can re-fire on a remount, so a relative `+1` advance
 * would otherwise gallop the index forward once per dispatch (the coop +2/draw
 * bug). Returning the same `state` reference makes the controller — and the coop
 * room transaction — treat the duplicate as a no-op. `additional` is the
 * "draw an additional Dreamwell card" path (Lily Lake): it skips the guard and
 * always consumes the next card.
 *
 * The reveal is logged deck-aware (with `order`/name/`energyAdded`) at the
 * dispatch sites via `battle_proto_dreamwell_card_revealed`; this pure reducer
 * step does not log, because under basic automation it is the first of an
 * expanded command batch (reveal then energy edits) and only the batch's final
 * transition is emitted, so a log here would be shadowed.
 */
function drawDreamwellCard(
  state: BattleMutableState,
  side: BattleSide,
  turnNumber: number,
  additional: boolean,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (!additional && state.sides[side].dreamwellDrawnTurn === turnNumber) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }
  const nextState = cloneBattleMutableState(state);
  const drawIndex = nextState.dreamwellDeckIndex;
  nextState.sides[side].dreamwellCardIndex = drawIndex;
  nextState.sides[side].dreamwellDrawnTurn = turnNumber;
  nextState.dreamwellDeckIndex = drawIndex + 1;
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

/**
 * Adds `count` members to an existing figment stack. New members enter at the
 * stack's base spark — the figment type's catalog spark when known, otherwise
 * the current top member's spark, falling back to the printed spark. A no-op for
 * any target that is not a figment stack.
 */
function addFigmentsToCard(
  state: BattleMutableState,
  nextState: BattleMutableState,
  battleCardId: string,
  count: number,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const stack = nextState.cardInstances[battleCardId];
  if (!isFigmentInstance(stack) || count <= 0) {
    return {
      state,
      transition: createEmptyTransitionData(),
    };
  }

  const catalogEntry = lookupFigmentCatalogEntry(stack.definition.subtype);
  const baseSpark = catalogEntry?.baseSpark
    ?? selectFigmentSparks(stack)[0]
    ?? stack.definition.printedSpark;
  addFigmentsToStackInPlace(nextState, battleCardId, count, baseSpark);

  return {
    state: nextState,
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
    if (source.zone !== "deck" || source.side !== destination.side) {
      return false;
    }

    if (destination.position === "top") {
      return source.index === 0;
    }

    return source.index === state.sides[destination.side].deck.length - 1;
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

  state.sides[destination.side][destination.zone].push(battleCardId);
}

function setBattlefieldSlotOccupant(
  state: BattleMutableState,
  target: BattleFieldSlotAddress,
  battleCardId: string | null,
): void {
  if (target.zone === "backRank") {
    const backRank = state.sides[target.side].backRank;
    const slotId = target.slotId as keyof typeof backRank;
    ensureContiguousRankSlots(backRank, slotId);
    backRank[slotId] = battleCardId;
    return;
  }

  const frontRank = state.sides[target.side].frontRank;
  const slotId = target.slotId as keyof typeof frontRank;
  ensureContiguousRankSlots(frontRank, slotId);
  frontRank[slotId] = battleCardId;
}

// `createEmptyTransitionData` imported from ../engine/result (bug-015).
