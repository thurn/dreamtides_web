import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, discardCost, event, everyIn } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ArrangeAnswer, Prompt } from "../../../prompts/types";
import { cloneState } from "../../../state/clone";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { discard, discardRandom } from "../discard";
import { gainEnergy } from "../gain-energy";
import { optional } from "../optional";
import { putFromTop } from "../put-in-deck";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { deck, v } from "./cards-support";

const eventCard = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  id: syntheticId(0x6500 + index), cardType: "event", costs: [], spark: null,
  subtype: "", speed: "standard", status: "authored", abilities: () => [event(effect)],
});
const discardTwo = eventCard(1, discard(2));
const shuffleTwo = eventCard(2, shuffleInto([everyIn("void")], { chooseFromHand: 2 }));
const arrangeTwo = eventCard(3, putFromTop(2, [{ to: "top", count: 2 }]));
const randomTwo = eventCard(4, discardRandom(2));
const discardThenConfirm = eventCard(5, sequence(discard(2), optional(gainEnergy(1))));
const costSelection: EngineCardDefinition = {
  id: syntheticId(0x6506), cardType: "character", costs: [], spark: 1,
  subtype: "", speed: "standard", status: "authored",
  abilities: () => [activated([discardCost(2)], gainEnergy(1))],
};
const engine = createEngine(testCatalog([discardTwo, shuffleTwo, arrangeTwo, randomTwo, discardThenConfirm, costSelection]));

class SelectingSource implements AnswerSource {
  readonly prompts: Prompt[] = [];
  readonly values: Answer[] = [];
  constructor(private readonly reverse: boolean) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseCards") throw new Error(`Unexpected ${prompt.kind}`);
    const value = [prompt.candidates[0], prompt.candidates[2]];
    if (this.reverse) value.reverse();
    this.values.push(value);
    return value;
  }
}

function setup(card: EngineCardDefinition, side: Side = "player"): BoardSetup {
  return {
    active: side, phase: "day",
    [side]: { hand: [card.id, v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], void: [v.vanilla2.id], deck },
    [side === "player" ? "enemy" : "player"]: { deck },
  };
}

function selectedPlay(card: EngineCardDefinition, reverse: boolean, side: Side = "player") {
  const { state, ids } = boardState(engine.catalog, setup(card, side));
  const source = new SelectingSource(reverse);
  const result = engine.apply(state, side, playFromHand(ids, side).action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { start: state, ids, source, ...result };
}

function recordedValues(state: BattleState): readonly Answer[] {
  return state.loops.actions.flatMap(action => action.steps.flatMap(step => step.answers.map(answer => answer.value)));
}

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful fold intent");
  return outcome.slice;
}

