import { BATTLE } from "../../content/battle";
import { DREAMWELL_RULES } from "../../content/dreamwell-rules";
import { emptyLoopTracker } from "../loops/types";
import { emptyTurnLog } from "../rules/turn-log";
import type { EngineCatalog } from "../catalog";
import { NO_DECK_MODS, type Variant } from "../dsl/types";
import type { InstanceId, Side } from "./ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES } from "./ids";
import type { BattleConfig, BattleInit, BattleState, CardInstance, CardStatus, DeckEntry, SideState } from "./types";

/** The status of a card new to the battle: ready, unchanged, and not created unless `created`. */
export function freshStatus(created = false): CardStatus {
  return { exhausted: false, gainedSpark: 0, counters: 0, created, reclaimed: false, offering: false, ephemeral: false, x: null };
}

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

/**
 * The variant a deck entry is played as. An entry without transfigurations
 * or deck modifications plays the plain `{ amplified }` variant.
 */
export function variantOf(entry: DeckEntry): Variant {
  const amplified = entry.amplified === true;
  const transfigurations = entry.transfigurations ?? [];
  const deckMods = entry.deckMods ?? NO_DECK_MODS;
  const modified =
    deckMods.sparkBonus !== 0 ||
    deckMods.costReduction !== 0 ||
    deckMods.fast ||
    deckMods.reclaim !== null ||
    deckMods.typeChange !== null;
  if (transfigurations.length === 0 && !modified) return { amplified };
  return {
    amplified,
    transfigurations: [...transfigurations],
    deckMods: { ...deckMods, typeChange: deckMods.typeChange === null ? null : { ...deckMods.typeChange } },
  };
}

/** The total of one next-battle number over a side's smaller-hand-and-cost-discount effects. */
function discountTotal(init: BattleInit, side: Side, field: "openingHandDelta" | "costReduction"): number {
  return (init.nextBattle?.[side]?.smallerHandAndCostDiscount ?? []).reduce((total, effect) => total + effect[field], 0);
}

/**
 * A side's deck as the battle deals it: each entry with the cost reduction of
 * the side's next-battle cost discounts added to its deck modifications.
 * Determinization reads the dealt decks as the known decklists (D22).
 */
export function dealtDeck(init: BattleInit, side: Side): DeckEntry[] {
  const discount = discountTotal(init, side, "costReduction");
  return init.decks[side].map((entry) =>
    discount === 0
      ? entry
      : { ...entry, deckMods: { ...(entry.deckMods ?? NO_DECK_MODS), costReduction: (entry.deckMods?.costReduction ?? 0) + discount } },
  );
}

export function battleConfig(init: BattleInit): BattleConfig {
  const startingSide: Side = init.startingSide ?? (BATTLE.startingSide === "enemy" ? "enemy" : "player");
  return {
    scoreToWin: init.scoreToWin,
    turnLimit: BATTLE.turnLimit,
    handLimit: BATTLE.handLimit,
    openingHandSize: {
      player: Math.max(0, BATTLE.playerOpeningHandSize + discountTotal(init, "player", "openingHandDelta")),
      enemy: Math.max(0, BATTLE.enemyOpeningHandSize + discountTotal(init, "enemy", "openingHandDelta")),
    },
    startingSide,
    skipFirstDraw: BATTLE.skipPlayerOpeningDraw,
    resolutionCap: BATTLE.resolutionCap,
    mandatoryLoopCheckFrom: BATTLE.mandatoryLoopCheckFrom,
    mandatoryLoopWindow: BATTLE.mandatoryLoopWindow,
    loopIterationCap: BATTLE.loopIterationCap,
    loopHistoryActions: BATTLE.loopHistoryActions,
    autoAnswerForcedPrompts: BATTLE.autoAnswerForcedPrompts,
    feasibilitySearchRuns: BATTLE.feasibilitySearchRuns,
    dreamwell: {
      recurringOrders: [...DREAMWELL_RULES.recurringOrders],
      cardsPerRecurringOrder: DREAMWELL_RULES.cardsPerRecurringOrder,
      minimumConstructedLength: DREAMWELL_RULES.minimumConstructedLength,
    },
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
      beginning: false,
    },
    sides: { player: emptySide(), enemy: emptySide() },
    instances: {},
    knownTo: { player: [], enemy: [] },
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
    automaticChoices: 0,
    loops: emptyLoopTracker(),
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
    for (const entry of dealtDeck(init, side)) {
      catalog.card(entry.cardId);
      const id: InstanceId = `i${state.nextInstance}`;
      state.nextInstance += 1;
      const instance: CardInstance = {
        id,
        printing: { kind: "card", cardId: entry.cardId },
        owner: side,
        controller: side,
        zone: "deck",
        variant: variantOf(entry),
        status: freshStatus(),
        enteredZoneAt: 0,
      };
      state.instances[id] = instance;
      state.sides[side].deck.push(id);
    }
  }
  return state;
}
