/**
 * Determinization (D22) of a battle with a loop on offer or being repeated
 * (rules § Optional Loops): a sample offers the deciding side the loop its
 * view shows and repeats it as the battle would when the view shows its
 * recording, refuses to repeat it when the view withholds the recording, and
 * starts loop detection afresh, without the recording, or any prompt
 * fingerprint in it, reaching a view that may not see it.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { characterYouControl, energy, target } from "../dsl/builders";
import { triggered, whenOpponentPlays } from "../dsl/triggers";
import * as p from "../effects/primitives";
import { createEngine, type Engine } from "../engine";
import { activate, board, deck, engine, offer, sourceOf, v } from "../loops/loops.fixtures";
import { UnknownLoopRecording } from "../loops/replay";
import { PolicyRandom } from "../policy/random";
import type { CardId, Side } from "../state/ids";
import { battleSeed, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import { boardState } from "../testing/board";
import { nextAutomaticStep, runToDecision } from "../steps/driver";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { CYCLE, LOOP, LOOP_CARDS } from "../testing/loop-cards";
import { syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { Decklists } from "./determinize";

function seeded(label: string): () => number {
  const random = new PolicyRandom(battleSeed(label));
  return () => random.next();
}

function decklists(player: readonly CardId[], enemy: readonly CardId[] = []): Decklists {
  return { player: [...player, ...deck].map((cardId) => ({ cardId })), enemy: [...enemy, ...deck].map((cardId) => ({ cardId })) };
}

/** `side`'s determinization of `state`. */
function sample(state: BattleState, side: Side, lists: Decklists, label = "loop", over: Engine = engine): BattleState {
  return over.determinize(over.view(state, side), lists, seeded(`${label}|${side}`));
}

/** A free "Gain 1⍟" activation taken once, which puts its loop on offer. */
function freePointsOffered() {
  const { state, ids } = board({ player: { back: [LOOP.freePoints.id], deck, hand: [LOOP.freeChoice.id] }, enemy: { deck, hand: [LOOP.freePoints.id] }, scoreToWin: 10 });
  return { state: activate(state, sourceOf(ids.player)).state, lists: decklists([LOOP.freePoints.id, LOOP.freeChoice.id], [LOOP.freePoints.id]) };
}

/** A free "Choose one: Gain 1⍟; or gain 1●." activation answered with points, which puts its loop on offer. */
function freeChoiceOffered() {
  const { state, ids } = board({ player: { back: [LOOP.freeChoice.id], deck }, enemy: { deck }, scoreToWin: 10 });
  return { state: activate(state, sourceOf(ids.player), new ScriptedSource([0])).state, lists: decklists([LOOP.freeChoice.id]) };
}

/** A free bouncer played from hand once: a loop of plays, resolutions, and triggers. */
function bouncerOffered() {
  const { state, ids } = board({ player: { hand: [LOOP.bouncer.id], deck }, enemy: { deck }, scoreToWin: 10 });
  const card = ids.player.hand[0];
  if (card === undefined) throw new Error("no card");
  return { state: engine.apply(state, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS).state, lists: decklists([LOOP.bouncer.id]) };
}

const OFFERS = { freePoints: freePointsOffered, freeChoice: freeChoiceOffered, bouncer: bouncerOffered };

/** Loops with no prompt in their recording, which the side that may repeat them sees. */
const SEEN = { freePoints: freePointsOffered, bouncer: bouncerOffered };

/**
 * "When the opponent plays a card, exhaust target character you control." —
 * working from its owner's hand, so its forced prompt names a source hidden
 * from the opponent. Two printings, alike but for their ids.
 */
function watcher(index: number): EngineCardDefinition {
  return {
    id: syntheticId(0xd30 + index),
    cardType: "character",
    costs: [energy(1)],
    spark: 1,
    subtype: "Warrior",
    speed: "standard",
    status: "authored",
    abilities: () => [triggered(whenOpponentPlays(), p.exhaust(target(characterYouControl())), { zone: "hand" })],
  };
}

