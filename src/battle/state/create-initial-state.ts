import type {
  BattleCardInstance,
  BattleCardProvenance,
  BattleCardStatus,
  BattleDeckCardDefinition,
  BattleInit,
  BattleMutableState,
  BattleSide,
  BattleSideMutableState,
  FrontRankSlotId,
  BackRankSlotId,
} from "../types";

/**
 * Default per-card status: every flag false and every numeric counter zero. A
 * fresh object is returned on each call so card instances never alias a shared
 * status (which would corrupt undo via history-snapshot aliasing).
 */
export function createDefaultBattleCardStatus(): BattleCardStatus {
  return {
    isExhausted: false,
    counters: 0,
    reclaimed: false,
    offering: false,
    ephemeral: false,
    veil: 0,
    grantedUnstoppable: false,
    grantedVengeful: false,
    grantedPreeminence: false,
    grantedAwakened: false,
  };
}

export function createInitialBattleState(battleInit: BattleInit): BattleMutableState {
  const state: BattleMutableState = {
    battleId: battleInit.battleId,
    activeSide: "player",
    turnNumber: 1,
    // The battle opens on the active player's Dreamwell phase: their first
    // (order-0) Dreamwell card animates in and is clicked through before the
    // first Day (rules §The Dreamwell and Energy).
    phase: "dreamwell",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
    sides: {
      // Energy starts at 0 for both sides; each side's maximum ● is raised by
      // the Dreamwell cards it draws (rules §The Dreamwell and Energy). The
      // active player's opening Dreamwell card is revealed (and its energy
      // applied under basic automation) when the Dreamwell phase resolves.
      player: createInitialSideState(0, 0, [], []),
      enemy: createInitialSideState(0, 0, [], []),
    },
    cardInstances: {},
  };
  const playerDeckCardIds = battleInit.playerDeckOrder.map((definition) =>
    createBattleCardInstance(state, definition, "player", true),
  );
  const enemyDeckCardIds = battleInit.enemyDeckDefinition.map((definition) =>
    createBattleCardInstance(state, definition, "enemy", false),
  );
  const openingHandSize = Math.max(0, battleInit.openingHandSize);
  const playerOpeningHand = playerDeckCardIds.slice(0, openingHandSize);
  const enemyOpeningHand = enemyDeckCardIds.slice(0, openingHandSize);
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
    dreamwellDeckIndex: state.dreamwellDeckIndex,
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
              ...(instance.figments === undefined ? {} : { figments: [...instance.figments] }),
              status: { ...instance.status },
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
    ...(params.provenance.kind === "generated-figment"
      ? { figments: [params.definition.printedSpark] }
      : {}),
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: params.isRevealedToPlayer,
    status: createDefaultBattleCardStatus(),
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
  };
}

function cloneBattleSideMutableState(side: BattleSideMutableState): BattleSideMutableState {
  return {
    ...side,
    visibility: { ...side.visibility },
    deck: [...side.deck],
    hand: [...side.hand],
    void: [...side.void],
    banished: [...side.banished],
    backRank: { ...side.backRank },
    frontRank: { ...side.frontRank },
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
    visibility: {},
    deck,
    hand,
    void: [],
    banished: [],
    backRank: createEmptyBackRank(),
    frontRank: createEmptyFrontRank(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function createEmptyBackRank(): Record<BackRankSlotId, string | null> {
  // bug-036: literal object is type-safe without the unsound `as Record<...>`
  // cast; the compiler proves all five keys exist.
  return { B0: null, B1: null, B2: null, B3: null, B4: null };
}

function createEmptyFrontRank(): Record<FrontRankSlotId, string | null> {
  return { F0: null, F1: null, F2: null, F3: null };
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
