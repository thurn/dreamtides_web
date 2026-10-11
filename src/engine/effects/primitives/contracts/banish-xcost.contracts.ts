/**
 * "To play this card, banish X cards from your void" (`banishXCost`, the
 * variable-count form of the void banish cost), on synthetic cards: the
 * chosen count is X, at least the cost's least X, and it travels with the
 * stack item; the final banish proves every selection without search; the
 * choice survives reload, refuses stale and foreign input, and commits with
 * the play or not at all. Fractured Veil, the authored card, pays it in
 * response at Interrupt speed.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, banishXCost, energy, energyX, event, keyword, optionalCost, x } from "../../../dsl/builders";
import fracturedVeil from "../../../../content/cards/fractured-veil-06f8cfff";
import { engineCardFromContent } from "../../../content-catalog";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { isLegalAnswer, legalAnswers } from "../../../prompts/answers";
import type { Answer, ArrangePrompt, ChooseCardsPrompt, ChooseNumberPrompt, Prompt } from "../../../prompts/types";
import type { PaymentCost } from "../../../dsl/types";
import type { Action } from "../../../rules/actions";
import { payCosts, planCosts } from "../../../rules/costs";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState, StackItem } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";
import { putFromTop } from "../put-in-deck";

const synthetic = (index: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "standard", status: "authored", abilities, ...extra,
});

/** "To play this event, banish X cards from your void. Gain X⍟." */
const banishForPoints = synthetic(1300, () => [additionalCost(banishXCost()), event(gainPoints(x()))]);
/** As `banishForPoints`, where X=0 is meaningful. */
const banishAnyForPoints = synthetic(1301, () => [additionalCost(banishXCost({ min: 0 })), event(gainPoints(x()))]);
/** "To play this event, banish X characters from your void. Gain X⍟." */
const banishCharacters = synthetic(1302, () => [additionalCost(banishXCost({ filter: { cardType: "character" } })), event(gainPoints(x()))]);
/** "X●. To play this event, banish X cards from your void. Gain X⍟." through one shared X. */
const pricedBanish = synthetic(1303, () => [additionalCost(banishXCost()), event(gainPoints(x()))], { costs: [energyX(0)] });
/** "Reclaim. To play this event, banish X cards from your void. Gain X⍟." */
const reclaimBanish = synthetic(1304, () => [keyword("reclaim"), additionalCost(banishXCost()), event(gainPoints(x()))]);
/** "Banish X cards from your void. Look at the top X cards of your deck. Put two of them into your hand and the rest on the bottom." */
const dig = synthetic(1305, () => [additionalCost(banishXCost()), event(putFromTop(x(), [{ to: "hand", count: 2 }, { to: "bottom", count: "rest" }]))]);
/** "You may banish X cards from your void to play this event. Gain X⍟." */
const optionalBanish = synthetic(1307, () => [additionalCost(optionalCost(banishXCost())), event(gainPoints(x()))]);
/** Pays a banish-X plan after the commit point, then its rules code fails when X is 1; a larger X plays on. */
const failsAfterPaying = synthetic(1306, () => [], {
  synthetic: {
    play(ctx, source) {
      const plan = planCosts(ctx, "player", source, [banishXCost()], null, (role) => ({ source, cardId: syntheticId(1306), ability: 0, role }), [source]);
      ctx.commitPoint();
      payCosts(ctx, "player", source, plan);
      if (plan.x === 1) throw new Error("synthetic failure after the banish");
      return {};
    },
  },
});
/** Fractured Veil, the authored Interrupt-speed banishXCost card. */
const veil = engineCardFromContent(fracturedVeil);

const engine = createEngine(testCatalog([banishForPoints, banishAnyForPoints, banishCharacters, pricedBanish, reclaimBanish, dig, failsAfterPaying, optionalBanish, veil]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

/** The enemy holds an Interrupt, so the played item waits on the stack until the enemy passes. */
const board = (player: SideSetup) =>
  boardState(engine.catalog, { active: "player", phase: "day", player: { deck, energy: 3, ...player }, enemy: { deck, hand: [v.interruptEvent.id], energy: 5 } });

/** Answers prompts from a script, keeping each prompt it was asked. */
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly answers: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.answers[this.next++];
    if (value === undefined) throw new Error(`no answer for ${prompt.purpose.role}`);
    return value;
  }
}

