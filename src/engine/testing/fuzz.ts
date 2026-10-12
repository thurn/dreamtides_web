import {
  createCatalog,
  type EmblemDefinitions,
  type EngineCardDefinition,
  type EngineCatalog,
  type EngineDreamwellDefinition,
  type EngineFigmentDefinition,
} from "../catalog";
import { activated, energy, energyX, everyIn, exhaustSelf, self } from "../dsl/builders";
import type { ApplyResult, Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { randomLegalAnswer } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Answer, Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { hashString, stateHash, type StateHash } from "../state/hash";
import type { BattleSeed, Side } from "../state/ids";
import { BACK_RANK_SIZE, SIDES, battleSeed, parseFigmentId } from "../state/ids";
import type { BattleInit, BattleResult, BattleState, DeckEntry } from "../state/types";
import { stepForAction, type StepObserver } from "../steps/driver";
import type { Step } from "../steps/kinds";
import { beginBattleStep } from "../steps/kinds/begin-battle";
import { initialState } from "../state/create";
import { eventLogRecords, legalityLogRecords, stepLogRecords, type EngineLogRecord } from "../log";
import { InlineSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { unannouncedChanges } from "./announced-changes";
import { determinizationDivergences } from "./determinization-fidelity";
import { invariantViolations } from "./invariants";
import { EventRedaction, promptRedactionViolations } from "./redaction";
import { PolicyRandom, randomAction } from "../policy/random";
import { SYNTHETIC, SYNTHETIC_CARDS, SYNTHETIC_DREAMWELL, syntheticId } from "./synthetic-cards";
import { PROMPTING_CARDS } from "./synthetic-effects";
import { DSL_CARDS } from "./dsl-cards";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { TRIGGER_CARDS, TRIGGER_EMBLEMS } from "./trigger-cards";
import { CONTINUOUS_CARDS, CONTINUOUS_EMBLEMS } from "./continuous-cards";
import { ZONE_CARDS, ZONE_FIGMENTS } from "./zone-cards";
import { DECK_TOP_CARDS } from "./deck-top-cards";
import { LOOP_CARDS } from "./loop-cards";
import { parseCardId, type CardId } from "../../types/card-identity";
import { parseAvatarId, parseDreamsignId, parseDreamwellCardId, parseSemanticEntityId, type AvatarId, type DreamsignId, type DreamwellCardId } from "../../types/identifiers";
import type { FigmentId, InstanceId } from "../state/ids";
import { DREAMWELL_RULES } from "../../content/dreamwell-rules";
import { atStartOfFirstTurn, triggered } from "../dsl/triggers";
import { materializeFigments, playFromZone, returnToHand, sequence, shuffleInto } from "../effects/primitives";
import { BASE_VARIANT } from "../dsl/types";

/** A recorded top-level action and the prompt answers given while it ran. */
export interface RecordedAction {
  readonly side: Side;
  readonly action: Action;
  readonly answers: readonly RecordedAnswer[];
}

export interface FuzzGame {
  readonly init: BattleInit;
  readonly targetCoverage: readonly FuzzTargetCoverage[];
  /** Answers given while the battle was created. */
  readonly startAnswers: readonly RecordedAnswer[];
  readonly actions: readonly RecordedAction[];
  readonly result: BattleResult | null;
  readonly finalHash: StateHash;
  /** A hash of the complete event sequence. */
  readonly eventsHash: number;
  readonly steps: number;
  readonly prompts: number;
  /** Plays and activations decisions left out because their legality search spent its budget (`ApplyResult.bounded`). */
  readonly boundedLegality: number;
  /** Play-time prompts that withheld answers because the budget ran out (`feasibilityBounded` events). */
  readonly boundedPrompts: number;
  /** The first invariant violation or engine error, with the step that caused it. */
  readonly failure: string | null;
  /** The action whose run threw, which `actions` therefore lacks. */
  readonly failedAction: { readonly side: Side; readonly action: Action } | null;
}

/** The policy playing each side of a fuzz game, as its log records it. */
export const FUZZ_POLICIES: Readonly<Record<Side, string>> = { player: "random", enemy: "random" };

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export const DECK_SIZE = 30;
/** Top-level actions after which a game counts as non-terminating. */
export const ACTION_CAP = 20000;
/**
 * Steps between determinization-fidelity checks (`determinizationDivergences`):
 * each runs at the first top-level decision after its stride's last step.
 */
const FIDELITY_STRIDE = 10;

/**
 * Fuzz-only fixtures for the determinization-fidelity check, ids 0xe80+:
 * states that the production catalog and the other fixtures rarely reach.
 */
const FIDELITY_CARDS: readonly EngineCardDefinition[] = [
  {
    // "☾: You may play an event from your void. Return this character to your
    // hand, then shuffle your hand into your deck.": a play permission whose
    // source is then hidden from both sides.
    id: syntheticId(0xe80),
    cardType: "character",
    costs: [energy(1)],
    spark: 1,
    subtype: "Mage",
    speed: "standard",
    status: "authored",
    abilities: () => [activated([exhaustSelf()], sequence(playFromZone("void", { cardType: "event" }, { next: true }), returnToHand(self()), shuffleInto([everyIn("hand")])))],
  },
];

/**
 * Synthetic cards the fuzzer mixes in: vanilla, prompting, DSL, stack
 * (Interrupts, prevent, activated abilities), trigger and duration,
 * continuous-effect, zone and special-mechanic, optional-loop, and
 * determinization-fidelity fixtures.
 */
const FUZZ_SYNTHETIC = [...SYNTHETIC_CARDS, ...PROMPTING_CARDS, ...DSL_CARDS, ...STACK_CARDS, ...TRIGGER_CARDS, ...CONTINUOUS_CARDS, ...ZONE_CARDS, ...LOOP_CARDS, ...FIDELITY_CARDS, ...DECK_TOP_CARDS];

const FUZZ_EMBLEMS: EmblemDefinitions = {
  avatars: [...(SYNTHETIC_EMBLEMS.avatars ?? []), ...(TRIGGER_EMBLEMS.avatars ?? []), ...(CONTINUOUS_EMBLEMS.avatars ?? [])],
  dreamsigns: [...(SYNTHETIC_EMBLEMS.dreamsigns ?? []), ...(TRIGGER_EMBLEMS.dreamsigns ?? []), ...(CONTINUOUS_EMBLEMS.dreamsigns ?? [])],
};

/** Requested catalog entities, with each UUID retaining its domain brand. */
export type FuzzTarget =
  | { readonly kind: "card"; readonly uuid: CardId }
  | { readonly kind: "avatar"; readonly uuid: AvatarId }
  | { readonly kind: "dreamsign"; readonly uuid: DreamsignId }
  | { readonly kind: "dreamwell"; readonly uuid: DreamwellCardId }
  | { readonly kind: "figment"; readonly uuid: FigmentId };

/** Counts observed setup inclusion and engine events; see README for each kind's units. */
export interface FuzzTargetCoverage {
  readonly target: FuzzTarget;
  included: number;
  exercised: number;
}

/**
 * The content a fuzz game draws from beside the synthetic fixtures: the
 * cards that fill half of each deck, the shared Dreamwell, and the emblems
 * and figments those cards need in the catalog. The fuzz scripts pass the
 * production catalog; engine tests pass `SYNTHETIC_FUZZ_POOL`.
 */
export interface FuzzPool {
  readonly cards: readonly EngineCardDefinition[];
  /** One reserved entry per requested UUID in each otherwise random deck. */
  readonly weightedCardIds?: readonly CardId[];
  readonly targets?: readonly FuzzTarget[];
  readonly dreamwell: readonly EngineDreamwellDefinition[];
  readonly emblems: EmblemDefinitions;
  readonly figments: readonly EngineFigmentDefinition[];
}

function weightedCards(pool: FuzzPool): readonly CardId[] {
  const targets = pool.targets?.flatMap((target) => target.kind === "card" ? [target.uuid] : []) ?? pool.weightedCardIds ?? [];
  if (targets.length === 0) return targets;
  if (targets.length > DECK_SIZE) throw new Error(`At most ${String(DECK_SIZE)} distinct card UUIDs can be targeted.`);
  const known = new Set(pool.cards.map((card) => card.id));
  for (const id of targets) {
    if (!known.has(id)) throw new Error(`Fuzz target is not an available card UUID: ${id}`);
  }
  return targets;
}

/** Available targets are resolved by UUID and retain their identity domain. */
function availableTargets(pool: FuzzPool): FuzzTarget[] {
  return [
    ...pool.cards.map((card): FuzzTarget => ({ kind: "card", uuid: card.id })),
    ...(pool.emblems.avatars ?? []).map((avatar): FuzzTarget => ({ kind: "avatar", uuid: avatar.id })),
    ...(pool.emblems.dreamsigns ?? []).map((sign): FuzzTarget => ({ kind: "dreamsign", uuid: sign.id })),
    ...pool.dreamwell.map((card): FuzzTarget => ({ kind: "dreamwell", uuid: card.id })),
    ...pool.figments.map((figment): FuzzTarget => ({ kind: "figment", uuid: figment.id })),
  ];
}

function fuzzTargets(pool: FuzzPool): readonly FuzzTarget[] {
  const targets = pool.targets ?? weightedCards(pool).map((uuid): FuzzTarget => ({ kind: "card", uuid }));
  const known = availableTargets(pool);
  for (const target of targets) {
    if (target.kind === "dreamsign") {
      const sign = pool.emblems.dreamsigns?.find((sign) => sign.id === target.uuid);
      if (sign?.status !== "authored" || sign.abilities(BASE_VARIANT).length === 0) {
        throw new Error(`Dreamsign fuzz target requires non-empty authored battle abilities (journey-only, pending and vanilla targets are unsupported): ${target.uuid}`);
      }
    }
    if (target.kind === "dreamwell") {
      const order = pool.dreamwell.find((card) => card.id === target.uuid)?.order;
      if (order === undefined || !DREAMWELL_RULES.recurringOrders.includes(order)) throw new Error(`Unsupported non-recurring Dreamwell fuzz target: ${target.uuid}`);
    }
    if (!known.some((entry) => entry.kind === target.kind && entry.uuid === target.uuid)) {
      throw new Error(`Unavailable fuzz ${target.kind} target: ${target.uuid}`);
    }
  }
  return targets;
}

/** Parse mixed catalog UUID targets, retaining the full engine catalog and card sampling. */
export function withFuzzCardWeights(pool: FuzzPool, input: string | undefined): FuzzPool {
  if (input === undefined) return pool;
  if (input.trim().length === 0) throw new Error("--weight-uuids requires a comma-separated list of entity UUIDs.");
  const known = availableTargets(pool);
  const targets = [...new Set(input.split(",").map((value) => parseSemanticEntityId(value.trim())))].map((uuid): FuzzTarget => {
    const matches = known.filter((entry) => String(entry.uuid) === uuid);
    if (matches.length !== 1) throw new Error(`Unknown or ambiguous fuzz target UUID: ${uuid}`);
    switch (matches[0].kind) {
      case "card": return { kind: "card", uuid: parseCardId(uuid) };
      case "avatar": return { kind: "avatar", uuid: parseAvatarId(uuid) };
      case "dreamsign": return { kind: "dreamsign", uuid: parseDreamsignId(uuid) };
      case "dreamwell": {
        const id = parseDreamwellCardId(uuid);
        const order = pool.dreamwell.find((card) => card.id === id)?.order;
        if (order === undefined || !DREAMWELL_RULES.recurringOrders.includes(order)) {
          throw new Error(`Unsupported non-recurring Dreamwell fuzz target: ${uuid}`);
        }
        return { kind: "dreamwell", uuid: id };
      }
      case "figment": return { kind: "figment", uuid: parseFigmentId(uuid) };
    }
  });
  const weightedCardIds = targets.flatMap((target) => target.kind === "card" ? [target.uuid] : []);
  const targeted = { ...pool, weightedCardIds, targets };
  weightedCards(targeted);
  fuzzTargets(targeted);
  return targeted;
}

/** Consecutive absolute game ordinals cover every target despite battle slot limits. */
function targetWindow<Id>(ids: readonly Id[], capacity: number, ordinal: number): Id[] {
  return Array.from({ length: Math.min(ids.length, capacity) }, (_, index) => ids[((ordinal % ids.length) * capacity + index) % ids.length]);
}

/** Synthetic support creates the selected types through normal materialization effects. */
function figmentSupport(pool: FuzzPool) {
  const ids = fuzzTargets(pool).flatMap((target) => target.kind === "figment" ? [target.uuid] : []);
  return ids.map((uuid, index) => {
    const id = parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0xf00 + index).toString(16).padStart(12, "0")}`);
    if (availableTargets(pool).some((target) => String(target.uuid) === id) || FUZZ_EMBLEMS.dreamsigns?.some((sign) => sign.id === id)) {
      throw new Error(`Fuzz figment support UUID collides with catalog content: ${id}`);
    }
    return { id, status: "authored" as const, abilities: () => [triggered(atStartOfFirstTurn(), materializeFigments(uuid))] };
  });
}

function pending(index: number, base: EngineCardDefinition, changes: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...base, ...changes, id: syntheticId(0xe40 + index), status: "pending" };
}

/**
 * A synthetic stand-in for catalog content, ids 0xe40+: pending (text-less,
 * D36) characters and events across costs, speeds, and subtypes, including X
 * costs and a variable spark, with the synthetic Dreamwell.
 */
export const SYNTHETIC_FUZZ_POOL: FuzzPool = {
  cards: [
    pending(0, SYNTHETIC.vanilla0, { subtype: "Spirit Animal" }),
    pending(1, SYNTHETIC.vanilla1, { subtype: "Mage" }),
    pending(2, SYNTHETIC.vanilla2),
    pending(3, SYNTHETIC.vanilla3, { subtype: "Mage" }),
    pending(4, SYNTHETIC.vanilla5, { subtype: "Spirit Animal" }),
    pending(5, SYNTHETIC.vanilla8),
    pending(6, SYNTHETIC.fastCharacter, { subtype: "Mage" }),
    pending(7, SYNTHETIC.interruptCharacter),
    pending(8, SYNTHETIC.vanilla2, { costs: [energyX()], spark: "x" }),
    pending(9, SYNTHETIC.event0),
    pending(10, SYNTHETIC.event1, { costs: [energy(2)] }),
    pending(11, SYNTHETIC.fastEvent),
    pending(12, SYNTHETIC.interruptEvent, { costs: [energy(3)] }),
    pending(13, SYNTHETIC.event1, { costs: [energyX()] }),
    pending(14, SYNTHETIC.event1, { costs: [energy(1), energyX()] }),
  ],
  dreamwell: SYNTHETIC_DREAMWELL,
  emblems: {},
  figments: [],
};

/** Every card the fuzzer draws from: the synthetic fixtures plus the pool's cards. */
export function fuzzCatalogCards(pool: FuzzPool): EngineCardDefinition[] {
  return [...FUZZ_SYNTHETIC, ...pool.cards];
}

/**
 * The fuzzer's catalog: the synthetic fixtures, emblems, and figments, any
 * `extra` cards, and the pool.
 */
export function fuzzEngineCatalog(pool: FuzzPool, extra: readonly EngineCardDefinition[] = []): EngineCatalog {
  return createCatalog(
    [...FUZZ_SYNTHETIC, ...extra, ...pool.cards],
    pool.dreamwell,
    {
      avatars: [...(FUZZ_EMBLEMS.avatars ?? []), ...(pool.emblems.avatars ?? [])],
      dreamsigns: [...(FUZZ_EMBLEMS.dreamsigns ?? []), ...(pool.emblems.dreamsigns ?? []), ...figmentSupport(pool)],
    },
    [...ZONE_FIGMENTS, ...pool.figments],
  );
}

/**
 * A random deck mixing synthetic cards (vanilla, prompting, and DSL) with the
 * pool's cards; pending pool cards play text-less. A tenth of the entries are
 * amplified. Targeted runs reserve one entry for each requested UUID;
 * the remaining entries keep the full synthetic/content mix.
 */
export function randomDeck(random: PolicyRandom, pool: FuzzPool): DeckEntry[] {
  const synthetic = FUZZ_SYNTHETIC;
  const targets = weightedCards(pool);
  const deck = Array.from({ length: DECK_SIZE }, () => ({
    cardId: (random.next() < 0.5 ? random.pick(synthetic) : random.pick(pool.cards)).id,
    amplified: random.next() < 0.1,
  }));
  for (const [index, cardId] of targets.entries()) deck[index] = { ...deck[index], cardId };
  return deck;
}

export function fuzzInit(seed: BattleSeed, pool: FuzzPool, ordinal = 0): BattleInit {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error("Fuzz game ordinal must be a non-negative safe integer.");
  const random = new PolicyRandom(battleSeed(`decks|${seed}`));
  const targets = fuzzTargets(pool);
  const avatars = [...(FUZZ_EMBLEMS.avatars ?? []), ...(pool.emblems.avatars ?? [])].filter((avatar) => avatar.status === "authored").map((avatar) => avatar.id);
  const dreamsigns = [...(FUZZ_EMBLEMS.dreamsigns ?? []), ...(pool.emblems.dreamsigns ?? [])].filter((dreamsign) => dreamsign.status === "authored").map((dreamsign) => dreamsign.id);
  const avatarTargets = targetWindow(targets.flatMap((target) => target.kind === "avatar" ? [target.uuid] : []), SIDES.length, ordinal);
  const dreamsignTargets = targets.flatMap((target) => target.kind === "dreamsign" ? [target.uuid] : []);
  const support = targetWindow(figmentSupport(pool), BACK_RANK_SIZE, ordinal).map((sign) => sign.id);
  const someDreamsigns = () => [...new Set([...dreamsigns.filter(() => random.next() < 0.3), ...dreamsignTargets])];
  const startingSide = random.next() < 0.5 ? "player" : "enemy";
  const decks = { player: randomDeck(random, pool), enemy: randomDeck(random, pool) };
  const dreamwell = pool.dreamwell.map((card) => card.id);
  for (const order of DREAMWELL_RULES.recurringOrders) {
    const tier = pool.dreamwell.filter((card) => card.order === order);
    const tierTargets = targets.flatMap((target) => target.kind === "dreamwell" && tier.some((card) => card.id === target.uuid) ? [target.uuid] : []);
    if (tierTargets.length === 0) continue;
    const selected = targetWindow(tierTargets, DREAMWELL_RULES.cardsPerRecurringOrder, ordinal);
    const remaining = tier.filter((card) => !selected.includes(card.id));
    while (selected.length < Math.min(tier.length, DREAMWELL_RULES.cardsPerRecurringOrder)) {
      const card = random.pick(remaining);
      selected.push(card.id);
      remaining.splice(remaining.indexOf(card), 1);
    }
    for (let index = dreamwell.length - 1; index >= 0; index--) {
      if (tier.some((card) => card.id === dreamwell[index]) && !selected.includes(dreamwell[index])) dreamwell.splice(index, 1);
    }
  }
  const chosenAvatars = { player: random.pick(avatars), enemy: random.pick(avatars) };
  if (avatarTargets.length > 0) {
    chosenAvatars.player = avatarTargets[0];
    chosenAvatars.enemy = avatarTargets[1] ?? avatarTargets[0];
  }
  const chosenDreamsigns = { player: someDreamsigns(), enemy: someDreamsigns() };
  chosenDreamsigns[startingSide].push(...support);
  return { seed, scoreToWin: 25, startingSide, decks, dreamwell, avatars: chosenAvatars, dreamsigns: chosenDreamsigns };
}

function eventsDigest(events: readonly EngineEvent[]): number {
  return hashString(JSON.stringify(events));
}

/** A top-level action the Random policy chose, and the side it chose it for. */
export interface ChosenAction {
  readonly side: Side;
  readonly action: Action;
}

/** Observers of a Random-policy game; every hook is optional. */
export interface RandomGameHooks {
  /** Receives every step, as the engine's step observer. */
  readonly observe?: StepObserver;
  /** Sees each prompt the policy answers, the working state it was asked in, and the answer. */
  readonly answered?: (prompt: Prompt, work: BattleState, answer: Answer) => void;
  /** Sees each action the policy chooses and the committed state it chose it in, before the engine applies it. */
  readonly choosing?: (chosen: ChosenAction, state: BattleState) => void;
  /** Receives the engine's result for the battle's creation (`chosen` null), then for each applied action. */
  readonly committed?: (result: ApplyResult, chosen: ChosenAction | null) => void;
  /** Ends play before the next decision when it returns true; `actions` counts the actions taken so far. */
  readonly stop?: (state: BattleState, actions: number) => boolean;
}

/**
 * Why a Random-policy game ended: the battle's result, the `stop` hook, a
 * state with neither a result nor a pending decision, or `ACTION_CAP`.
 */
export type RandomGameEnd = "result" | "stopped" | "noDecision" | "actionCap";

export interface RandomGame {
  readonly state: BattleState;
  /** The top-level actions taken. */
  readonly actions: number;
  readonly end: RandomGameEnd;
}

/** Answers every prompt for both sides with `policy`, reporting each answer to `answered`. */
function randomAnswers(policy: PolicyRandom, answered: RandomGameHooks["answered"]): InlineSource {
  const answer = (prompt: Prompt, work: BattleState): Answer => {
    const value = randomLegalAnswer(prompt, () => policy.next());
    answered?.(prompt, work, value);
    return value;
  };
  return new InlineSource({ player: answer, enemy: answer });
}

/**
 * Creates the battle `init` describes and plays it with the Random policy on
 * both sides, seeded by `policy|<seed>`, until it ends (`RandomGameEnd`).
 * The policy answers every prompt and chooses every top-level action.
 */
export function playRandomGame(engine: Engine, init: BattleInit, hooks: RandomGameHooks = {}): RandomGame {
  const policy = new PolicyRandom(battleSeed(`policy|${init.seed}`));
  const created = engine.createBattle(init, randomAnswers(policy, hooks.answered), hooks.observe);
  hooks.committed?.(created, null);
  return playRandomActions(engine, created.state, policy, hooks);
}

/** Plays on from a committed `state` with the Random policy `policy` on both sides, as `playRandomGame` does. */
export function playRandomActions(engine: Engine, state: BattleState, policy: PolicyRandom, hooks: RandomGameHooks = {}): RandomGame {
  const source = randomAnswers(policy, hooks.answered);
  let current = state;
  let actions = 0;
  while (current.result === null) {
    if (hooks.stop?.(current, actions) === true) return { state: current, actions, end: "stopped" };
    const pending = engine.decision(current);
    if (pending === null) return { state: current, actions, end: "noDecision" };
    if (actions >= ACTION_CAP) return { state: current, actions, end: "actionCap" };
    const chosen: ChosenAction = { side: pending.side, action: randomAction(engine.legalActions(current, pending.side), policy) };
    hooks.choosing?.(chosen, current);
    const applied = engine.apply(current, chosen.side, chosen.action, source, hooks.observe);
    actions += 1;
    hooks.committed?.(applied, chosen);
    current = applied.state;
  }
  return { state: current, actions, end: "result" };
}

/** Plays one seeded game with the Random policy on both sides, checking invariants after every step. */
export function playFuzzGame(engine: Engine, seed: BattleSeed, pool: FuzzPool, ordinal = 0): FuzzGame {
  const init = fuzzInit(seed, pool, ordinal);
  const targetCoverage = fuzzTargets(pool).map((target): FuzzTargetCoverage => ({ target, included: 0, exercised: 0 }));
  for (const coverage of targetCoverage) {
    const { target } = coverage;
    for (const side of ["player", "enemy"] as const) {
      if (target.kind === "card") coverage.included += init.decks[side].filter((entry) => entry.cardId === target.uuid).length;
      if (target.kind === "avatar" && init.avatars?.[side] === target.uuid) coverage.included += 1;
      if (target.kind === "dreamsign") coverage.included += init.dreamsigns?.[side]?.filter((id) => id === target.uuid).length ?? 0;
    }
  }
  const createdFigments = new Map<InstanceId, FigmentId>();
  let prompts = 0;
  let steps = 0;
  let boundedLegality = 0;
  let boundedPrompts = 0;
  let failure: string | null = null;
  const events: EngineEvent[] = [];
  let state: BattleState = initialState(init, engine.catalog);
  /** The state before the step the observer sees next, for the event-redaction invariant. */
  let beforeStep = state;
  const eventRedaction = new EventRedaction();
  let startAnswers: readonly RecordedAnswer[] = [];
  const actions: RecordedAction[] = [];
  let failedAction: FuzzGame["failedAction"] = null;
  /** The step count at or after which the next determinization-fidelity check runs. */
  let fidelityDue = 0;
  try {
    const game = playRandomGame(engine, init, {
      answered: (prompt, work) => {
        prompts += 1;
        if (failure === null) {
          const problems = promptRedactionViolations(prompt, work, engine.catalog);
          if (problems.length > 0) failure = `at a ${prompt.kind} prompt after step #${String(steps)}: ${problems.join("; ")}`;
        }
      },
      observe: (observed, step, stepEvents) => {
        steps += 1;
        for (const event of stepEvents) {
          if (event.kind === "cardCreated" && event.printing.kind === "figment") createdFigments.set(event.instance, event.printing.figment);
          for (const coverage of targetCoverage) {
            const { target } = coverage;
            if (target.kind === "dreamwell" && event.kind === "dreamwellDrawn" && event.card === target.uuid) coverage.exercised += 1;
            if (target.kind === "figment" && event.kind === "materialized" && createdFigments.get(event.instance) === target.uuid) {
              coverage.included += 1;
              coverage.exercised += 1;
            }
            if (target.kind === "card" && event.kind === "cardPlayed") {
              const printing = observed.instances[event.instance]?.printing;
              if (printing?.kind === "card" && printing.cardId === target.uuid) coverage.exercised += 1;
            }
            if ((target.kind === "avatar" || target.kind === "dreamsign") &&
                (event.kind === "abilityActivated" || (event.kind === "triggerResolved" && event.applied))) {
              const source = event.source;
              if (source !== null && typeof source !== "string" && source.kind !== "dreamwell") {
                const id = source.kind === "avatar" ? init.avatars?.[source.side] : init.dreamsigns?.[source.side]?.[source.index];
                if (source.kind === target.kind && id === target.uuid) coverage.exercised += 1;
              }
            }
          }
        }
        if (step.kind === "beginBattle") {
          for (const coverage of targetCoverage) {
            if (coverage.target.kind === "dreamwell") coverage.included += observed.dreamwell.deck.filter((id) => id === coverage.target.uuid).length;
          }
        }
        if (failure === null) {
          const problems = [
            ...invariantViolations(observed, engine.catalog),
            ...eventRedaction.check(stepEvents, beforeStep, observed),
            ...unannouncedChanges(stepEvents, beforeStep, observed),
          ];
          if (problems.length > 0) {
            failure = `after step ${step.kind} (#${String(steps)}): ${problems.join("; ")}`;
          }
        }
        beforeStep = observed;
      },
      choosing: (chosen, current) => {
        failedAction = chosen;
        if (failure === null && steps >= fidelityDue) {
          fidelityDue = steps + FIDELITY_STRIDE;
          const problems = determinizationDivergences(engine, current, init.decks, init.seed, actions.length);
          if (problems.length > 0) {
            failure = `determinization fidelity before action #${String(actions.length + 1)} (after step #${String(steps)}): ${problems.join("; ")}`;
          }
        }
      },
      committed: (applied, chosen) => {
        if (chosen === null) {
          startAnswers = applied.answers;
        } else {
          failedAction = null;
          actions.push({ ...chosen, answers: applied.answers });
        }
        events.push(...applied.events);
        boundedLegality += applied.bounded.length;
        boundedPrompts += applied.events.filter((event) => event.kind === "feasibilityBounded").length;
        state = applied.state;
      },
      stop: () => failure !== null,
    });
    if (game.end === "noDecision") failure = "no decision and no result";
    if (game.end === "actionCap") failure = `no result after ${String(ACTION_CAP)} actions`;
  } catch (error) {
    failure ??= errorText(error);
  }
  return {
    init,
    targetCoverage,
    startAnswers,
    actions,
    result: state.result,
    finalHash: stateHash(state),
    eventsHash: eventsDigest(events),
    steps,
    prompts,
    boundedLegality,
    boundedPrompts,
    failure,
    failedAction,
  };
}

