/**
 * Determinization (D22) of a battle with a loop on offer or being repeated
 * (rules § Optional Loops): a sample offers the deciding side the loop its
 * view shows and repeats it as the battle would, without the recording
 * reaching a side the view withholds it from.
 */
import { describe, expect, it } from "vitest";
import { activate, board, deck, engine, offer, sourceOf } from "../loops/loops.fixtures";
import type { LoopAction } from "../loops/types";
import { PolicyRandom } from "../policy/random";
import type { CardId, Side } from "../state/ids";
import { battleSeed, SIDES } from "../state/ids";
import type { BattleState } from "../state/types";
import { nextAutomaticStep, runToDecision } from "../steps/driver";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { LOOP } from "../testing/loop-cards";
import type { Decklists } from "./determinize";

function seeded(label: string): () => number {
  const random = new PolicyRandom(battleSeed(label));
  return () => random.next();
}

function decklists(player: readonly CardId[]): Decklists {
  return { player: [...player, ...deck].map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) };
}

/** `side`'s determinization of `state`. */
function sample(state: BattleState, side: Side, lists: Decklists, label = "loop"): BattleState {
  return engine.determinize(engine.view(state, side), lists, seeded(`${label}|${side}`));
}

/** A free "Gain 1⍟" activation taken once, which puts its loop on offer. */
function freePointsOffered() {
  const { state, ids } = board({ player: { back: [LOOP.freePoints.id], deck, hand: [LOOP.freeChoice.id] }, enemy: { deck, hand: [LOOP.freePoints.id] }, scoreToWin: 10 });
  return { state: activate(state, sourceOf(ids.player)).state, lists: decklists([LOOP.freePoints.id, LOOP.freeChoice.id]) };
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

  it.each(Object.entries(OFFERS))("repeats the loop in the deciding side's sample as in the battle: %s", (_name, offered) => {
    const { state, lists } = offered();
    const loop = offer(state);
    if (loop === undefined) throw new Error("no loop on offer");
    const real = engine.apply(state, "player", loop, NO_PROMPTS).state;
    const simulated = engine.apply(sample(state, "player", lists), "player", loop, NO_PROMPTS).state;
    expect(real.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(simulated.result).toEqual(real.result);
    expect(simulated.sides.player.score).toBe(real.sides.player.score);
  });

  it("shows the recording only to the side that may repeat it", () => {
    const { state } = freeChoiceOffered();
    expect(engine.view(state, "player").loop?.recording).toEqual(state.loops.candidate?.actions);
    expect(engine.view(state, "enemy").loop).toEqual({ id: state.loops.candidate?.id, side: "player", run: null });
  });

  it("withholds a recording that names a card its side cannot identify, and still offers the loop in a sample", () => {
    const { state, lists } = freePointsOffered();
    const candidate = state.loops.candidate;
    const hidden = state.sides.enemy.hand[0];
    if (candidate === null || hidden === undefined) throw new Error("no loop on offer");
    const naming: LoopAction = { steps: [{ step: { kind: "play", card: hidden, from: "hand" }, answers: [] }] };
    const withheld: BattleState = { ...state, loops: { ...state.loops, candidate: { ...candidate, actions: [naming] } } };
    const seen = engine.view(withheld, "player");
    expect(seen.loop).toEqual({ id: candidate.id, side: "player", run: null });
    expect(JSON.stringify(seen)).not.toContain(`"${hidden}"`);
    const sampled = engine.determinize(seen, lists, seeded("withheld"));
    expect(engine.legalActions(sampled, "player")).toEqual(engine.legalActions(withheld, "player"));
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