function run(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new Recording(answers);
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
}
const play = (card: InstanceId, from: "hand" | "void" = "hand"): Action => ({ kind: "play", card, from });
const resolve = (state: BattleState) => run(state, "enemy", { kind: "pass" });
const plays = (state: BattleState) => engine.legalActions(state, "player").flatMap((action) => (action.kind === "play" ? [`${action.card} ${action.from}`] : []));
const stackCard = (item: StackItem) => (item.kind === "card" ? item.instance : null);
const banishedBy = (events: readonly EngineEvent[]) => events.flatMap((event) => (event.kind === "banished" ? [event.instance] : []));
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

describe("banishXCost", () => {
  it("binds X to the number of void cards banished, from the least X up to every one, and spends no energy for it", () => {
    for (const count of [1, 2, 3]) {
      const { state, ids } = board({ hand: [banishForPoints.id], void: [v.vanilla1.id, v.event0.id, v.vanilla2.id] });
      const chosen = ids.player.void.slice(0, count);
      const paid = run(state, "player", play(ids.player.hand[0]), [chosen]);
      expect(paid.prompts.map((prompt) => prompt.purpose.role)).toEqual(["banishCost"]);
      expect(paid.state.stack[0]?.x).toBe(count);
      expect(paid.state.sides.player.currentEnergy).toBe(2);
      expect(paid.state.sides.player.void).toEqual(ids.player.void.slice(count));
      expect(new Set(banishedBy(paid.events))).toEqual(new Set(chosen));
      for (const id of chosen) expect(paid.state.instances[id].zone).toBe("banished");
      expect(resolve(paid.state).state.sides.player.score).toBe(count);
    }
  });

  it("asks with the void as candidates, the least X as the minimum and every candidate as the maximum", () => {
    const { state, ids } = board({ hand: [banishForPoints.id], void: [v.vanilla1.id, v.event0.id, v.vanilla2.id] });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const prompt = fold.pending(opened)!.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", min: 1, max: 3 });
    expect(prompt.purpose.role).toBe("banishCost");
    expect([...prompt.candidates].sort()).toEqual([...ids.player.void].sort());
    expect(isLegalAnswer(prompt, [])).toBe(false);
  });

  it("is unplayable with fewer matching void cards than the least X, and a least X of 0 plays with an empty void", () => {
    const empty = board({ hand: [banishForPoints.id, banishAnyForPoints.id, banishCharacters.id] });
    const any = empty.ids.player.hand[1];
    expect(plays(empty.state)).toEqual([`${any} hand`]);
    const zero = run(empty.state, "player", play(any), [[]]);
    expect(zero.state.stack[0]?.x).toBe(0);
    expect(resolve(zero.state).state.sides.player.score).toBe(0);

    const eventsOnly = board({ hand: [banishCharacters.id, banishForPoints.id], void: [v.event0.id, v.event1.id] });
    expect(plays(eventsOnly.state)).toEqual([`${eventsOnly.ids.player.hand[1]} hand`]);
  });

  it("offers only matching void cards, never the card being played from the void by Reclaim", () => {
    const filtered = board({ hand: [banishCharacters.id], void: [v.event0.id, v.vanilla1.id, v.vanilla2.id] });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(filtered.state), { kind: "battleAction", side: "player", action: play(filtered.ids.player.hand[0]) }));
    expect([...(fold.pending(opened)!.prompt as ChooseCardsPrompt).candidates].sort()).toEqual(filtered.ids.player.void.slice(1).sort());

    const alone = board({ void: [reclaimBanish.id] });
    expect(plays(alone.state)).toEqual([]);
    const reclaiming = board({ void: [reclaimBanish.id, v.vanilla1.id] });
    const [self, other] = reclaiming.ids.player.void;
    expect(plays(reclaiming.state)).toEqual([`${self} void`]);
    // The lone other void card pays X=1 by itself.
    const paid = run(reclaiming.state, "player", play(self, "void"));
    expect(paid.state.instances[other].zone).toBe("banished");
    expect(paid.state.stack[0]?.x).toBe(1);
  });

  it("banishes a Reclaim card for good: it can no longer be played from the void", () => {
    const { state, ids } = board({ hand: [banishForPoints.id], void: [reclaimBanish.id, v.vanilla1.id] });
    const [reclaimable, other] = ids.player.void;
    expect(plays(state)).toContain(`${reclaimable} void`);
    const paid = run(state, "player", play(ids.player.hand[0]), [[reclaimable]]);
    expect(paid.state.instances[reclaimable].zone).toBe("banished");
    const after = resolve(paid.state).state;
    // Energy and another void card to banish remain: only the zone keeps it from being reclaimed.
    expect(after.sides.player.currentEnergy).toBeGreaterThan(0);
    expect(after.sides.player.void).toContain(other);
    expect(after.instances[reclaimable].zone).toBe("banished");
    expect(plays(after)).not.toContain(`${reclaimable} void`);
  });

  it("shares X with an energy X: the banish count is the chosen X, and an X below the least X is withheld", () => {
    const { state, ids } = board({ hand: [pricedBanish.id], void: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], energy: 3 });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const pendingX = fold.pending(opened)!;
    const chooseX = pendingX.prompt as ChooseNumberPrompt;
    expect(chooseX.purpose.role).toBe("chooseX");
    expect(isLegalAnswer(chooseX, 0)).toBe(false);
    const paid = run(state, "player", play(ids.player.hand[0]), [2, ids.player.void.slice(0, 2)]);
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.sides.player.currentEnergy).toBe(1);
    expect(paid.state.sides.player.void).toEqual(ids.player.void.slice(2));
    const answered = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: pendingX.prompt.id, value: 2 }));
    const banish = fold.pending(answered)!.prompt as ChooseCardsPrompt;
    expect(banish).toMatchObject({ min: 2, max: 2 });
  });

  it("offers an optional banish only when the void holds the least X", () => {
    for (const cards of [0, 1]) {
      const { state, ids } = board({ hand: [optionalBanish.id], void: Array.from({ length: cards }, () => v.vanilla1.id) });
      const paid = run(state, "player", play(ids.player.hand[0]), cards === 0 ? [] : [true]);
      expect(paid.answers.filter((answer) => typeof answer.value === "boolean")).toHaveLength(cards);
      expect(paid.state.stack[0]).toMatchObject({ x: cards === 0 ? null : 1, optionalPaid: [cards === 1] });
    }
  });

  it("types a variable count with its least X, supplied as 1 by the builder, and a fixed count without one", () => {
    const malformed: readonly PaymentCost[] = [
      // @ts-expect-error a variable count names its least X.
      { cost: "banishFromVoid", count: "x", filter: {} },
      // @ts-expect-error a fixed count has no least X.
      { cost: "banishFromVoid", count: 2, filter: {}, min: 1 },
    ];
    expect(malformed).toHaveLength(2);
    expect(banishXCost()).toEqual({ cost: "banishFromVoid", count: "x", filter: {}, min: 1 });
    expect(banishXCost({ min: 0 })).toMatchObject({ count: "x", min: 0 });
  });

  it("looks at the top X cards and puts two into the hand and the rest on the bottom", () => {
    const { state, ids } = board({ hand: [dig.id], void: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] });
    const paid = run(state, "player", play(ids.player.hand[0]), [ids.player.void]);
    expect(paid.state.stack[0]?.x).toBe(3);
    const [first, second, third, fourth] = ids.player.deck;
    const resolved = run(paid.state, "enemy", { kind: "pass" }, [[{ card: first, to: "hand" }, { card: third, to: "hand" }, { card: second, to: "bottom" }]]);
    const arrange = resolved.prompts[0] as ArrangePrompt;
    expect(arrange).toMatchObject({ kind: "arrange", side: "player", privateTo: "player", cards: [first, second, third] });
    expect(arrange.destinations).toEqual([{ to: "hand", min: 2, max: 2 }, { to: "bottom", min: 1, max: 1 }]);
    expect(resolved.state.sides.player.hand).toEqual([first, third]);
    expect(resolved.state.sides.player.deck).toEqual([fourth, second]);

    const single = board({ hand: [dig.id], void: [v.vanilla1.id] });
    const one = resolve(run(single.state, "player", play(single.ids.player.hand[0])).state);
    expect(one.state.sides.player.hand).toEqual([single.ids.player.deck[0]]);
    expect(one.state.sides.player.deck).toEqual(single.ids.player.deck.slice(1));
  });
});

