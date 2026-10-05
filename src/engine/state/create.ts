import { BATTLE } from "../../content/battle";
import { emptyTurnLog } from "../rules/turn-log";
import type { EngineCatalog } from "../catalog";
import type { InstanceId, Side } from "./ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES } from "./ids";
import type { BattleConfig, BattleInit, BattleState, CardInstance, SideState } from "./types";

function emptySide(): SideState {
  return {
    score: 0,
    currentEnergy: 0,
    maxEnergy: 0,
    fatigueCount: 0,
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: Array.from({ length: BACK_RANK_SIZE }, () => null),
    frontRank: Array.from({ length: FRONT_RANK_SIZE }, () => null),
    avatar: null,
    dreamsigns: [],
  };
}

export function battleConfig(init: BattleInit): BattleConfig {
  const startingSide: Side = init.startingSide ?? (BATTLE.startingSide === "enemy" ? "enemy" : "player");
  return {
    scoreToWin: init.scoreToWin,
    turnLimit: BATTLE.turnLimit,
    handLimit: BATTLE.handLimit,
    openingHandSize: {
      player: BATTLE.playerOpeningHandSize,
      enemy: BATTLE.enemyOpeningHandSize,
    },
    startingSide,
    skipFirstDraw: BATTLE.skipPlayerOpeningDraw,
    resolutionCap: BATTLE.resolutionCap,
  };
}

/**
 * The state before the battle begins: both decks as instances in deck
 * order, nothing shuffled or dealt. The `beginBattle` step does the rest.
 */
export function initialState(init: BattleInit, catalog: EngineCatalog): BattleState {
  const config = battleConfig(init);
  const state: BattleState = {
    version: 0,
    seed: init.seed,
    rng: {},
    nextInstance: 1,
    clock: 0,
    config,
    turn: {
      round: 1,
      turnNumber: 0,
      active: config.startingSide,
      phase: "dreamwell",
      sideTurns: { player: 0, enemy: 0 },
      extra: false,
      lastNormal: config.startingSide,
      extraTurns: [],
      challengeLane: null,
    },
    sides: { player: emptySide(), enemy: emptySide() },
    instances: {},
    stack: [],
    priority: null,
    payable: [],
    triggerQueue: [],
    floating: [],
    turnLog: emptyTurnLog(),
    nextEffect: 1,
    oncePerTurn: [],
    dreamwell: { deck: [], next: 0, catalog: [] },
    challenge: null,
    automaticSteps: 0,
    result: null,
  };
  for (const side of SIDES) {
    const avatar = init.avatars?.[side];
    if (avatar !== undefined) {
      catalog.avatar(avatar);
      state.sides[side].avatar = { id: avatar, exhausted: false };
    }
    for (const dreamsign of init.dreamsigns?.[side] ?? []) {
      catalog.dreamsign(dreamsign);
      state.sides[side].dreamsigns.push({ id: dreamsign });
    }
    for (const entry of init.decks[side]) {
      catalog.card(entry.cardId);
      const id: InstanceId = `i${state.nextInstance}`;
      state.nextInstance += 1;
      const instance: CardInstance = {
        id,
        cardId: entry.cardId,
        owner: side,
        controller: side,
        zone: "deck",
        variant: { amplified: entry.amplified === true },
        status: { exhausted: false, gainedSpark: 0, counters: 0, created: false, reclaimed: false, x: null },
        enteredZoneAt: 0,
      };
      state.instances[id] = instance;
      state.sides[side].deck.push(id);
    }
  }
  return state;
}