/**
 * The engine log of a recorded fuzz game (log.ts), for a failing game's log
 * file: its init and policies, then each action with its answers, replayed
 * inline to add the triggers, loops, random draws, battle end, and
 * feasibility bounds it produced. A step that throws ends the log with an
 * `engine.error` record.
 */
export function fuzzGameLog(engine: Engine, game: FuzzGame): EngineLogRecord[] {
  const records: EngineLogRecord[] = [{ event: "engine.battleStarted", version: 0, init: game.init, policies: FUZZ_POLICIES }];
  let previous = initialState(game.init, engine.catalog);
  const observe: StepObserver = (state, _step, events) => {
    records.push(...eventLogRecords(events, previous.version), ...stepLogRecords(previous, state));
    previous = state;
  };
  let step: Step = beginBattleStep(game.init);
  try {
    const created = engine.createBattle(game.init, replaySource(game.startAnswers), observe);
    records.push(...legalityLogRecords(created.bounded));
    let state = created.state;
    for (const { side, action, answers } of game.actions) {
      records.push({ event: "engine.action", version: state.version, side, action, answers });
      step = stepForAction(state, action);
      const applied = engine.apply(state, side, action, replaySource(answers), observe);
      records.push(...legalityLogRecords(applied.bounded));
      state = applied.state;
    }
  } catch (error) {
    records.push({ event: "engine.error", version: previous.version, step, message: errorText(error) });
  }
  return records;
}