const WATCHERS = [watcher(0), watcher(1)] as const;

const watched = createEngine(testCatalog([...LOOP_CARDS, ...WATCHERS]));

/**
 * The bouncer loop while the enemy holds `watcher` in hand: each play
 * triggers it, and the enemy's target prompt is forced, since it controls
 * one character. Played twice, so the second play is the loop on offer.
 */
function watchedOffered(watcherCard: EngineCardDefinition) {
  const { state } = boardState(watched.catalog, {
    active: "player",
    phase: "day",
    scoreToWin: 10,
    player: { hand: [LOOP.bouncer.id], deck },
    enemy: { hand: [watcherCard.id], back: [v.vanilla1.id], deck },
  });
  let current = state;
  for (let play = 0; play < 2; play++) {
    const card = current.sides.player.hand[0];
    if (card === undefined) throw new Error("no card");
    current = watched.apply(current, "player", { kind: "play", card, from: "hand" }, NO_PROMPTS).state;
  }
  return { state: current, lists: decklists([LOOP.bouncer.id], WATCHERS.map((card) => card.id)) };
}

/** Every recorded answer of the loop on offer in `state`. */
function recordedAnswers(state: BattleState) {
  return (state.loops.candidate?.actions ?? []).flatMap((action) => action.steps.flatMap((step) => step.answers));
}

