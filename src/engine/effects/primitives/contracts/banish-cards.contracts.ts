import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event, everyIn, fromVoid, reclaim, topOfDeck } from "../../../dsl/builders";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { cardMatchesFilter } from "../../../continuous/characteristics";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { discardCard, drawCard } from "../../../rules/resources";
import { instanceOf, moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import type { CardId, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import type { EffectNode } from "../../types";
import { banishCards, banishChosen } from "../banish-cards";
import { draw } from "../draw";
import { sequence } from "../sequence";
import { deck, knowing, v } from "./cards-support";

const eventCard = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  id: syntheticId(0x6500 + index), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities,
});

/** Resolves `effect` for the item's controller, then throws: a step that fails after its banish. */
const thenFail = (index: number, effect: EffectNode): EngineCardDefinition => ({
  ...eventCard(index, () => []),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, effect, {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after a banish");
    },
  },
});

/** "Banish your hand and void." */
const handAndVoid = eventCard(1, () => [event(banishCards([everyIn("hand"), everyIn("void"), everyIn("void", { cardType: "event" })]))]);
/** "Banish your hand and void. Draw 2 cards. Reclaim 1●." */
const renounce = eventCard(2, () => [event(sequence(banishCards([everyIn("hand"), everyIn("void")]), draw(2))), reclaim(energy(1))]);
/** "Banish two cards from the opponent's void." */
const banishTwoFromVoid = eventCard(3, () => [event(banishCards([fromVoid({}, { player: "opponent", count: 2 })]))]);
/** "Banish a chosen character from the opponent's hand." */
const chosenCharacter = eventCard(4, () => [event(banishChosen({ cardType: "character" }))]);
const chosenThenFail = thenFail(5, banishChosen());
const handThenFail = thenFail(6, banishCards([everyIn("hand")]));
/** "▸Materialized: Banish a card from the opponent's void." and "… up to two cards …". */
const materializedBanisher = (index: number, options: Parameters<typeof fromVoid>[1]): EngineCardDefinition => ({
  id: syntheticId(0x6500 + index), cardType: "character", costs: [], spark: 1, subtype: "Warrior", speed: "standard",
  status: "authored", abilities: () => [triggered(onMaterialized(), banishCards([fromVoid({}, { player: "opponent", ...options })]))],
});
const banishOne = materializedBanisher(7, {});
const banishUpToTwo = materializedBanisher(8, { count: 2, upTo: true });
/** ❖❖ A synthetic response: every card in its controller's void returns to its owner's hand. */
const recoverOwnVoid: EngineCardDefinition = {
  ...v.interruptEvent,
  id: syntheticId(0x6509),
  synthetic: {
    resolve(ctx, item) {
      for (const id of [...ctx.state.sides[item.controller].void]) moveToHand(ctx, id, instanceOf(ctx.state, id).owner);
    },
  },
};

/** ❖❖ A synthetic response: its controller discards the first character in its hand, then draws a card. */
const swapHandCharacter: EngineCardDefinition = {
  ...v.interruptEvent,
  id: syntheticId(0x650a),
  synthetic: {
    resolve(ctx, item) {
      const side = item.controller;
      const character = ctx.state.sides[side].hand.find((id) => cardMatchesFilter(ctx.state, ctx.catalog, id, { cardType: "character" }));
      if (character === undefined) throw new Error("no character to discard");
      discardCard(ctx, side, character);
      drawCard(ctx, side);
    },
  },
};
const chosenCharacterThenFail = thenFail(11, banishChosen({ cardType: "character" }));
/** "Banish the characters among the top 3 cards of your deck, your top card, and the top card of the opponent's deck." */
const banishTops = eventCard(12, () => [
  event(banishCards([topOfDeck(3, { cardType: "character" }), topOfDeck(1), topOfDeck(1, {}, "opponent")])),
]);

const engine = createEngine(testCatalog([
  handAndVoid, renounce, banishTwoFromVoid, chosenCharacter, chosenThenFail, handThenFail, banishOne, banishUpToTwo, recoverOwnVoid,
  swapHandCharacter, chosenCharacterThenFail, banishTops,
]));

/** Answers target and card prompts with `pick` over their candidates, recording every prompt. */
class Picking implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