describe("banishXCost proves every final selection", () => {
  it.each([[10, 1], [10, 256]])("keeps every count answerable with %i void cards and a budget of %i", (size, budget) => {
    const setup = board({ hand: [banishForPoints.id], void: Array.from({ length: size }, () => v.vanilla1.id) });
    const state = { ...setup.state, config: { ...setup.state.config, feasibilitySearchRuns: budget } };
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(setup.ids.player.hand[0]) }));
    const pending = fold.pending(opened)!;
    const prompt = pending.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ min: 1, max: size });
    expect(prompt.allowed).toBeUndefined();
    for (const selection of legalAnswers({ ...prompt, allowed: undefined })) expect(isLegalAnswer(prompt, selection)).toBe(true);
    for (let count = 1; count <= size; count++) {
      const cards = [...setup.ids.player.void].reverse().slice(0, count);
      const paid = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: cards }));
      expect(paid.committed.stack[0]?.x).toBe(count);
      expect(new Set(paid.committed.sides.player.void)).toEqual(new Set(setup.ids.player.void.filter((id) => !cards.includes(id))));
    }
  });
});

describe("banishXCost across suspension and failure", () => {
  it("reloads the banish choice unchanged, commits nothing until answered, and refuses stale, foreign, concurrent and out-of-range input", () => {
    const { state, ids } = board({ hand: [banishForPoints.id, v.vanilla1.id], void: [v.vanilla1.id, v.vanilla2.id] });
    const action = play(ids.player.hand[0]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(stateHash(opened.committed)).toBe(stateHash(state));

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: Answer, slice: BattleSlice = saved) => cold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value });

    expect(answer("enemy", [ids.player.void[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    // A card outside the void, the same card twice, and fewer than the least X.
    expect(answer("player", [ids.player.hand[1]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [ids.player.void[0], ids.player.void[0]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [...ids.player.void, ids.player.hand[1]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
    expect(answer("player", [ids.player.void[0]], reopened)).toEqual({ kind: "bounced", reason: "stalePrompt" });

    const paid = applied(answer("player", [ids.player.void[1]]));
    expect(paid.inFlight).toBeNull();
    // The banish, the energy and X commit together with the play.
    expect(paid.committed.instances[ids.player.void[1]].zone).toBe("banished");
    expect(paid.committed.sides.player.void).toEqual([ids.player.void[0]]);
    expect(paid.committed.sides.player.currentEnergy).toBe(2);
    expect(paid.committed.stack[0]).toMatchObject({ instance: ids.player.hand[0], x: 1 });
    expect(answer("player", [ids.player.void[0]], paid)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("commits neither the banish nor the play when rules code fails after paying", () => {
    const { state, ids } = board({ hand: [failsAfterPaying.id], void: [v.vanilla1.id, v.vanilla2.id] });
    const before = stateHash(state);
    const observed: EngineEvent[] = [];
    expect(() => runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ids.player.void[0]]]), engine.catalog, { observeEvent: (event) => observed.push(event) })).toThrow("synthetic failure after the banish");
    expect(banishedBy(observed)).toEqual([ids.player.void[0]]);
    expect(stateHash(state)).toBe(before);
    expect(state.sides.player.void).toEqual(ids.player.void);
  });

  it("recovers a persisted play that fails after paying: no banish publishes or commits, and a retry pays and plays", () => {
    const { state, ids } = board({ hand: [failsAfterPaying.id], void: [v.vanilla1.id, v.vanilla2.id] });
    const action = play(ids.player.hand[0]);
    const opened = applied(createFoldAdapter(engine).reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const records: EngineLogRecord[] = [];
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true, log: (record) => records.push(record) });
    const pending = cold.pending(saved)!;
    expect(pending.prompt.purpose.role).toBe("banishCost");
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[0]] } as const;

    const outcome = cold.reduce(saved, answer);
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error).toMatchObject({ kind: "engine_error", step: { kind: "play", card: ids.player.hand[0] } });
    expect(outcome.error.message).toMatch(/after the banish/);
    // The banished event the failed run emitted is transient: nothing publishes, and the slice keeps the committed state.
    expect(outcome.published).toEqual([]);
    expect(outcome.slice).toEqual({ committed: state, inFlight: null, publishedEvents: 0, attempt: saved.attempt });
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(state));
    expect(outcome.slice.committed.sides.player.void).toEqual(ids.player.void);
    expect(outcome.slice.committed.sides.player.banished).toEqual([]);
    expect(records.map((record) => record.event)).toEqual(["engine.promptAnswered", "engine.error"]);
    expect(cold.pending(outcome.slice)).toBeNull();
    // Replaying the same persisted intent recovers the same slice.
    const replayed = createFoldAdapter(createEngine(engine.catalog)).reduce(JSON.parse(JSON.stringify(opened)) as BattleSlice, answer);
    expect(replayed).toEqual(outcome);

    // The failed attempt's prompt is gone, and stays stale once the play is retried.
    expect(cold.reduce(outcome.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const retried = applied(cold.reduce(outcome.slice, { kind: "battleAction", side: "player", action }));
    const again = cold.pending(retried)!;
    expect(again.prompt.id).not.toBe(pending.prompt.id);
    expect(cold.reduce(retried, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });

    const paid = cold.reduce(retried, { kind: "answer", side: "player", promptId: again.prompt.id, value: ids.player.void });
    if (paid.kind !== "applied" || paid.error !== null) throw new Error(`expected the retry to apply, got ${JSON.stringify(paid)}`);
    expect(paid.slice.inFlight).toBeNull();
    expect(new Set(banishedBy(paid.published))).toEqual(new Set(ids.player.void));
    expect(paid.slice.committed.sides.player.void).toEqual([]);
    expect(paid.slice.committed.stack.map(stackCard)).toEqual([ids.player.hand[0]]);
    expect(invariantViolations(paid.slice.committed, engine.catalog)).toEqual([]);
  });
});

describe("Fractured Veil at Interrupt speed", () => {
  /** The enemy's turn: it plays a standard event, and the player may respond with Fractured Veil. */
  function responding() {
    const setup = boardState(engine.catalog, {
      active: "enemy",
      phase: "day",
      player: { deck, hand: [veil.id], void: [v.vanilla1.id, v.event0.id, v.vanilla2.id], energy: 3 },
      enemy: { deck, hand: [v.event1.id], energy: 5 },
    });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const enemyPlay = play(setup.ids.enemy.hand[0]);
    const slice = applied(fold.reduce(sliceOf(setup.state), { kind: "battleAction", side: "enemy", action: enemyPlay }));
    return { ...setup, fold, slice };
  }

  it("opens and cancels its banish cost prompt in response, leaving the original item and the player's priority", () => {
    const { ids, fold, slice } = responding();
    const original = ids.enemy.hand[0];
    expect(slice.committed.stack.map(stackCard)).toEqual([original]);
    expect(engine.decision(slice.committed)?.side).toBe("player");
    const response = play(ids.player.hand[0]);
    expect(engine.legalActions(slice.committed, "player")).toContainEqual(response);

    const opened = applied(fold.reduce(slice, { kind: "battleAction", side: "player", action: response }));
    const pending = fold.pending(opened)!;
    const prompt = pending.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", min: 1, max: 3, cancellable: true });
    expect(prompt.purpose.role).toBe("banishCost");
    expect([...prompt.candidates].sort()).toEqual([...ids.player.void].sort());
    expect(opened.committed).toEqual(slice.committed);

    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(slice.committed);
    expect(cancelled.inFlight).toBeNull();
    expect(engine.decision(cancelled.committed)?.side).toBe("player");
    expect(engine.legalActions(cancelled.committed, "player")).toContainEqual(response);
    const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side: "player", action: response }));
    expect(fold.reduce(reopened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[0]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
  });

  it("goes on the stack above the original item with its X and resolves first", () => {
    const { ids, fold, slice } = responding();
    const original = ids.enemy.hand[0];
    const response = ids.player.hand[0];
    const opened = applied(fold.reduce(slice, { kind: "battleAction", side: "player", action: play(response) }));
    const chosen = ids.player.void.slice(0, 2);
    const answered = fold.reduce(opened, { kind: "answer", side: "player", promptId: fold.pending(opened)!.prompt.id, value: chosen });
    const paid = applied(answered);
    // The enemy has no response, so priority passes and Fractured Veil, the top item, resolves to its arrangement.
    const arranging = fold.pending(paid)!;
    const arrange = arranging.prompt as ArrangePrompt;
    expect(arrange.purpose.source).toBe(response);
    expect(paid.committed.stack.map(stackCard)).toEqual([original, response]);
    expect(paid.committed.stack[1]).toMatchObject({ controller: "player", x: 2 });
    expect(paid.committed.sides.player.currentEnergy).toBe(1);
    for (const id of chosen) expect(paid.committed.instances[id].zone).toBe("banished");
    const [first, second] = ids.player.deck;
    expect(arrange).toMatchObject({ kind: "arrange", side: "player", cards: [first, second] });

    const outcome = fold.reduce(paid, { kind: "answer", side: "player", promptId: arranging.prompt.id, value: [{ card: first, to: "hand" }, { card: second, to: "hand" }] });
    const resolved = applied(outcome);
    // Neither player can respond again, so the original item resolves after Fractured Veil, from beneath it.
    const published = [answered, outcome].flatMap((step) => (step.kind === "applied" ? step.published : []));
    expect(published.flatMap((event) => (event.kind === "resolved" ? [event.instance] : []))).toEqual([response, original]);
    expect(resolved.committed.stack).toEqual([]);
    expect(resolved.committed.sides.player.hand).toEqual([first, second]);
    expect(resolved.committed.instances[response].zone).toBe("void");
    expect(invariantViolations(resolved.committed, engine.catalog)).toEqual([]);
  });
});
