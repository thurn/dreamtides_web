import {
  MIN_BACK_RANK_SLOTS,
  MIN_FRONT_RANK_SLOTS,
  backRankSlotIds,
  createEmptySlotRecord,
  frontRankSlotIds,
} from "../types";
import {
  createControllerVisibility,
  normalizeCardVisibility,
} from "./card-visibility";
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
    veil: false,
    grantedUnstoppable: false,
    grantedVengeful: false,
    grantedPreeminence: false,
    grantedAwakened: false,
    temporaryReclaimUntilEnding: null,
    temporaryBanishUntilEnding: null,
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
    createBattleCardInstance(state, definition, "player"),
  );
  const enemyDeckCardIds = battleInit.enemyDeckDefinition.map((definition) =>
    createBattleCardInstance(state, definition, "enemy"),
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
          const cloned: BattleCardInstance = {
            ...instance,
            definition: cloneBattleDeckCardDefinition(instance.definition),
            ...(instance.figments === undefined ? {} : { figments: [...instance.figments] }),
            // Persisted pre-automation battles omit the temporary-effect
            // fields. Normalize them while cloning the replay/load boundary.
            status: { ...createDefaultBattleCardStatus(), ...instance.status },
            markers: { ...instance.markers },
            notes: instance.notes.map((note) => ({
              ...note,
              expiry: { ...note.expiry },
            })),
            provenance: { ...instance.provenance },
          };
          normalizeCardVisibility(cloned);
          return [battleCardId, cloned];
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
    isRevealedToPlayer?: boolean;
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
    revealedTo:
      params.isRevealedToPlayer === undefined
        ? createControllerVisibility(params.controller)
        : {
            player: params.isRevealedToPlayer,
            enemy: params.controller === "enemy",
          },
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
): string {
  return allocateBattleCardInstance(state, {
    definition,
    owner,
    controller: owner,
    provenance: {
      kind: "journey-deck",
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
  return createEmptySlotRecord(backRankSlotIds(MIN_BACK_RANK_SLOTS));
}

function createEmptyFrontRank(): Record<FrontRankSlotId, string | null> {
  return createEmptySlotRecord(frontRankSlotIds(MIN_FRONT_RANK_SLOTS));
}

export function formatBattleCardId(ordinal: number): string {
  return `bc_${String(ordinal).padStart(4, "0")}`;
}