const banishedOf = (events: readonly EngineEvent[]) => events.filter((e) => e.kind === "banished");
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
};
const clean = (events: readonly EngineEvent[], before: BattleState, after: BattleState) => {
  expect(unannouncedChanges(events, before, after)).toEqual([]);
  expect(eventRedactionViolations(events, before, after)).toEqual([]);
  expect(invariantViolations(after, engine.catalog)).toEqual([]);
};

describe("banishCards", () => {
  const play = (card: CardId, player: BoardSetup["player"] = {}, enemy: BoardSetup["enemy"] = {}, source: AnswerSource = NO_PROMPTS) => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { deck, energy: 3, ...player, hand: [card, ...(player?.hand ?? [])] }, enemy: { deck, ...enemy },
    });
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, source);
    return { state, ids, result };
  };

  it("banishes every card of the controller's hand and void once, each to its owner's Banished zone, and shows the hand cards to both players", () => {
    const { state, ids, result } = play(handAndVoid.id, { hand: [v.vanilla1.id, v.event1.id], void: [v.event0.id, v.vanilla2.id] });
    const [source, ...hand] = ids.player.hand;
    const named = [...hand, ...ids.player.void];
    expect(result.state.sides.player.hand).toEqual([]);
    expect(result.state.sides.player.banished.slice().sort()).toEqual(named.slice().sort());
    // The source was on the stack, so it is not part of the hand it banishes.
    expect(result.state.sides.player.void).toEqual([source]);
    expect(banishedOf(result.events)).toEqual(named.map((instance) => ({ kind: "banished", instance, side: "player" })));
    expect(result.events.filter((e) => e.kind === "leftVoid").map((e) => e.kind === "leftVoid" && e.instance)).toEqual(ids.player.void);
    for (const id of named) expect(view(result.state, "enemy", engine.catalog).instances[id]).toBeDefined();
    expect(view(result.state, "enemy", engine.catalog).instances[ids.player.deck[0]]).toBeUndefined();
    clean(result.events, state, result.state);
  });

  it("sends a hand card the opponent owns to the opponent's Banished zone and lets a created card cease to exist", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [handAndVoid.id, v.vanilla1.id, v.vanilla2.id], deck }, enemy: { deck },
    });
    const [, foreign, created] = ids.player.hand;
    state.instances[foreign] = { ...state.instances[foreign], owner: "enemy" };
    state.instances[created].status.created = true;
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    expect(result.state.sides.enemy.banished).toEqual([foreign]);
    expect(result.state.sides.player.banished).toEqual([]);
    expect(result.state.instances[created]).toBeUndefined();
    expect(result.events.some((e) => e.kind === "ceasedToExist" && e.instance === created)).toBe(true);
    expect(banishedOf(result.events)).toEqual([{ kind: "banished", instance: foreign, side: "player" }]);
    clean(result.events, state, result.state);
  });

  it("banishes before the rest of the effect, composes with Reclaim, and banishes the reclaimed source after it resolves", () => {
    const first = play(renounce.id, { hand: [v.event1.id], void: [v.vanilla3.id] });
    expect(first.result.state.sides.player.banished.slice().sort()).toEqual([first.ids.player.hand[1], first.ids.player.void[0]].sort());
    expect(first.result.state.sides.player.hand).toEqual(first.ids.player.deck.slice(0, 2));
    expect(first.result.state.sides.player.void).toEqual([first.ids.player.hand[0]]);
    const again = engine.apply(first.result.state, "player", { kind: "play", from: "void", card: first.ids.player.hand[0] }, NO_PROMPTS);
    expect(again.state.sides.player.currentEnergy).toBe(first.result.state.sides.player.currentEnergy - 1);
    expect(again.state.sides.player.banished).toEqual(expect.arrayContaining([first.ids.player.hand[0], ...first.ids.player.deck.slice(0, 2)]));
    expect(again.state.sides.player.hand).toEqual(first.ids.player.deck.slice(2, 4));
    clean(again.events, first.result.state, again.state);
  });

  it("chooses void targets at play time and skips one that left the void before it resolved, reporting noLegalTarget when none remain", () => {
    const picking = new Picking((candidates) => [candidates[2], candidates[0]]);
    const chosen = play(banishTwoFromVoid.id, {}, { void: [v.vanilla1.id, v.event0.id, v.vanilla2.id] }, picking);
    expect(picking.prompts[0]).toMatchObject({ kind: "chooseTargets", side: "player", min: 2, max: 2, candidates: chosen.ids.enemy.void });
    expect(chosen.result.state.sides.enemy.banished.slice().sort()).toEqual([chosen.ids.enemy.void[0], chosen.ids.enemy.void[2]].sort());
    expect(chosen.result.state.sides.enemy.void).toEqual([chosen.ids.enemy.void[1]]);
    expect(banishedOf(chosen.result.events).map((e) => e.kind === "banished" && e.side)).toEqual(["enemy", "enemy"]);
    clean(chosen.result.events, chosen.state, chosen.result.state);

    const short = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [banishTwoFromVoid.id], deck }, enemy: { void: [v.vanilla1.id], deck } });
    expect(engine.legalActions(short.state, "player").some((action) => action.kind === "play")).toBe(false);

    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [banishTwoFromVoid.id], deck },
      enemy: { hand: [recoverOwnVoid.id], void: [v.vanilla1.id, v.vanilla2.id], energy: 1, deck },
    });
    const played = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([ids.enemy.void]));
    const responded = engine.apply(played.state, "enemy", playFromHand(ids, "enemy").action, NO_PROMPTS);
    const rest = passUntil(engine, responded.state, (next) => next.stack.length === 0);
    expect(rest.state.sides.enemy.banished).toEqual([]);
    expect(rest.state.sides.enemy.hand.slice().sort()).toEqual([...ids.enemy.void].sort());
    const events = [...responded.events, ...rest.events];
    expect(banishedOf(events)).toEqual([]);
    expect(events.filter((e) => e.kind === "noLegalTarget")).toEqual([{ kind: "noLegalTarget", source: ids.player.hand[0] }]);
  });

  it("chooses a triggered ability's void targets as it resolves, with a required one or up to two, and does nothing on an empty void", () => {
    const one = new Picking((candidates) => [candidates[1]]);
    const required = play(banishOne.id, {}, { void: [v.vanilla1.id, v.event0.id] }, one);
    expect(one.prompts).toHaveLength(1);
    expect(one.prompts[0]).toMatchObject({ kind: "chooseTargets", side: "player", min: 1, max: 1, candidates: required.ids.enemy.void });
    expect(one.prompts[0].purpose.role).toBe("target");
    expect(required.result.state.sides.enemy.banished).toEqual([required.ids.enemy.void[1]]);
    expect(required.result.state.sides.player.backRank).toContain(required.ids.player.hand[0]);
    clean(required.result.events, required.state, required.result.state);

    const none = new Picking(() => []);
    const declined = play(banishUpToTwo.id, {}, { void: [v.vanilla1.id, v.event0.id, v.vanilla2.id] }, none);
    expect(none.prompts[0]).toMatchObject({ kind: "chooseTargets", min: 0, max: 2 });
    expect(declined.result.state.sides.enemy.void).toEqual(declined.ids.enemy.void);
    const both = new Picking((candidates) => candidates.slice(0, 2));
    const two = play(banishUpToTwo.id, {}, { void: [v.vanilla1.id, v.event0.id, v.vanilla2.id] }, both);
    expect(two.result.state.sides.enemy.void).toEqual([two.ids.enemy.void[2]]);

    for (const card of [banishOne.id, banishUpToTwo.id]) {
      const empty = play(card, { void: [v.vanilla1.id] }, {}, new Picking(() => { throw new Error("no prompt expected"); }));
      expect(empty.result.state.sides.player.void).toEqual(empty.ids.player.void);
      expect(banishedOf(empty.result.events)).toEqual([]);
    }
  });

  it("banishes the matching cards among the top cards of a deck, each once, and shows them to both players in the Banished zone", () => {
    const own = [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.vanilla3.id];
    const { state, ids, result } = play(banishTops.id, { deck: own }, { deck: [v.event1.id, v.vanilla1.id] });
    const [top, skipped, second, below] = ids.player.deck;
    const [opposing, remaining] = ids.enemy.deck;
    for (const [id, side] of [[top, "enemy"], [second, "enemy"], [top, "player"], [opposing, "player"]] as const) {
      expect(view(state, side, engine.catalog).instances[id]).toBeUndefined();
    }
    expect(result.state.sides.player.banished.slice().sort()).toEqual([top, second].sort());
    expect(result.state.sides.player.deck).toEqual([skipped, below]);
    expect(result.state.sides.enemy.banished).toEqual([opposing]);
    expect(result.state.sides.enemy.deck).toEqual([remaining]);
    expect(banishedOf(result.events)).toEqual([
      { kind: "banished", instance: top, side: "player" },
      { kind: "banished", instance: second, side: "player" },
      { kind: "banished", instance: opposing, side: "enemy" },
    ]);
    for (const side of ["player", "enemy"] as const) {
      const shown = view(result.state, side, engine.catalog).instances;
      for (const id of [top, second, opposing]) expect(shown[id]).toBeDefined();
      expect(shown[skipped]).toBeUndefined();
    }
    clean(result.events, state, result.state);

    const short = play(banishTops.id, { deck: [v.event0.id, v.vanilla2.id] }, { deck: [] });
    expect(banishedOf(short.result.events).map((e) => e.kind === "banished" && e.instance)).toEqual([short.ids.player.deck[1], short.ids.player.deck[0]]);
    expect(short.result.state.sides.player.deck).toEqual([]);
    expect(short.result.state.sides.enemy.banished).toEqual([]);
    expect(short.result.events.some((e) => e.kind === "fatigue")).toBe(false);
    clean(short.result.events, short.state, short.result.state);
  });
});

