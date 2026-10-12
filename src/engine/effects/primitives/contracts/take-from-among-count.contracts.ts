import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { event, topOfDeck } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt, ConfirmPrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import type { CardId, InstanceId } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { greedyAnswer } from "../../../policy/prompts";
import { resolveEffect } from "../../interpreter";
import { banishCards } from "../banish-cards";
import { erode } from "../erode";
import { movedBy, opponentHand, takeFromAmong } from "../take-from-among";
import { v, deck, noDiscoverCosts } from "./cards-support";

/** "Look at the opponent's hand. Put two cards from it into your hand." */
const takeTwoFromOpponentHand: EngineCardDefinition = {
  id: syntheticId(972), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(takeFromAmong(opponentHand(), { count: 2 }))],
};

/** "Erode 4. You may put two of those cards into your hand," then throws: a step that fails after both cards are taken. */
const takeTwoThenFail: EngineCardDefinition = {
  ...takeTwoFromOpponentHand,
  id: syntheticId(973),
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, takeFromAmong(movedBy(erode(4)), { count: 2, optional: true }), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its two takes");
    },
  },
};

/** ❖ "Banish the top three cards of the opponent's deck." */
const banishOpponentTopThree: EngineCardDefinition = {
  ...v.interruptEvent,
  id: syntheticId(974),
  status: "authored",
  abilities: () => [event(banishCards([topOfDeck(3, {}, "opponent")]))],
};

/** An answer source that records every prompt it answers and answers it with `respond`. */
class RecordingSource implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly respond: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    return this.respond(prompt);
  }
}

/** Accepts a "you may" and takes the chooseCards candidates at `picks`. */
const acceptPicking = (...picks: readonly number[]) => (prompt: Prompt): Answer =>
  prompt.kind === "confirm" ? true : prompt.kind === "chooseCards" ? picks.map((index) => prompt.candidates[index]) : (() => { throw new Error(`unexpected ${prompt.kind} prompt`); })();

