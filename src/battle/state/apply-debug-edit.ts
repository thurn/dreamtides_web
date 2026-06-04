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
  BattleCardMarkers,
  BattleCardNote,
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleEngineEmissionContext,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleResult,
  BattleSide,
  BattleTransitionData,
} from "../types";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";
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
  findBattlefieldFigmentStack,
  isFigmentInstance,
  selectFigmentCount,
} from "./figments";

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
    case "DISCARD_CARD":
      return discardHandCard(state, edit.battleCardId);
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
  if ("slotId" in destination) {
    const existingStack = findBattlefieldFigmentStack(
      nextState,
      destination.side,
      chosenSubtype,
    );
    if (existingStack !== null) {
      addFigmentsToStackInPlace(nextState, existingStack.battleCardId, 1);
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
                figmentCount: stack?.figmentCount ?? 1,
                name: stack?.definition.name ?? name,
                ownerSide: side,
                printedSpark: stack?.definition.printedSpark ?? chosenSpark,
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
    printedSpark: chosenSpark,
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
    chosenSpark,
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
            figmentCount: nextState.cardInstances[battleCardId].figmentCount ?? 1,
            name,
            ownerSide: side,
            printedSpark: chosenSpark,
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

  const nextState = cloneBattleMutableState(state);
  removeBattleCardFromLocation(nextState, source);
  if (destinationStack !== null) {
    addFigmentsToStackInPlace(
      nextState,
      destinationStack.battleCardId,
      selectFigmentCount(sourceInstance),
    );
    delete nextState.cardInstances[battleCardId];
  } else if (
    destinationOccupant !== null &&
    canMergeFigments(sourceInstance, state.cardInstances[destinationOccupant])
  ) {
    addFigmentsToStackInPlace(
      nextState,
      destinationOccupant,
      selectFigmentCount(sourceInstance),
    );
    delete nextState.cardInstances[battleCardId];
  } else {
    insertBattleCardAtDebugDestination(nextState, battleCardId, destination);
    nextState.cardInstances[battleCardId].controller = destination.side;
  }

  return {
    state: nextState,
    transition: createEmptyTransitionData(),
  };
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

  if (battleCardId === undefined) {
    return {
      state,
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
      (source.zone === "reserve" || source.zone === "deployed") &&
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
    case "reserve":
    case "deployed":
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
  if (target.zone === "reserve") {
    state.sides[target.side].reserve[target.slotId as (typeof RESERVE_SLOT_IDS)[number]] = battleCardId;
    return;
  }

  state.sides[target.side].deployed[target.slotId as (typeof DEPLOY_SLOT_IDS)[number]] = battleCardId;
}

// `createEmptyTransitionData` imported from ../engine/result (bug-015).