describe("selection order contracts", () => {
  for (const side of ["player", "enemy"] as const) {
    it(`discards a chosen set in hand candidate order with equal full state and events for ${side}`, () => {
      const forward = selectedPlay(discardTwo, false, side);
      const reversed = selectedPlay(discardTwo, true, side);
      expect(reversed.events).toEqual(forward.events);
      expect(stateHash(reversed.state)).toBe(stateHash(forward.state));
      const selected = [forward.ids[side].hand[1], forward.ids[side].hand[3]];
      expect(forward.events.filter(event => event.kind === "discarded").map(event => event.instance)).toEqual(selected);
      expect(forward.state.sides[side].hand).toEqual([forward.ids[side].hand[2]]);
      expect(forward.ids[side].hand[1]).not.toBe(forward.ids[side].hand[3]);
    });

    it(`shuffles named cards then a hand set in candidate order with equal full state and events for ${side}`, () => {
      const forward = selectedPlay(shuffleTwo, false, side);
      const reversed = selectedPlay(shuffleTwo, true, side);
      expect(reversed.events).toEqual(forward.events);
      expect(stateHash(reversed.state)).toBe(stateHash(forward.state));
      const shuffled = forward.events.find(event => event.kind === "shuffledIntoDeck");
      expect(shuffled).toMatchObject({ cards: [forward.ids[side].void[0], forward.ids[side].hand[1], forward.ids[side].hand[3]] });
      expect(forward.state.sides[side].hand).toEqual([forward.ids[side].hand[2]]);
    });
  }

  it("records automatic selection answers canonically without mutating submitted or raw step answers", () => {
    const forward = selectedPlay(discardTwo, false);
    const reversed = selectedPlay(discardTwo, true);
    expect(reversed.state.loops.actions).toEqual(forward.state.loops.actions);
    const submitted = reversed.source.values[0];
    expect(reversed.answers.find(answer => Array.isArray(answer.value))?.value).toEqual(submitted);
    expect(submitted).toEqual([reversed.ids.player.hand[3], reversed.ids.player.hand[1]]);
    expect(recordedValues(reversed.state)).toEqual([[reversed.ids.player.hand[1], reversed.ids.player.hand[3]].sort()]);
  });

  it("records top-level cost selections canonically while retaining raw answer fingerprints and metadata", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { back: [costSelection.id], hand: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck },
    });
    const source = ids.player.back[0];
    if (source === null) throw new Error("Missing activated source");
    const choices = [ids.player.hand[0], ids.player.hand[2]];
    const forward = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, new ScriptedSource([choices]));
    const reversedChoices = [...choices].reverse();
    const reversed = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, new ScriptedSource([reversedChoices]));
    expect(reversed.state.loops.actions).toEqual(forward.state.loops.actions);
    const recorded = reversed.state.loops.actions[0]?.steps[0]?.answers[0];
    expect(recorded).toEqual({ ...reversed.answers[0], value: [...choices].sort() });
    expect(reversed.answers[0]?.value).toEqual(reversedChoices);
  });

  it("preserves forced selection metadata in automatic history", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [discardTwo.id, v.vanilla1.id, v.vanilla1.id], deck }, enemy: { deck },
    });
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
    expect(result.answers).toHaveLength(1);
    expect(result.answers[0]?.auto).toBe(true);
    const recorded = result.state.loops.actions.flatMap(action => action.steps.flatMap(step => step.answers));
    expect(recorded).toEqual(result.answers.map(answer => ({ ...answer, value: ids.player.hand.slice(1).sort() })));
  });

  it("retains ordered arrangement answers and their distinct deck order in automatic history", () => {
    const { state, ids } = boardState(engine.catalog, setup(arrangeTwo));
    const answer: ArrangeAnswer = ids.player.deck.slice(0, 2).map(card => ({ card, to: "top" }));
    const forward = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([answer]));
    const backward = [...answer].reverse();
    const reversed = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([backward]));
    expect(forward.state.sides.player.deck.slice(0, 2)).toEqual(ids.player.deck.slice(0, 2));
    expect(reversed.state.sides.player.deck.slice(0, 2)).toEqual(ids.player.deck.slice(0, 2).reverse());
    expect(stateHash(reversed.state)).not.toBe(stateHash(forward.state));
    expect(recordedValues(forward.state)).toEqual([answer]);
    expect(recordedValues(reversed.state)).toEqual([backward]);
  });

  it("retains random discard draw order and its independent stream", () => {
    const { state, ids } = boardState(engine.catalog, setup(randomTwo));
    const run = (start: BattleState) => engine.apply(start, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
    const baseline = run(state);
    const unrelated = cloneState(state);
    unrelated.rng["shuffle:enemy"] = 123;
    const other = run(unrelated);
    const discarded = baseline.events.filter(event => event.kind === "discarded").map(event => event.instance);
    expect(discarded).toHaveLength(2);
    expect(new Set(discarded).size).toBe(2);
    expect(discarded.every(id => ids.player.hand.slice(1).includes(id))).toBe(true);
    expect(other.events).toEqual(baseline.events);
    expect(baseline.state.rng["random:discard"]).toBe(2);
    expect(other.state.rng["shuffle:enemy"]).toBe(123);
    expect(baseline.answers).toEqual([]);
    expect(baseline.state.sides.player.void.filter(id => discarded.includes(id))).toEqual([...discarded].reverse());
  });

  it("reconstructs a serialized selected prefix at the following prompt and commits equivalent sets once", () => {
    const { state, ids } = boardState(engine.catalog, setup(discardThenConfirm));
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const first = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const prompt = fold.pending(first)?.prompt;
    if (prompt === undefined) throw new Error("Missing discard selection");
    const finish = (chosen: readonly InstanceId[]) => {
      const selected = applied(fold.reduce(first, { kind: "answer", side: "player", promptId: prompt.id, value: chosen }));
      const saved = JSON.parse(JSON.stringify(selected)) as BattleSlice;
      const reload = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(reload.pending(saved)).toEqual(fold.pending(selected));
      expect(stateHash(saved.committed)).toBe(stateHash(first.committed));
      const confirmation = reload.pending(saved)?.prompt;
      if (confirmation?.kind !== "confirm") throw new Error("Missing following confirmation");
      const result = reload.reduce(saved, { kind: "answer", side: "player", promptId: confirmation.id, value: true });
      const done = applied(result);
      expect(reload.reduce(done, { kind: "answer", side: "player", promptId: confirmation.id, value: true })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      return done;
    };
    const choices = [ids.player.hand[1], ids.player.hand[3]];
    expect(stateHash(finish([...choices].reverse()).committed)).toBe(stateHash(finish(choices).committed));
  });
});