/** Answers prompts with the recorded non-automatic answers, in order. */
function replaySource(answers: readonly RecordedAnswer[]): InlineSource {
  const values = answers.filter((answer) => answer.auto !== true).map((answer) => answer.value);
  let index = 0;
  return new InlineSource({
    player: () => values[index++] ?? [],
    enemy: () => values[index++] ?? [],
  });
}

/** Replays a recorded game inline and returns its final state hash. */
export function replayFinalHash(engine: Engine, game: FuzzGame): StateHash {
  let state = engine.createBattle(game.init, replaySource(game.startAnswers)).state;
  for (const { side, action, answers } of game.actions) {
    state = engine.apply(state, side, action, replaySource(answers)).state;
  }
  return stateHash(state);
}

export interface InteractiveReplay {
  readonly failure: string | null;
  /** Fold re-runs of a suspended step, and their total time in milliseconds. */
  readonly reruns: number;
  readonly rerunMs: number;
  /** The slowest single re-run, in milliseconds. */
  readonly rerunMaxMs: number;
}

/**
 * Replays a recorded game through the fold, suspending at every prompt and
 * answering it from the recording, then checks that the final state, the
 * event sequence, and every prompt fingerprint match the inline game, that
 * each suspended display redacts the state and prompt for both sides, that
 * the events a suspended step has published name only cards each side that
 * may see them can identify at the step's start or in the display
 * (`EventRedaction`), and that the fold logged every action once, in order.
 */
