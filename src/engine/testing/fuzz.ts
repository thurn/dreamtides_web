import type { Engine } from "../engine";
import type { Action } from "../rules/actions";
import { stateHash, type StateHash } from "../state/hash";
import type { BattleSeed, Side } from "../state/ids";
import { battleSeed } from "../state/ids";
import type { BattleInit, BattleResult, BattleState, DeckEntry } from "../state/types";
import { NO_PROMPTS } from "../steps/sources";
import type { StepObserver } from "../steps/driver";
import { invariantViolations } from "./invariants";
import { PolicyRandom, randomAction } from "./random-policy";
import { SYNTHETIC_CARDS } from "./synthetic-cards";
import { contentCardDefinitions, contentDreamwellDefinitions } from "../content-catalog";

/** A recorded top-level action, enough to replay a game. */
export interface RecordedAction {
  readonly side: Side;
  readonly action: Action;
}

export interface FuzzGame {
  readonly init: BattleInit;
  readonly actions: readonly RecordedAction[];
  readonly result: BattleResult | null;
  readonly finalHash: StateHash;
  readonly steps: number;
  /** The first invariant violation, with the step that caused it. */
  readonly failure: string | null;
}

export const DECK_SIZE = 30;
/** Top-level actions after which a game counts as non-terminating. */
export const ACTION_CAP = 20000;

/** A random deck mixing synthetic cards and catalog cards (which play text-less). */
export function randomDeck(random: PolicyRandom): DeckEntry[] {
  const pool = [...SYNTHETIC_CARDS, ...contentCardDefinitions()].filter(
    (card) => card.cost !== null,
  );
  return Array.from({ length: DECK_SIZE }, () => ({ cardId: random.pick(pool).id }));
}

export function fuzzInit(seed: BattleSeed): BattleInit {
  const random = new PolicyRandom(battleSeed(`decks|${seed}`));
  return {
    seed,
    scoreToWin: 25,
    startingSide: random.next() < 0.5 ? "player" : "enemy",
    decks: { player: randomDeck(random), enemy: randomDeck(random) },
    dreamwell: contentDreamwellDefinitions().map((card) => card.id),
  };
}

/** Plays one seeded game with the Random policy on both sides, checking invariants after every step. */
export function playFuzzGame(engine: Engine, seed: BattleSeed): FuzzGame {
  const init = fuzzInit(seed);
  const policy = new PolicyRandom(battleSeed(`policy|${seed}`));
  let steps = 0;
  let failure: string | null = null;
  const observe: StepObserver = (state, step) => {
    steps += 1;
    if (failure === null) {
      const problems = invariantViolations(state, engine.catalog);
      if (problems.length > 0) {
        failure = `after step ${step.kind} (#${String(steps)}): ${problems.join("; ")}`;
      }
    }
  };
  let state: BattleState = engine.createBattle(init, NO_PROMPTS, observe).state;
  const actions: RecordedAction[] = [];
  while (state.result === null && failure === null) {
    const pending = engine.decision(state);
    if (pending === null) {
      failure = "no decision and no result";
      break;
    }
    if (actions.length >= ACTION_CAP) {
      failure = `no result after ${String(ACTION_CAP)} actions`;
      break;
    }
    const action = randomAction(engine.legalActions(state, pending.side), policy);
    actions.push({ side: pending.side, action });
    state = engine.apply(state, pending.side, action, NO_PROMPTS, observe).state;
  }
  return { init, actions, result: state.result, finalHash: stateHash(state), steps, failure };
}

/** Replays a recorded game and returns its final state hash. */
export function replayFinalHash(
  engine: Engine,
  init: BattleInit,
  actions: readonly RecordedAction[],
): StateHash {
  let state = engine.createBattle(init, NO_PROMPTS).state;
  for (const { side, action } of actions) {
    state = engine.apply(state, side, action, NO_PROMPTS).state;
  }
  return stateHash(state);
}
