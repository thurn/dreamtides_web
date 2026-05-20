import type {
  BattleCardInstance,
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleInit,
  BattleMutableState,
  BattleSide,
  BattleSideMutableState,
  DeploySlotId,
  ReserveSlotId,
} from "../types";

const OPENING_ENERGY = 2;
const INITIAL_EXHAUSTION_PENALTY = 5;

export function createInitialBattleState(battleInit: BattleInit): BattleMutableState {
  const state: BattleMutableState = {
    battleId: battleInit.battleId,
    activeSide: "player",
    turnNumber: 1,
    phase: "day",
    result: null,
    forcedResult: null,
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
    sides: {
      player: createInitialSideState(OPENING_ENERGY, OPENING_ENERGY, [], []),
      enemy: createInitialSideState(OPENING_ENERGY, OPENING_ENERGY, [], []),
    },
    cardInstances: {},
  };
  const playerDeckCardIds = battleInit.playerDeckOrder.map((definition) =>
    createBattleCardInstance(state, definition, "player", true),
  );
  const enemyDeckCardIds = battleInit.enemyDeckDefinition.map((definition) =>
    createBattleCardInstance(state, definition, "enemy", false),
  );
  const startingHandSize = Math.max(0, battleInit.openingHandSize - 1);
  const playerOpeningHandSize = battleInit.startingSide === "player"
    ? startingHandSize
    : battleInit.openingHandSize;
  const enemyOpeningHandSize = battleInit.startingSide === "enemy"
    ? startingHandSize
    : battleInit.openingHandSize;
  const playerOpeningHand = playerDeckCardIds.slice(0, playerOpeningHandSize);
  const enemyOpeningHand = enemyDeckCardIds.slice(0, enemyOpeningHandSize);
  state.sides.player.hand = playerOpeningHand;
  state.sides.player.deck = playerDeckCardIds.slice(playerOpeningHand.length);
  state.sides.enemy.hand = enemyOpeningHand;
  state.sides.enemy.deck = enemyDeckCardIds.slice(enemyOpeningHand.length);
  return state;
}

export function cloneBattleMutableState(state: BattleMutableState): BattleMutableState {
  return {
    battleId: state.battleId,
    activeSide: state.activeSide,
    turnNumber: state.turnNumber,
    phase: state.phase,
    result: state.result,
    forcedResult: state.forcedResult,
    nextBattleCardOrdinal: state.nextBattleCardOrdinal,
    nextStackEntryOrdinal: state.nextStackEntryOrdinal ?? 1,
    stack: (state.stack ?? []).map((entry) => ({ ...entry })),
    sides: {
      player: cloneBattleSideMutableState(state.sides.player),
      enemy: cloneBattleSideMutableState(state.sides.enemy),
    },
    // Sort keys during clone so the post-clone iteration order is
    // deterministic regardless of the source state's insertion history
    // (bug-042). `bc_NNNN` ids sort lexicographically into ordinal order.
    cardInstances: Object.fromEntries(
      Object.keys(state.cardInstances)
        .sort()
        .map((battleCardId) => {
          const instance = state.cardInstances[battleCardId];
          return [
            battleCardId,
            {
              ...instance,
              definition: cloneBattleDeckCardDefinition(instance.definition),
              markers: { ...instance.markers },
              notes: instance.notes.map((note) => ({
                ...note,
                expiry: { ...note.expiry },
              })),
              provenance: { ...instance.provenance },
            },
          ];
        }),
    ),
  };
}

export function allocateBattleCardId(state: BattleMutableState): string {
  const battleCardId = formatBattleCardId(state.nextBattleCardOrdinal);
  state.nextBattleCardOrdinal += 1;
  return battleCardId;
}

export function allocateBattleCardInstance(
  state: BattleMutableState,
  params: {
    definition: BattleDeckCardDefinition;
    owner: BattleSide;
    controller: BattleSide;
    isRevealedToPlayer: boolean;
    provenance: BattleCardProvenance;
  },
): string {
  const battleCardId = allocateBattleCardId(state);
  state.cardInstances[battleCardId] = {
    battleCardId,
    definition: params.definition,
    owner: params.owner,
    controller: params.controller,
    ...(params.provenance.kind === "generated-figment" ? { figmentCount: 1 } : {}),
    sparkDelta: 0,
    isRevealedToPlayer: params.isRevealedToPlayer,
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: params.provenance,
  };
  return battleCardId;
}

function createBattleCardInstance(
  state: BattleMutableState,
  definition: BattleDeckCardDefinition,
  owner: BattleSide,
  isRevealedToPlayer: boolean,
): string {
  return allocateBattleCardInstance(state, {
    definition,
    owner,
    controller: owner,
    isRevealedToPlayer,
    provenance: {
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  });
}

export function cloneBattleDeckCardDefinition(
  definition: BattleCardInstance["definition"],
): BattleCardInstance["definition"] {
  return {
    ...definition,
    tides: [...definition.tides],
  };
}

function cloneBattleSideMutableState(side: BattleSideMutableState): BattleSideMutableState {
  return {
    ...side,
    exhaustionPenaltyNext: side.exhaustionPenaltyNext ?? INITIAL_EXHAUSTION_PENALTY,
    exhaustionPenaltyAppliedThisTurn: side.exhaustionPenaltyAppliedThisTurn ?? false,
    visibility: { ...side.visibility },
    deck: [...side.deck],
    hand: [...side.hand],
    void: [...side.void],
    banished: [...side.banished],
    reserve: { ...side.reserve },
    deployed: { ...side.deployed },
  };
}

function createInitialSideState(
  currentEnergy: number,
  maxEnergy: number,
  deck: string[],
  hand: string[],
): BattleSideMutableState {
  return {
    currentEnergy,
    maxEnergy,
    score: 0,
    pendingExtraTurns: 0,
    exhaustionPenaltyNext: INITIAL_EXHAUSTION_PENALTY,
    exhaustionPenaltyAppliedThisTurn: false,
    visibility: {},
    deck,
    hand,
    void: [],
    banished: [],
    reserve: createEmptyReserve(),
    deployed: createEmptyDeployed(),
  };
}

function createEmptyReserve(): Record<ReserveSlotId, string | null> {
  // bug-036: literal object is type-safe without the unsound `as Record<...>`
  // cast; the compiler proves all five keys exist.
  return { R0: null, R1: null, R2: null, R3: null, R4: null };
}

function createEmptyDeployed(): Record<DeploySlotId, string | null> {
  return { D0: null, D1: null, D2: null, D3: null };
}

export function formatBattleCardId(ordinal: number): string {
  return `bc_${String(ordinal).padStart(4, "0")}`;
}

export function allocateBattleStackEntryId(state: BattleMutableState): string {
  const ordinal = state.nextStackEntryOrdinal ?? 1;
  const stackEntryId = `stack_${String(ordinal).padStart(4, "0")}`;
  state.nextStackEntryOrdinal = ordinal + 1;
  return stackEntryId;
}
