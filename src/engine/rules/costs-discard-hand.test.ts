/**
 * "Discard your hand" as a cost (RD-hv-umm2.334-1): legality with a full and
 * an empty hand, the exact cards discarded, disjointness from the played
 * card and earlier costs, other costs beside it, a preceding prompt's
 * reload and cancellation, rollback, and the policies.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import {
  abandonSelfCost,
  activated,
  additionalCost,
  choiceCost,
  countersCost,
  discardCost,
  discardHandCost,
  energy,
  event,
  exhaustSelf,
  optionalCost,
  revealCost,
} from "../dsl/builders";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { runPolicy } from "../policy/decide";
import type { PolicyId } from "../policy/types";
import type { Answer, ChooseCardsPrompt } from "../prompts/types";
import { battleSeed, type InstanceId, type Side } from "../state/ids";
import { stateHash } from "../state/hash";
import type { BattleState } from "../state/types";
import type { Step } from "../steps/kinds";
import { runStep } from "../steps/runner";
import { ScriptedSource } from "../steps/sources";
import { boardState, cardIdOf, type SideSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { Action } from "./actions";
import { payCosts, planCosts } from "./costs";

function fixture(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x3340 + index),
    cardType,
    costs: [energy(0)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const HAND = {
  /** "☾, Discard your hand, abandon this character: Gain 3●." */
  catalyst: fixture(0, "character", () => [activated([exhaustSelf(), discardHandCost(), abandonSelfCost()], p.gainEnergy(3))]),
  /** "1⧗, Discard your hand: Draw 2 cards." */
  counters: fixture(1, "character", () => [activated([countersCost(1), discardHandCost()], p.draw(2))]),
  /** "To play this event, discard your hand. Gain 1⍟." */
  event: fixture(2, "event", () => [additionalCost(discardHandCost()), event(p.gainPoints(1))]),
  /** "To play this event, discard a card, then discard your hand. Gain 1⍟." */
  chosenFirst: fixture(3, "event", () => [additionalCost(discardCost(1), discardHandCost()), event(p.gainPoints(1))]),
  /** "To play this event, reveal an event, then discard your hand. Gain 1⍟." */
  revealFirst: fixture(4, "event", () => [additionalCost(revealCost(1, { cardType: "event" }), discardHandCost()), event(p.gainPoints(1))]),
  /** A hand cost after a whole-hand discard has no card left. */
  handThenDiscard: fixture(5, "event", () => [additionalCost(discardHandCost(), discardCost(1)), event(p.gainPoints(1))]),
  /** The same order as an optional cost, and as an alternative to 1●. */
  optionalThenDiscard: fixture(6, "event", () => [additionalCost(optionalCost(discardHandCost(), discardCost(1))), event(p.gainPoints(1))]),
  choiceThenDiscard: fixture(7, "event", () => [additionalCost(choiceCost([discardHandCost(), discardCost(1)], [energy(1)])), event(p.gainPoints(1))]),
} as const satisfies Record<string, EngineCardDefinition>;

const v = SYNTHETIC;
const engine = createEngine(testCatalog(Object.values(HAND)));
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];

/** The enemy holds an Interrupt, so the played item waits on the stack. */
function board(player: SideSetup) {
  return boardState(engine.catalog, {
    active: "player",
    phase: "day",
    player: { deck, ...player },
    enemy: { deck, hand: [v.interruptEvent.id], energy: 5 },
  });
}

function run(state: BattleState, action: Action, answers: readonly Answer[] = [], side: Side = "player") {
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, action, source);
  source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}

const legal = (state: BattleState, side: Side = "player") => engine.legalActions(state, side);
const play = (card: InstanceId): Action => ({ kind: "play", card, from: "hand" });
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
const discards = (events: readonly EngineEvent[]) =>
  events.flatMap((event) => (event.kind === "discarded" ? [event.instance] : []));

function appliedSlice(outcome: ReturnType<ReturnType<typeof createFoldAdapter>["reduce"]>): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}

