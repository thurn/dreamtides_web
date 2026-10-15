import { BATTLE } from "../../content/battle";
import { DREAMWELL_RULES } from "../../content/dreamwell-rules";
import type { TransfigurationType } from "../../types/journey";
import { emptyLoopTracker } from "../loops/types";
import { emptyTurnLog } from "../rules/turn-log";
import type { EngineCatalog } from "../catalog";
import { NO_DECK_MODS, type Variant } from "../dsl/types";
import type { InstanceId, Side } from "./ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES, opponent } from "./ids";
import type { BattleConfig, BattleInit, BattleState, CardInstance, CardStatus, DeckEntry, SideState } from "./types";

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
  if (init.turnLimit !== undefined && init.turnLimit !== null && (!Number.isSafeInteger(init.turnLimit) || init.turnLimit <= 0)) {
    throw new Error("Invalid battle turn limit");
  }
  if (init.victorySides !== undefined && !validVictorySides(init.victorySides)) {
    throw new Error("Invalid eligible victory sides");
  }
  const startingSide: Side = init.startingSide ?? (BATTLE.startingSide === "enemy" ? "enemy" : "player");
  return {
    scoreToWin: init.scoreToWin,
    turnLimit: init.turnLimit === undefined ? BATTLE.turnLimit : init.turnLimit,
    ...(init.victorySides === undefined ? {} : { victorySides: [...init.victorySides] }),
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validVictorySides(value: unknown): value is readonly Side[] {
  if (!Array.isArray(value)) return false;
  const sides: readonly unknown[] = value;
  return sides.length > 0 && Array.from(sides).every((side) => SIDES.some((known) => known === side)) && new Set(sides).size === sides.length;
}

function fields(value: unknown, allowed: readonly string[]): boolean {
  return record(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function index(value: unknown): value is number {
  return nonnegative(value) && Number.isSafeInteger(value);
}

const TRANSFIGURATIONS = {
  Empowered: true, Amplified: true, Kindled: true, Inspired: true, Enduring: true,
  Hastened: true, Resonant: true, Attuned: true, Perfected: true,
} satisfies Record<TransfigurationType, true>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validEntry(entry: DeckEntry): boolean {
  if (!fields(entry, ["cardId", "amplified", "transfigurations", "deckMods"]) ||
      (entry.amplified !== undefined && typeof entry.amplified !== "boolean") ||
      (entry.transfigurations !== undefined && (!Array.isArray(entry.transfigurations) ||
        !entry.transfigurations.every((type) => typeof type === "string" && Object.prototype.hasOwnProperty.call(TRANSFIGURATIONS, type))))) return false;
  const mods = entry.deckMods;
  return mods === undefined || (fields(mods, ["sparkBonus", "costReduction", "fast", "reclaim", "typeChange"]) &&
    finite(mods.sparkBonus) && finite(mods.costReduction) && typeof mods.fast === "boolean" &&
    (mods.reclaim === null || finite(mods.reclaim)) &&
    (mods.typeChange === null || (fields(mods.typeChange, ["cardType", "subtype"]) &&
      (mods.typeChange.cardType === "character" || mods.typeChange.cardType === "event") && typeof mods.typeChange.subtype === "string")));
}

/** Validate the entire declaration before allocating any state or publishing events. */
function validateSetup(init: BattleInit, catalog: EngineCatalog, config: BattleConfig): void {
  const setup = init.setup;
  if (setup === undefined) return;
  const invalid = (): never => { throw new Error("Invalid declared battle setup"); };
  if (!fields(setup, ["placements", "sides", "turn", "dreamwell"]) || !Array.isArray(setup.placements) ||
      !fields(setup.sides, SIDES) || !fields(setup.turn, ["active", "phase", "round", "turnNumber", "sideTurns", "lastNormal"]) ||
      !fields(setup.dreamwell, ["deck", "next"])) invalid();
  for (const side of SIDES) {
    if (!Array.isArray(init.decks[side]) || !init.decks[side].every(validEntry)) invalid();
    for (const entry of init.decks[side]) catalog.card(entry.cardId);
    const avatar = init.avatars?.[side];
    if (avatar !== undefined) catalog.avatar(avatar);
    for (const dreamsign of init.dreamsigns?.[side] ?? []) catalog.dreamsign(dreamsign);
    const resources = setup.sides[side];
    if (!fields(resources, ["currentEnergy", "maxEnergy", "score"]) ||
        ![resources.currentEnergy, resources.maxEnergy, resources.score].every(nonnegative)) invalid();
    const effects = init.nextBattle?.[side];
    if (effects !== undefined && (effects.startingEnergy !== 0 || effects.openingHand.length !== 0 ||
        effects.smallerHandAndCostDiscount.some((discount) => discount.openingHandDelta !== 0 || !finite(discount.costReduction)))) {
      throw new Error("Declared setup conflicts with next-battle opening hand or energy");
    }
  }
  const turn = setup.turn;
  if (!SIDES.includes(turn.active) || turn.lastNormal !== turn.active ||
      (turn.phase !== "draw" && turn.phase !== "dawn" && turn.phase !== "day") || !index(turn.round) || turn.round === 0 ||
      !index(turn.turnNumber) || turn.turnNumber === 0 || !fields(turn.sideTurns, SIDES) ||
      !SIDES.every((side) => index(turn.sideTurns[side]))) invalid();
  const first = config.startingSide;
  const second = opponent(first);
  if (turn.sideTurns[first] !== Math.ceil(turn.turnNumber / 2) || turn.sideTurns[second] !== Math.floor(turn.turnNumber / 2) ||
      turn.round !== Math.ceil(turn.turnNumber / 2) || turn.active !== (turn.turnNumber % 2 === 1 ? first : second) ||
      (config.turnLimit !== null && turn.round > config.turnLimit)) invalid();
  if (!Array.isArray(setup.dreamwell.deck) || !index(setup.dreamwell.next) || setup.dreamwell.next > setup.dreamwell.deck.length) invalid();
  if (new Set(init.dreamwell).size !== init.dreamwell.length) invalid();
  for (const id of init.dreamwell) catalog.dreamwellCard(id);
  for (const id of setup.dreamwell.deck) {
    catalog.dreamwellCard(id);
    if (!init.dreamwell.includes(id)) invalid();
  }
  const copies = new Set<string>();
  const slots = new Set<string>();
  for (const placement of setup.placements) {
    if (!fields(placement, ["side", "deckIndex", "zone", "slot", "exhausted"]) || !SIDES.includes(placement.side) ||
        !index(placement.deckIndex) || placement.deckIndex >= init.decks[placement.side].length ||
        !["hand", "void", "play"].includes(placement.zone)) invalid();
    const copy = `${placement.side}:${placement.deckIndex}`;
    if (copies.has(copy)) invalid();
    copies.add(copy);
    if (placement.zone !== "play") {
      if (placement.slot !== undefined || placement.exhausted !== undefined) invalid();
      continue;
    }
    const slot = placement.slot;
    if (!fields(slot, ["rank", "index"]) || (slot.rank !== "front" && slot.rank !== "back") || !index(slot.index) ||
        slot.index >= (slot.rank === "front" ? FRONT_RANK_SIZE : BACK_RANK_SIZE) ||
        (placement.exhausted !== undefined && typeof placement.exhausted !== "boolean")) invalid();
    const cell = `${placement.side}:${slot.rank}:${slot.index}`;
    if (slots.has(cell)) invalid();
    slots.add(cell);
    const entry = init.decks[placement.side][placement.deckIndex];
    if (entry === undefined || (entry.deckMods?.typeChange?.cardType ?? catalog.card(entry.cardId).cardType) !== "character") invalid();
  }
}

function prepareSetup(state: BattleState, init: BattleInit): void {
  const setup = init.setup;
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
  state.dreamwell = { deck: [...setup.dreamwell.deck], next: setup.dreamwell.next, catalog: [...init.dreamwell] };
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
  const config = battleConfig(init);
  validateDraftPools(init.draftPools, catalog);
  validateSetup(init, catalog, config);
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
  prepareSetup(state, init);
  return state;
}
