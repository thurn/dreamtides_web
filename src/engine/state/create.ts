import { decodeBattleSetup, isDeclaredDeckEntry, isVictorySides } from "./declared-input";
import { copyTransfigurationApplications, isTransfigurationApplications } from "../transfiguration-application-data";
import { validOpeningHandGuarantees } from "./opening-hand-guarantees";
import { isTypeRemap } from "../dsl/type-remap";
import { BATTLE } from "../../content/battle";
import { DREAMWELL_RULES } from "../../content/dreamwell-rules";
import { emptyLoopTracker } from "../loops/types";
import { emptyTurnLog } from "../rules/turn-log";
import type { EngineCatalog } from "../catalog";
import { NO_DECK_MODS, type Variant } from "../dsl/types";
import type { InstanceId, Side } from "./ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES } from "./ids";
import type { BattleConfig, BattleInit, BattleState, CardInstance, CardStatus, DeckEntry, SideState, ValidatedBattleSetup } from "./types";

/** The status of a card new to the battle: ready, unchanged, and not created unless `created`. */
export function freshStatus(created = false): CardStatus {
  return { exhausted: false, gainedSpark: 0, counters: 0, created, reclaimed: false, playedViaReclaim: false, playedViaAlternativeCost: false, offering: false, ephemeral: false, x: null };
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
 * The variant a deck entry is played as. Optional transfigurations, deck
 * modifications and an ability type remap accompany its amplified flag.
 */
export function variantOf(entry: DeckEntry): Variant {
  const amplified = entry.amplified === true;
  if (entry.transfigurationApplications !== undefined) {
    if (entry.transfigurations !== undefined || !isTransfigurationApplications(entry.transfigurationApplications)) throw new Error("Invalid transfiguration applications");
    return { amplified, transfigurationApplications: copyTransfigurationApplications(entry.transfigurationApplications),
      ...(entry.typeRemap === undefined ? {} : { typeRemap: entry.typeRemap }),
      ...(entry.deckMods === undefined ? {} : { deckMods: { ...entry.deckMods, typeChange: entry.deckMods.typeChange === null ? null : { ...entry.deckMods.typeChange } } }) };
  }
  const transfigurations = entry.transfigurations ?? [];
  const deckMods = entry.deckMods ?? NO_DECK_MODS;
  const modified =
    deckMods.sparkBonus !== 0 ||
    deckMods.costReduction !== 0 ||
    deckMods.fast ||
    deckMods.reclaim !== null ||
    deckMods.typeChange !== null;
  if (transfigurations.length === 0 && !modified) return { amplified, ...(entry.typeRemap === undefined ? {} : { typeRemap: entry.typeRemap }) };
  return {
    amplified,
    ...(entry.typeRemap === undefined ? {} : { typeRemap: entry.typeRemap }),
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
  if (init.turnLimit !== undefined && init.turnLimit !== null && (!Number.isSafeInteger(init.turnLimit) || init.turnLimit <= 0)) {
    throw new Error("Invalid battle turn limit");
  }
  if (init.victorySides !== undefined && !isVictorySides(init.victorySides)) {
    throw new Error("Invalid eligible victory sides");
  }
  const startingSide: Side = init.startingSide ?? (BATTLE.startingSide === "enemy" ? "enemy" : "player");
  return {
    scoreToWin: init.scoreToWin,
    turnLimit: init.turnLimit === undefined ? BATTLE.turnLimit : init.turnLimit,
    ...(init.victorySides === undefined ? {} : { victorySides: structuredClone(init.victorySides) }),
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
    discoverOptions: BATTLE.discoverOptions,
    dreamwell: {
      recurringOrders: [...DREAMWELL_RULES.recurringOrders],
      cardsPerRecurringOrder: DREAMWELL_RULES.cardsPerRecurringOrder,
      minimumConstructedLength: DREAMWELL_RULES.minimumConstructedLength,
    },
  };
}

function fields(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
}

/** Catalog availability and effective types are initialization-only checks, before allocation. */
function validateSetupCatalog(init: BattleInit, catalog: EngineCatalog, setup: ValidatedBattleSetup | undefined): void {
  if (setup === undefined) return;
  for (const side of SIDES) {
    for (const entry of init.decks[side]) catalog.card(entry.cardId);
    const avatar = init.avatars?.[side];
    if (avatar !== undefined) catalog.avatar(avatar);
    for (const dreamsign of init.dreamsigns?.[side] ?? []) catalog.dreamsign(dreamsign);
  }
  for (const id of init.dreamwell) catalog.dreamwellCard(id);
  for (const placement of setup.placements) {
    if (placement.zone !== "play") continue;
    const entry = init.decks[placement.side][placement.deckIndex];
    if (entry === undefined || (entry.deckMods?.typeChange?.cardType ?? catalog.card(entry.cardId).cardType) !== "character") {
      throw new Error("Invalid declared battle setup");
    }
  }
}

function prepareSetup(state: BattleState, setup: ValidatedBattleSetup | undefined, dreamwell: BattleInit["dreamwell"]): void {
  if (setup === undefined) return;
  const decks = { player: [...state.sides.player.deck], enemy: [...state.sides.enemy.deck] };
  for (const placement of setup.placements) {
    const id = decks[placement.side][placement.deckIndex];
    if (id === undefined) throw new Error("Missing declared deck copy");
    const instance = state.instances[id];
    if (instance === undefined) throw new Error("Missing declared instance");
    instance.zone = placement.zone;
    const side = state.sides[placement.side];
    if (placement.zone === "play") {
      side[placement.slot.rank === "front" ? "frontRank" : "backRank"][placement.slot.index] = id;
      instance.status.exhausted = placement.exhausted ?? false;
    } else {
      side[placement.zone].push(id);
    }
  }
  for (const side of SIDES) {
    Object.assign(state.sides[side], setup.sides[side]);
    state.sides[side].deck = decks[side].filter((id) => state.instances[id]?.zone === "deck");
  }
  Object.assign(state.turn, setup.turn, { sideTurns: { ...setup.turn.sideTurns } });
  state.dreamwell = { deck: [...setup.dreamwell.deck], next: setup.dreamwell.next, catalog: [...dreamwell] };
}

function validateDraftPools(pools: BattleInit["draftPools"], catalog: EngineCatalog): void {
  if (pools === undefined) return;
  if (!fields(pools, SIDES) || !SIDES.every((side) => Array.isArray(pools[side]))) throw new Error("Invalid declared draft pools");
  for (const side of SIDES) for (const cardId of pools[side]) catalog.card(cardId);
}

/**
 * The state before the battle begins: both decks as instances in deck
 * order, or the declared setup's zones. The `beginBattle` step enters its
 * prepared boundary or shuffles, deals and starts the first ordinary turn.
 */
export function initialState(init: BattleInit, catalog: EngineCatalog): BattleState {
  for (const side of SIDES) for (const entry of init.decks[side]) {
    if (entry.transfigurationApplications !== undefined) {
      if (!isDeclaredDeckEntry(entry)) throw new Error("Invalid transfiguration deck entry");
      catalog.variantCard(entry.cardId, variantOf(entry));
    }
  }
  if (!validOpeningHandGuarantees(init.guaranteedOpeningHand, init)) throw new Error("Invalid guaranteed opening hand");
  for (const side of SIDES) for (const entry of init.decks[side]) {
    if (entry.typeRemap !== undefined && !isTypeRemap(entry.typeRemap)) throw new Error("Invalid card ability type remap");
  }
  const config = battleConfig(init);
  validateDraftPools(init.draftPools, catalog);
  const setup = decodeBattleSetup(init);
  if (setup === null) throw new Error("Invalid declared battle setup");
  validateSetupCatalog(init, catalog, setup);
  const state: BattleState = {
    version: 0,
    seed: init.seed,
    rng: {},
    ...(init.draftPools === undefined ? {} : { draftPools: { player: [...init.draftPools.player], enemy: [...init.draftPools.enemy] } }),
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
    firstEventHistory: { current: { player: null, enemy: null }, previous: { player: null, enemy: null } },
    characterScoring: { current: [], previous: [] },
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
        journeyDeck: true,
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
  prepareSetup(state, setup, init.dreamwell);
  return state;
}