export function replayInteractively(
  engine: Engine,
  game: FuzzGame,
  now: () => number,
  log?: (record: EngineLogRecord) => void,
): InteractiveReplay {
  const logged: EngineLogRecord[] = [];
  const fold = createFoldAdapter(engine, {
    checkEventPrefix: true,
    log: (record) => {
      logged.push(record);
      log?.(record);
    },
  });
  const events: EngineEvent[] = [];
  let reruns = 0;
  let rerunMs = 0;
  let rerunMaxMs = 0;
  let failure: string | null = null;
  // Each suspended step's events published so far must name only cards each
  // side that may see them can identify at the step's start or in the
  // display (completed steps publish the inline game's events, checked there).
  const eventRedaction = new EventRedaction();
  const publish = (published: readonly EngineEvent[], from: BattleSlice | null, slice: BattleSlice): void => {
    events.push(...published);
    const display = fold.pending(slice)?.display;
    if (display === undefined) return;
    const earlier = from !== null && from.committed === slice.committed ? from.publishedEvents : 0;
    const fresh = published.slice(published.length - (slice.publishedEvents - earlier));
    const leaks = eventRedaction.check(fresh, slice.committed, display);
    if (leaks.length > 0) failure ??= `a suspended step's events leak: ${leaks.join("; ")}`;
  };

  const answerAll = (slice: BattleSlice, answers: readonly RecordedAnswer[]): BattleSlice => {
    const given = answers.filter((answer) => answer.auto !== true);
    let current = slice;
    for (const recorded of given) {
      const pending = fold.pending(current);
      if (pending === null) {
        failure ??= "the fold has no pending prompt for a recorded answer";
        return current;
      }
      const { id, ...prompt } = pending.prompt;
      if (promptFingerprint(prompt) !== recorded.fingerprint) {
        failure ??= "a prompt fingerprint differs from the inline game";
        return current;
      }
      const leaks = promptRedactionViolations(pending.prompt, pending.display, engine.catalog);
      if (leaks.length > 0) {
        failure ??= `a suspended display leaks: ${leaks.join("; ")}`;
        return current;
      }
      const started = now();
      const outcome = fold.reduce(current, { kind: "answer", side: pending.prompt.side, promptId: id, value: recorded.value });
      const elapsed = now() - started;
      rerunMs += elapsed;
      rerunMaxMs = Math.max(rerunMaxMs, elapsed);
      reruns += 1;
      if (outcome.kind !== "applied" || outcome.error !== null) {
        failure ??= `answer failed: ${outcome.kind === "bounced" ? outcome.reason : (outcome.error?.message ?? "")}`;
        return current;
      }
      publish(outcome.published, current, outcome.slice);
      current = outcome.slice;
    }
    if (fold.pending(current) !== null) {
      failure ??= "the fold is still waiting for an answer the inline game did not need";
    }
    return current;
  };

  const started = fold.start(game.init);
  if (started.kind !== "applied") return { failure: "start bounced", reruns, rerunMs, rerunMaxMs };
  publish(started.published, null, started.slice);
  let slice = answerAll(started.slice, game.startAnswers);
  for (const { side, action, answers } of game.actions) {
    if (failure !== null) break;
    const outcome = fold.reduce(slice, { kind: "battleAction", side, action });
    if (outcome.kind !== "applied" || outcome.error !== null) {
      failure = `action failed: ${outcome.kind === "bounced" ? outcome.reason : (outcome.error?.message ?? "")}`;
      break;
    }
    publish(outcome.published, null, outcome.slice);
    slice = answerAll(outcome.slice, answers);
  }
  if (failure === null && stateHash(slice.committed) !== game.finalHash) {
    failure = "the fold's final state differs from the inline game";
  }
  if (failure === null && eventsDigest(events) !== game.eventsHash) {
    failure = "the fold published a different event sequence";
  }
  const loggedActions = logged.flatMap((record) => (record.event === "engine.action" ? [{ side: record.side, action: record.action }] : []));
  if (failure === null && JSON.stringify(loggedActions) !== JSON.stringify(game.actions.map(({ side, action }) => ({ side, action })))) {
    failure = "the fold's log differs from the actions taken";
  }
  return { failure, reruns, rerunMs, rerunMaxMs };
}