describe("banishChosen", () => {
  const setup = (card: CardId, hand: readonly CardId[], active: Side = "player"): BoardSetup => {
    const other: Side = active === "player" ? "enemy" : "player";
    return { active, phase: "day", [active]: { hand: [card], deck, energy: 3 }, [other]: { hand, deck } };
  };
  const suspend = (board: BoardSetup) => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, board);
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: playFromHand(ids, board.active).action }));
    return { fold, slice, pending: fold.pending(slice)!, ids };
  };

  it("privately offers only the matching cards of the opponent's hand, and banishes the chosen one without discarding it", () => {
    const { fold, slice, pending, ids } = suspend(setup(chosenCharacter.id, [v.vanilla1.id, v.event1.id, v.vanilla1.id]));
    const prompt = pending.prompt as ChooseCardsPrompt;
    const characters = [ids.enemy.hand[0], ids.enemy.hand[2]];
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 1, max: 1, cancellable: false, candidates: characters });
    expect(prompt.purpose.role).toBe("banishChosen");
    // The controller sees only the matching cards; the opponent sees its own hand as the candidates.
    const shown = view(pending.display, "player", engine.catalog).instances;
    expect(shown[characters[1]]).toBeDefined();
    expect(shown[ids.enemy.hand[1]]).toBeUndefined();
    expect((promptView(prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual(characters);
    const outcome = fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [characters[1]] });
    const done = applied(outcome);
    expect(done.committed.sides.enemy.hand).toEqual(ids.enemy.hand.slice(0, 2));
    expect(done.committed.sides.enemy.banished).toEqual([characters[1]]);
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(banishedOf(outcome.published)).toEqual([{ kind: "banished", instance: characters[1], side: "enemy" }]);
    expect(outcome.published.some((e) => e.kind === "discarded")).toBe(false);
    expect(eventRedactionViolations(outcome.published, slice.committed, done.committed)).toEqual([]);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("offers the opponent's hand as it resolves, after an Interrupt response changed which cards match", () => {
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [chosenCharacter.id], deck, energy: 3 },
      enemy: { hand: [swapHandCharacter.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla3.id], deck, energy: 3 },
    });
    const [response, discarded, unmatched, ...kept] = ids.enemy.hand;
    const drawn = ids.enemy.deck[0];
    let slice = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
      { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    expect(slice.committed.stack.map((item) => item.kind === "card" && item.instance)).toEqual([ids.player.hand[0]]);
    slice = applied(fold.reduce(slice, { kind: "battleAction", side: "enemy", action: playFromHand(ids, "enemy").action }));
    for (let passes = 0; fold.pending(slice) === null; passes++) {
      const decision = engine.decision(slice.committed);
      if (decision === null || passes > 10) throw new Error("the banish never prompted");
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    const pending = fold.pending(slice)!;
    expect(pending.display.instances[response].zone).toBe("void");
    expect(pending.display.sides.enemy.hand).toEqual([unmatched, ...kept, drawn]);
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", candidates: [...kept, drawn] });
    expect(pending.display.sides.enemy.void).toContain(discarded);
    const done = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [drawn] }));
    expect(done.committed.sides.enemy.banished).toEqual([drawn]);
    expect(done.committed.sides.enemy.hand).toEqual([unmatched, ...kept]);
    expect(done.committed.stack).toEqual([]);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("does nothing for an empty or unmatched hand, and works for the enemy controller", () => {
    for (const hand of [[], [v.event0.id, v.event1.id]]) {
      const { state, ids } = boardState(engine.catalog, setup(chosenCharacter.id, hand));
      const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
      expect(result.state.sides.enemy.hand).toEqual(ids.enemy.hand);
      expect(banishedOf(result.events)).toEqual([]);
      expect(result.state.knownTo.player).toEqual([]);
    }
    const { fold, slice, pending, ids } = suspend(setup(chosenCharacter.id, [v.event0.id, v.vanilla2.id, v.vanilla3.id], "enemy"));
    expect(pending.prompt).toMatchObject({ side: "enemy", privateTo: "enemy", candidates: ids.player.hand.slice(1) });
    expect(view(pending.display, "enemy", engine.catalog).instances[ids.player.hand[0]]).toBeUndefined();
    const done = applied(fold.reduce(slice, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.player.hand[2]] }));
    expect(done.committed.sides.player.banished).toEqual([ids.player.hand[2]]);
  });

  it("reconstructs the private prompt on reload, rejects illegal, foreign, stale and concurrent inputs, and commits once", () => {
    const { slice, pending, ids } = suspend(setup(chosenCharacter.id, [v.vanilla1.id, v.event1.id, v.vanilla2.id]));
    const committed = stateHash(slice.committed);
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: readonly InstanceId[], from = saved) => fresh.reduce(from, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] }))
      .toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("enemy", [ids.enemy.hand[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[], [ids.enemy.hand[1]], [ids.enemy.hand[0], ids.enemy.hand[2]], [ids.enemy.deck[0]], [ids.enemy.hand[0], ids.enemy.hand[0]]]) {
      expect(answer("player", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(committed);
    const done = applied(answer("player", [ids.enemy.hand[2]]));
    expect(done.committed.sides.enemy.banished).toEqual([ids.enemy.hand[2]]);
    expect(answer("player", [ids.enemy.hand[0]], done)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("rolls back a banish when the step fails after it, publishing nothing and keeping only the prompt's private knowledge", () => {
    const { slice, pending, ids } = suspend(setup(chosenThenFail.id, [v.vanilla1.id, v.event1.id]));
    const outcome = createFoldAdapter(engine, { checkEventPrefix: true })
      .reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[1]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed).toEqual(knowing(slice.committed, "player", ids.enemy.hand));
    expect(outcome.slice.committed.sides.enemy.banished).toEqual([]);

    // Only the cards the filtered prompt offered were shown, so only they stay known.
    const filtered = suspend(setup(chosenCharacterThenFail.id, [v.vanilla1.id, v.event1.id, v.vanilla2.id, v.event0.id]));
    const characters = [filtered.ids.enemy.hand[0], filtered.ids.enemy.hand[2]];
    expect(filtered.pending.prompt).toMatchObject({ candidates: characters });
    const recovered = createFoldAdapter(engine, { checkEventPrefix: true })
      .reduce(filtered.slice, { kind: "answer", side: "player", promptId: filtered.pending.prompt.id, value: [characters[0]] });
    if (recovered.kind !== "applied" || recovered.error === null) throw new Error("expected synthetic failure");
    expect(recovered.published).toEqual([]);
    expect(recovered.slice.committed).toEqual(knowing(filtered.slice.committed, "player", characters));
    const shown = view(recovered.slice.committed, "player", engine.catalog).instances;
    expect(shown[filtered.ids.enemy.hand[1]]).toBeUndefined();
    expect(shown[filtered.ids.enemy.hand[3]]).toBeUndefined();

    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const named = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [handThenFail.id, v.vanilla1.id], deck }, enemy: { deck } });
    const start: BattleSlice = { committed: named.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const failed = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(named.ids, "player").action });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected synthetic failure");
    expect(banishedOf(failed.published)).toEqual([]);
    expect(failed.slice.committed.sides.player.hand).toEqual([named.ids.player.hand[1]]);
    expect(failed.slice.committed.sides.player.banished).toEqual([]);
  });
});