describe("takeFromAmong with a count", () => {
  const taking = createEngine(testCatalog([...DSL_CARDS, takeTwoFromOpponentHand, takeTwoThenFail, banishOpponentTopThree]));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };
  const handBoard = (card: CardId, enemyHand: readonly CardId[]): BoardSetup => ({
    active: "player", phase: "day", player: { hand: [card], deck }, enemy: { hand: enemyHand, deck },
  });
  const play = (setup: BoardSetup, source: AnswerSource) => {
    const { state, ids } = boardState(taking.catalog, setup);
    return { start: state, ids, result: taking.apply(state, "player", playFromHand(ids, "player").action, source) };
  };
  const takeTwoBoard = (playerDeck: readonly CardId[], card: CardId = DSL.erodeTakeTwo.id): BoardSetup => ({
    active: "player", phase: "day", player: { hand: [card], void: [v.vanilla1.id], deck: playerDeck }, enemy: { deck },
  });
  const fourDeep = [v.vanilla2.id, v.event0.id, v.vanilla3.id, v.vanilla0.id, v.vanilla5.id];

  it("builds a count of one as the single-card take and rejects a count that is not a positive whole number", () => {
    expect(takeFromAmong(opponentHand(), { count: 1 })).toEqual(takeFromAmong(opponentHand()));
    expect(takeFromAmong(opponentHand(), { count: 2 })).toMatchObject({ count: 2 });
    for (const count of [0, -1, 1.5, Number.NaN]) expect(() => takeFromAmong(opponentHand(), { count })).toThrow();
  });

  it("asks the \"you may\" first, then takes exactly that many of the moved cards, in the order moved, publicly", () => {
    const source = new RecordingSource(acceptPicking(0, 3));
    const { ids, result } = play(takeTwoBoard(fourDeep), source);
    const [confirm, choice] = source.prompts as [ConfirmPrompt, ChooseCardsPrompt];
    expect(source.prompts).toHaveLength(2);
    expect(confirm).toMatchObject({ kind: "confirm", side: "player", purpose: { role: "youMay", cardId: DSL.erodeTakeTwo.id } });
    expect(choice).toMatchObject({ kind: "chooseCards", side: "player", min: 2, max: 2, candidates: ids.player.deck.slice(0, 4) });
    expect(choice.privateTo).toBeUndefined();
    expect(choice.purpose.role).toBe("chooseAmong");
    const chosen = [ids.player.deck[0], ids.player.deck[3]];
    const { state, events } = result;
    expect(state.sides.player.hand).toEqual(chosen);
    expect([...state.sides.player.void].sort()).toEqual([ids.player.hand[0], ids.player.void[0], ids.player.deck[1], ids.player.deck[2]].sort());
    expect(state.sides.player.deck).toEqual(ids.player.deck.slice(4));
    const taken = events.filter((item) => item.kind === "cardTaken");
    expect(taken).toEqual(chosen.map((instance) => ({ kind: "cardTaken", side: "player", instance, from: "void", holder: "player" })));
    for (const item of taken) for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(item, viewer, state)).toEqual(item);
    expect(events.some((item) => item.kind === "cardDrawn")).toBe(false);
    expect(invariantViolations(state, taking.catalog)).toEqual([]);
  });

  it("treats the chosen cards as a set, taking them in the order offered whatever order the answer lists them", () => {
    for (const [setup, forward, reversed] of [
      [takeTwoBoard(fourDeep), [0, 3], [3, 0]],
      [handBoard(takeTwoFromOpponentHand.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]), [0, 2], [2, 0]],
    ] as const) {
      const inOrder = play(setup, new RecordingSource(acceptPicking(...forward)));
      const backward = play(setup, new RecordingSource(acceptPicking(...reversed)));
      expect(stateHash(backward.result.state)).toBe(stateHash(inOrder.result.state));
      expect(backward.result.state.loops.checkpoints).toEqual(inOrder.result.state.loops.checkpoints);
      expect(backward.result.events).toEqual(inOrder.result.events);
      expect(backward.result.state.sides.player.hand).toEqual(inOrder.result.state.sides.player.hand);
    }
  });

  it("resumes an opponent's Interrupt response into the \"you may\" and the choice, offering only the cards moved after it and taking all of them when fewer than the count remain", () => {
    const respondThenResolve = (playerDeck: readonly CardId[]) => {
      const fold = createFoldAdapter(taking, { checkEventPrefix: true });
      const { state, ids } = boardState(taking.catalog, {
        ...takeTwoBoard(playerDeck), enemy: { hand: [banishOpponentTopThree.id], energy: 1, deck },
      });
      let slice = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
        { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      expect(fold.pending(slice)).toBeNull();
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: "enemy", action: playFromHand(ids, "enemy").action }));
      for (let passes = 0; fold.pending(slice) === null; passes++) {
        const decision = taking.decision(slice.committed);
        if (decision === null || passes > 10) throw new Error("the take never prompted");
        slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
      }
      const confirm = fold.pending(slice)!;
      expect(confirm.prompt).toMatchObject({ kind: "confirm", side: "player", purpose: { role: "youMay", cardId: DSL.erodeTakeTwo.id } });
      expect([...confirm.display.sides.player.banished].sort()).toEqual(ids.player.deck.slice(0, 3).sort());
      expect(confirm.display.sides.enemy.void).toEqual(ids.enemy.hand);
      return { fold, ids, slice: applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: confirm.prompt.id, value: true })) };
    };

    // Three cards remain after the response: choose two of them.
    const six = respondThenResolve([...fourDeep, v.vanilla1.id]);
    const choice = six.fold.pending(six.slice)!;
    const remaining = six.ids.player.deck.slice(3);
    expect(choice.prompt).toMatchObject({ kind: "chooseCards", side: "player", min: 2, max: 2, candidates: remaining });
    const chosen = applied(six.fold.reduce(six.slice, { kind: "answer", side: "player", promptId: choice.prompt.id, value: [remaining[2], remaining[0]] }));
    expect(chosen.inFlight).toBeNull();
    expect(chosen.committed.stack).toEqual([]);
    expect(chosen.committed.sides.player.hand).toEqual([remaining[0], remaining[2]]);
    expect([...chosen.committed.sides.player.banished].sort()).toEqual(six.ids.player.deck.slice(0, 3).sort());
    expect(chosen.committed.sides.player.void).toContain(remaining[1]);
    expect(invariantViolations(chosen.committed, taking.catalog)).toEqual([]);

    // One card remains after the response: the take of two takes it without a choice.
    const four = respondThenResolve(fourDeep.slice(0, 4));
    expect(four.fold.pending(four.slice)).toBeNull();
    expect(four.slice.inFlight).toBeNull();
    expect(four.slice.committed.stack).toEqual([]);
    expect(four.slice.committed.sides.player.hand).toEqual([four.ids.player.deck[3]]);
    expect(four.slice.committed.sides.player.deck).toEqual([]);
    expect(invariantViolations(four.slice.committed, taking.catalog)).toEqual([]);
  });

  it("takes none when the \"you may\" is declined, without offering the cards", () => {
    const source = new RecordingSource(() => false);
    const { ids, result } = play(takeTwoBoard(fourDeep), source);
    expect(source.prompts.map((prompt) => prompt.kind)).toEqual(["confirm"]);
    expect(result.state.sides.player.hand).toEqual([]);
    expect(result.state.sides.player.deck).toEqual(ids.player.deck.slice(4));
    expect(result.events.filter((item) => item.kind === "eroded")).toHaveLength(4);
    expect(result.events.some((item) => item.kind === "cardTaken")).toBe(false);
  });

  it("takes every moved card without a choice when fewer than the count were moved, and asks nothing when Fatigue moved none", () => {
    const lone = play(takeTwoBoard([v.vanilla2.id]), new RecordingSource(acceptPicking()));
    expect(lone.result.answers).toEqual([expect.objectContaining({ value: true }), expect.objectContaining({ value: lone.ids.player.deck, auto: true })]);
    expect(lone.result.state.sides.player.hand).toEqual(lone.ids.player.deck);
    expect(lone.result.events.filter((item) => item.kind === "fatigue")).not.toHaveLength(0);
    expect(lone.result.events.filter((item) => item.kind === "cardTaken")).toHaveLength(1);

    const declined = play(takeTwoBoard([v.vanilla2.id]), new ScriptedSource([false]));
    expect(declined.result.state.sides.player.hand).toEqual([]);

    const empty = play(takeTwoBoard([]), new ScriptedSource([]));
    expect(empty.result.answers).toEqual([]);
    expect(empty.result.events.some((item) => item.kind === "fatigue")).toBe(true);
    expect(empty.result.events.some((item) => item.kind === "cardTaken")).toBe(false);
  });

  it("takes exactly that many from a mandatory take without a \"you may\", and all of them when fewer remain", () => {
    const source = new RecordingSource(acceptPicking(0, 2));
    const { ids, result } = play(handBoard(takeTwoFromOpponentHand.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]), source);
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 2, max: 2, candidates: ids.enemy.hand });
    expect(result.state.sides.player.hand).toEqual([ids.enemy.hand[0], ids.enemy.hand[2]]);
    expect(result.state.sides.enemy.hand).toEqual([ids.enemy.hand[1]]);

    const lone = play(handBoard(takeTwoFromOpponentHand.id, [v.vanilla1.id]), new ScriptedSource([]));
    expect(lone.result.answers).toEqual([expect.objectContaining({ auto: true })]);
    expect(lone.result.state.sides.player.hand).toEqual(lone.ids.enemy.hand);
  });

  it("reloads at either prompt to the same prompt, bounces foreign, partial, stale, and illegal answers, and takes the two cards once", () => {
    const fold = createFoldAdapter(taking, { checkEventPrefix: true });
    const { state, ids } = boardState(taking.catalog, takeTwoBoard(fourDeep));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const atConfirm = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    expect(atConfirm.committed.sides.player.deck).toEqual(ids.player.deck);
    const reloadedConfirm = JSON.parse(JSON.stringify(atConfirm)) as BattleSlice;
    const fresh = createFoldAdapter(taking, { checkEventPrefix: true });
    const confirm = fresh.pending(reloadedConfirm)!;
    expect(confirm.prompt.id).toBe(fold.pending(atConfirm)!.prompt.id);
    expect(confirm.prompt).toMatchObject({ kind: "confirm", purpose: { role: "youMay" } });
    const accept = { kind: "answer", side: "player", promptId: confirm.prompt.id, value: true } as const;
    expect(fresh.reduce(reloadedConfirm, { ...accept, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reloadedConfirm, { ...accept, value: [ids.player.deck[0], ids.player.deck[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    const atChoice = applied(fresh.reduce(reloadedConfirm, accept));
    expect(atChoice.committed.sides.player.deck).toEqual(ids.player.deck);
    const reloadedChoice = JSON.parse(JSON.stringify(atChoice)) as BattleSlice;
    const again = createFoldAdapter(taking, { checkEventPrefix: true });
    const choice = again.pending(reloadedChoice)!;
    expect(choice.prompt.id).toBe(fresh.pending(atChoice)!.prompt.id);
    expect(choice.prompt).toMatchObject({ kind: "chooseCards", min: 2, max: 2, candidates: ids.player.deck.slice(0, 4) });
    expect(again.reduce(reloadedChoice, accept)).toMatchObject({ kind: "bounced" });
    const answer = { kind: "answer", side: "player", promptId: choice.prompt.id, value: [ids.player.deck[1], ids.player.deck[2]] } as const;
    expect(again.reduce(reloadedChoice, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[], [ids.player.deck[1]], ids.player.deck.slice(0, 3), [ids.player.deck[1], ids.player.deck[1]], [ids.player.deck[1], ids.player.void[0]], [ids.player.deck[1], ids.player.deck[4]]]) {
      expect(again.reduce(reloadedChoice, { ...answer, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(again.reduce(reloadedChoice, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const outcome = again.reduce(reloadedChoice, answer);
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("expected the answer to apply");
    expect(outcome.published.filter((item) => item.kind === "cardTaken")).toHaveLength(2);
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([ids.player.deck[1], ids.player.deck[2]]);
    expect(done.committed.sides.player.deck).toEqual(ids.player.deck.slice(4));
    expect(again.reduce(done, answer)).toMatchObject({ kind: "bounced" });
  });

  it("publishes nothing and commits no erode or take when the step fails after both cards are taken", () => {
    const fold = createFoldAdapter(taking, { checkEventPrefix: true });
    const { state, ids } = boardState(taking.catalog, takeTwoBoard(fourDeep, takeTwoThenFail.id));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const atConfirm = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const atChoice = applied(fold.reduce(atConfirm, { kind: "answer", side: "player", promptId: fold.pending(atConfirm)!.prompt.id, value: true }));
    const outcome = fold.reduce(atChoice, { kind: "answer", side: "player", promptId: fold.pending(atChoice)!.prompt.id, value: ids.player.deck.slice(0, 2) });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its two takes/);
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(atChoice.committed);
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.sides.player.hand).toEqual([]);
    expect(outcome.slice.committed.sides.player.void).toEqual(ids.player.void);
    expect(fold.pending(outcome.slice)).toBeNull();
  });

  it("has Greedy accept the \"you may\" and take the most valuable cards, and decline the \"you may\" once its optional chain is spent", () => {
    const { state, ids } = boardState(taking.catalog, takeTwoBoard([v.vanilla0.id, v.vanilla5.id, v.vanilla2.id]));
    const [low, high, middle] = ids.player.deck;
    const value = new Map([[low, 0], [high, 5], [middle, 2]]);
    const purpose = { source: ids.player.hand[0], cardId: DSL.erodeTakeTwo.id, ability: 0 } as const;
    const choice: ChooseCardsPrompt = {
      kind: "chooseCards", side: "player", cancellable: false, candidates: [low, high, middle], min: 2, max: 2, purpose: { ...purpose, role: "chooseAmong" },
    };
    const info = (id: InstanceId) => ({ mine: true, value: value.get(id) ?? 0 });
    expect(greedyAnswer(choice, info, noDiscoverCosts, state.automaticChoices)).toEqual([high, middle]);
    const youMay: ConfirmPrompt = { kind: "confirm", side: "player", cancellable: false, purpose: { ...purpose, role: "youMay" } };
    expect(greedyAnswer(youMay, info, noDiscoverCosts, state.automaticChoices)).toBe(true);
    expect(greedyAnswer(youMay, info, noDiscoverCosts, Number.MAX_SAFE_INTEGER)).toBe(false);
    // Past the cap a choice already accepted still takes exactly the count.
    expect(greedyAnswer(choice, info, noDiscoverCosts, Number.MAX_SAFE_INTEGER)).toHaveLength(2);
  });
});