describe("discard your hand as a cost", () => {
  it("pays with a full or an empty hand, discarding exactly the hand beside ☾ and abandon, with no prompt", () => {
    for (const size of [0, 1, 3]) {
      const { state, ids } = board({ back: [HAND.catalyst.id], hand: Array.from({ length: size }, () => v.vanilla1.id), energy: 0 });
      const source = ids.player.back[0]!;
      const action: Action = { kind: "activate", source, ability: 0 };
      expect(legal(state)).toContainEqual(action);
      const paid = run(state, action);
      expect(discards(paid.events)).toEqual(ids.player.hand);
      expect(paid.state.sides.player.hand).toEqual([]);
      expect(paid.state.sides.player.void).toEqual(expect.arrayContaining([...ids.player.hand, source]));
      expect(paid.state.sides.player.void).toHaveLength(size + 1);
      // Discarded cards are public in the void; nothing else of the hand was disclosed.
      const seen = engine.view(paid.state, "enemy");
      for (const id of ids.player.hand) expect(seen.instances[id]).toBeDefined();
      expect(seen.sides.player.hand).toMatchObject({ count: 0 });
      const resolved = run(paid.state, { kind: "pass" }, [], "enemy");
      expect(resolved.state.sides.player.currentEnergy).toBe(3);
    }
  });

  it("is unpayable when another cost is: an exhausted source, a front-rank source, or missing counters", () => {
    const exhausted = board({ back: [HAND.catalyst.id], hand: [v.vanilla1.id] });
    exhausted.state.instances[exhausted.ids.player.back[0]!].status.exhausted = true;
    expect(legal(exhausted.state).filter((action) => action.kind === "activate")).toEqual([]);
    const front = board({ front: [HAND.catalyst.id], hand: [] });
    expect(legal(front.state).filter((action) => action.kind === "activate")).toEqual([]);
    for (const counters of [0, 1]) {
      const { state, ids } = board({ back: [HAND.counters.id], hand: [v.vanilla1.id, v.event1.id] });
      const source = ids.player.back[0]!;
      state.instances[source].status.counters = counters;
      const action: Action = { kind: "activate", source, ability: 0 };
      expect(legal(state).filter((candidate) => candidate.kind === "activate")).toEqual(counters === 0 ? [] : [action]);
      if (counters === 1) {
        const paid = run(state, action);
        expect(paid.state.instances[source].status.counters).toBe(0);
        expect(discards(paid.events)).toEqual(ids.player.hand);
      }
    }
  });

  it("never discards the card being played, and plays it with no other card in hand", () => {
    for (const size of [0, 2]) {
      const { state, ids } = board({ hand: [HAND.event.id, ...Array.from({ length: size }, () => v.vanilla2.id)] });
      const [card, ...rest] = ids.player.hand;
      expect(legal(state)).toContainEqual(play(card));
      const paid = run(state, play(card));
      expect(discards(paid.events)).toEqual(rest);
      expect(paid.state.stack[0]).toMatchObject({ kind: "card", instance: card });
      expect(paid.state.sides.player.hand).toEqual([]);
    }
  });

  it("takes only the cards an earlier chosen discard or reveal left, each discarded once", () => {
    const chosen = board({ hand: [HAND.chosenFirst.id, v.vanilla1.id, v.vanilla2.id, v.event1.id] });
    const [card, first, ...rest] = chosen.ids.player.hand;
    const paid = run(chosen.state, play(card), [[first]]);
    expect(discards(paid.events)).toEqual([first, ...rest]);
    const lone = board({ hand: [HAND.chosenFirst.id, v.vanilla1.id] });
    expect(discards(run(lone.state, play(lone.ids.player.hand[0])).events)).toEqual([lone.ids.player.hand[1]]);
    const short = board({ hand: [HAND.chosenFirst.id] });
    expect(legal(short.state)).not.toContainEqual(play(short.ids.player.hand[0]));

    const revealed = board({ hand: [HAND.revealFirst.id, v.event1.id, v.vanilla1.id] });
    const [revealer, shown, other] = revealed.ids.player.hand;
    const result = run(revealed.state, play(revealer));
    expect(result.events).toContainEqual({ kind: "revealed", side: "player", instances: [shown] });
    expect(discards(result.events)).toEqual([other]);
    expect(result.state.sides.player.hand).toEqual([shown]);
  });

  it("leaves a later hand cost no card, alone, as an optional cost, or as an alternative", () => {
    for (const size of [0, 1, 3]) {
      const filler = Array.from({ length: size }, () => v.vanilla1.id);
      const after = board({ hand: [HAND.handThenDiscard.id, ...filler] });
      expect(legal(after.state)).not.toContainEqual(play(after.ids.player.hand[0]));
      const optional = board({ hand: [HAND.optionalThenDiscard.id, ...filler] });
      const declined = run(optional.state, play(optional.ids.player.hand[0]));
      // The optional cost is never offered, not merely narrowed to declining.
      expect(declined.answers).toEqual([]);
      expect(declined.state.stack[0]).toMatchObject({ optionalPaid: [false] });
      expect(discards(declined.events)).toEqual([]);
      for (const funds of [0, 1]) {
        const choice = board({ hand: [HAND.choiceThenDiscard.id, ...filler], energy: funds });
        const card = choice.ids.player.hand[0];
        expect(legal(choice.state).some((action) => action.kind === "play" && action.card === card)).toBe(funds === 1);
        if (funds === 1) {
          const paid = run(choice.state, play(card));
          expect(paid.state.sides.player.currentEnergy).toBe(0);
          expect(discards(paid.events)).toEqual([]);
        }
      }
    }
  });

  it("keeps a preceding prompt stable through reload, rejects invalid and partial answers, and cancels to the committed state", () => {
    const { state, ids } = board({ hand: [HAND.chosenFirst.id, v.vanilla1.id, v.vanilla2.id, v.event1.id] });
    const [card, a, b, c] = ids.player.hand;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(card) }));
    const pending = fold.pending(opened)!;
    const prompt = pending.prompt as ChooseCardsPrompt;
    const promptId = pending.prompt.id;
    expect(prompt).toMatchObject({ kind: "chooseCards", min: 1, max: 1, cancellable: true, purpose: { role: "discardCost" } });
    expect(prompt.candidates).toEqual([a, b, c]);
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    expect(createFoldAdapter(createEngine(engine.catalog)).pending(saved)).toEqual(pending);
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    const answer = (value: Answer, side: Side = "player") => fold.reduce(opened, { kind: "answer", side, promptId, value });
    for (const value of [[], [a, b], [card], [ids.enemy.hand[0]], [a, a]]) {
      expect(answer(value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(answer([a], "enemy")).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const cancelled = appliedSlice(fold.reduce(saved, { kind: "cancel", side: "player", promptId }));
    expect(cancelled.committed).toEqual(state);
    expect(cancelled.inFlight).toBeNull();
    const answered = appliedSlice(fold.reduce(saved, { kind: "answer", side: "player", promptId, value: [b] }));
    expect(answered.inFlight).toBeNull();
    expect(answered.committed.sides.player.hand).toEqual([]);
    expect(new Set(answered.committed.sides.player.void)).toEqual(new Set([a, b, c]));
  });

  it("rolls back every discard when rules code fails after paying, committing and publishing none", () => {
    const failing: EngineCardDefinition = {
      ...fixture(8, "event", () => []),
      synthetic: { play(ctx, source) {
        const plan = planCosts(ctx, "player", source, [discardCost(1), discardHandCost(), energy(1)], null, (role) => ({ source, cardId: cardIdOf(ctx.state, source), ability: 0, role }), [source]);
        ctx.commitPoint();
        payCosts(ctx, "player", source, plan);
        throw new Error("synthetic failure after payment");
      } },
    };
    const failingEngine = createEngine(testCatalog([failing]));
    const { state, ids } = boardState(failingEngine.catalog, { active: "player", phase: "day", player: { hand: [failing.id, v.vanilla1.id, v.vanilla2.id], energy: 1, deck }, enemy: { deck } });
    const [card, first, second] = ids.player.hand;
    const before = stateHash(state);
    const observed: EngineEvent[] = [];
    const step: Step = { kind: "play", card, from: "hand" };
    expect(() => runStep(state, step, new ScriptedSource([[first]]), failingEngine.catalog, { observeEvent: (event) => observed.push(event) })).toThrow("synthetic failure after payment");
    expect(discards(observed)).toEqual([first, second]);
    expect(stateHash(state)).toBe(before);

    const fold = createFoldAdapter(failingEngine);
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(card) }));
    const outcome = fold.reduce(opened, { kind: "answer", side: "player", promptId: fold.pending(opened)!.prompt.id, value: [first] });
    if (outcome.kind !== "applied") throw new Error("expected a failed attempted play");
    expect(outcome.error).not.toBeNull();
    expect(discards(outcome.published)).toEqual([]);
    expect(stateHash(outcome.slice.committed)).toBe(before);
    expect(outcome.slice.inFlight).toBeNull();
  });

  it("lets Greedy and Random weigh and take the activation without a prompt", () => {
    const { state, ids } = board({ back: [HAND.catalyst.id], hand: [v.vanilla1.id, v.vanilla2.id], energy: 0 });
    const action: Action = { kind: "activate", source: ids.player.back[0]!, ability: 0 };
    const decision = engine.decision(state)!;
    const decklists = {
      player: [...ids.player.back, ...ids.player.hand, ...ids.player.deck].map((id) => ({ cardId: cardIdOf(state, id!) })),
      enemy: [...ids.enemy.hand, ...ids.enemy.deck].map((id) => ({ cardId: cardIdOf(state, id) })),
    };
    for (const policy of ["greedy", "random"] as const satisfies readonly PolicyId[]) {
      // Greedy simulates each offered action in determinized samples; an unscored candidate failed to simulate.
      const offered: Action[] = policy === "greedy" ? [{ kind: "pass" }, action] : [action];
      expect(legal(state)).toEqual(expect.arrayContaining(offered));
      const result = runPolicy(engine, {
        policy, side: "player", key: `${state.version}:0:decision`, view: engine.view(state, "player"),
        decision: { kind: "topLevel", decision, legal: offered }, decklists, seed: battleSeed(`discard-hand|${policy}`), budget: { iterations: 64 },
      });
      if (policy === "greedy") {
        expect(result.trace.candidates.find((candidate) => JSON.stringify(candidate.choice) === JSON.stringify({ kind: "action", action }))?.visits).toBeGreaterThan(0);
      } else {
        expect(result.choice).toEqual({ kind: "action", action });
      }
      const fold = createFoldAdapter(engine);
      const taken = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
      expect(fold.pending(taken)).toBeNull();
      expect(taken.committed.sides.player.hand).toEqual([]);
    }
  });
});