describe("determinize with a loop on offer", () => {
  it.each(Object.entries(OFFERS))("gives each side the legal actions and loop it sees: %s", (_name, offered) => {
    const { state, lists } = offered();
    expect(offer(state)).toBeDefined();
    for (const side of SIDES) {
      const sampled = sample(state, side, lists);
      expect(engine.legalActions(sampled, side)).toEqual(engine.legalActions(state, side));
      expect(engine.view(sampled, side).loop).toEqual(engine.view(state, side).loop);
    }
  });

  it.each(Object.entries(SEEN))("repeats the loop in the deciding side's sample as in the battle: %s", (_name, offered) => {
    const { state, lists } = offered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no loop on offer");
    const real = engine.apply(state, "player", loop, NO_PROMPTS).state;
    const simulated = engine.apply(sample(state, "player", lists), "player", loop, NO_PROMPTS).state;
    expect(real.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(simulated.result).toEqual(real.result);
    expect(simulated.sides.player.score).toBe(real.sides.player.score);
  });

  it("shows a recording without prompts only to the side that may repeat it", () => {
    const { state } = freePointsOffered();
    expect(engine.view(state, "player").loop?.recording).toEqual(state.loops.candidate?.actions);
    expect(engine.view(state, "enemy").loop).toEqual({ id: state.loops.candidate?.id, side: "player", run: null });
  });

  it("starts the detection history and the mandatory-cycle mark empty", () => {
    const { state, lists } = freePointsOffered();
    expect(state.loops.checkpoints.length).toBeGreaterThan(0);
    for (const side of SIDES) {
      const { loops } = sample(state, side, lists);
      expect({ scope: loops.scope, checkpoints: loops.checkpoints, actions: loops.actions, cycle: loops.cycle }).toEqual({
        scope: null,
        checkpoints: [],
        actions: [],
        cycle: null,
      });
    }
  });

  it("detects the next loop from the sampled state once the sample diverges from the offer", () => {
    const { state, lists } = freePointsOffered();
    const source = state.sides.player.backRank[0];
    if (source == null) throw new Error("no source");
    const again = { kind: "activate", source, ability: 0 } as const;
    const real = engine.apply(state, "player", again, NO_PROMPTS).state;
    const simulated = engine.apply(sample(state, "player", lists), "player", again, NO_PROMPTS).state;
    expect(real.loops.candidate?.id).not.toBe(state.loops.candidate?.id);
    expect(engine.legalActions(simulated, "player")).toEqual(engine.legalActions(real, "player"));
    expect(engine.view(simulated, "player").loop).toEqual(engine.view(real, "player").loop);
  });

  it("detects a mandatory cycle from the sampled state once the sample diverges from the offer", () => {
    const { state, ids } = board({ player: { back: [LOOP.freePoints.id], hand: [CYCLE.echo.id], energy: 1, deck }, enemy: { deck }, scoreToWin: 10 });
    const offered = activate(state, sourceOf(ids.player)).state;
    const card = ids.player.hand[0];
    if (card === undefined || offer(offered) === undefined) throw new Error("no loop on offer");
    const play = { kind: "play", card, from: "hand" } as const;
    const real = engine.apply(offered, "player", play, NO_PROMPTS).state;
    const sampled = sample(offered, "player", decklists([LOOP.freePoints.id, CYCLE.echo.id]));
    const simulated = engine.apply(sampled, "player", play, NO_PROMPTS).state;
    expect(real.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(simulated.result).toEqual(real.result);
    expect(simulated.automaticSteps).toBe(real.automaticSteps);
  });

  it("continues a repetition in progress", () => {
    const { state, lists } = freePointsOffered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no loop on offer");
    const steps: BattleState[] = [];
    const real = engine.apply(state, "player", loop, NO_PROMPTS, (next) => steps.push(next)).state;
    const running = steps.find((step) => step.loops.run !== null && step.loops.run.iterations > 0);
    if (running === undefined) throw new Error("no repetition in progress");
    for (const side of SIDES) {
      const sampled = sample(running, side, lists);
      expect(sampled.loops.run).toEqual(running.loops.run);
      expect(engine.view(sampled, side).loop).toEqual(engine.view(running, side).loop);
    }
    const next = nextAutomaticStep(running, engine.catalog, engine.memo);
    expect(next).toEqual({ kind: "loopIteration" });
    const continued = runToDecision(sample(running, "player", lists), { kind: "loopIteration" }, NO_PROMPTS, engine.catalog, engine.memo, undefined, true).state;
    expect(continued.result).toEqual(real.result);
    expect(continued.sides.player.score).toBe(real.sides.player.score);
  });
});

describe("determinize with a loop whose recording answered a prompt", () => {
  const WITHHELD = {
    "the actor's mode choice": () => ({ ...freeChoiceOffered(), over: engine }),
    "the opponent's forced prompt from a card in hand": () => ({ ...watchedOffered(WATCHERS[0]), over: watched }),
  };

  it.each(Object.entries(WITHHELD))("offers the loop in a sample but refuses to repeat it there: %s", (_name, offered) => {
    const { state, lists, over } = offered();
    const loop = over.legalActions(state, "player").find((action) => action.kind === "repeatLoop");
    if (loop === undefined) throw new Error("no loop on offer");
    expect(recordedAnswers(state).length).toBeGreaterThan(0);
    expect(over.view(state, "player").loop).toEqual({ id: loop.loop, side: "player", run: null });
    const real = over.apply(state, "player", loop, NO_PROMPTS).state;
    expect(real.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    const sampled = sample(state, "player", lists, "withheld", over);
    expect(over.legalActions(sampled, "player")).toEqual(over.legalActions(state, "player"));
    expect(() => over.apply(sampled, "player", loop, NO_PROMPTS)).toThrow(UnknownLoopRecording);
  });

  it("gives the side that may repeat the loop the same view whichever hidden card asked the opponent's forced prompt", () => {
    const [first, second] = WATCHERS.map((card) => watchedOffered(card).state);
    if (first === undefined || second === undefined) throw new Error("no battles");
    expect(recordedAnswers(first).map((answer) => answer.fingerprint)).not.toEqual(recordedAnswers(second).map((answer) => answer.fingerprint));
    const seen = watched.view(first, "player");
    expect(seen.loop).not.toBeNull();
    expect(watched.view(second, "player")).toEqual(seen);
    for (const answer of recordedAnswers(first)) expect(JSON.stringify(seen)).not.toContain(answer.fingerprint);
  });
});
