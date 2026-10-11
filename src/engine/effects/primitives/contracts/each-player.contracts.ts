import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { enemyCharacter, event, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { EngineLogRecord } from "../../../log";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseCardsPrompt, PromptId } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { createInPlay, instanceOf, moveInstance, returnToHand } from "../../../rules/zones";
import { abandonCharacter } from "../../../rules/costs";
import { BASE_VARIANT } from "../../../dsl/types";
import { stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, type InstanceId, type Side } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { chooseOne } from "../choose-one";
import { discard } from "../discard";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { eachPlayer } from "../each-player";
import { gainEnergy } from "../gain-energy";
import { foresee } from "../foresee";
import { discover } from "../discover";
import { reveal } from "../reveal";
import { sequence } from "../sequence";
import { PickingSource, deck, v } from "./cards-support";

/** Synthetic "each player" effects, independent of catalog text. */
const eachDiscards: EngineCardDefinition = {
  id: syntheticId(6200), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(eachPlayer(discard(1)))],
};

/** "Each player draws a card, then you draw a card": the controller's part does not leak into the sibling. */
const eachDrawsThenYou: EngineCardDefinition = {
  ...eachDiscards, id: syntheticId(6201), abilities: () => [event(sequence(eachPlayer(draw(1)), draw(1)))],
};

/** "Each player discards their hand, then each player draws 2 and the opponent gains 1●." */
const eachEmptiesHand: EngineCardDefinition = {
  ...eachDiscards, id: syntheticId(6202),
  abilities: () => [event(sequence(
    eachPlayer(discard({ value: "handSize", player: "you" })),
    eachPlayer(sequence(draw(2), gainEnergy(1, "opponent"))),
  ))],
};

/** Resolves "each player discards a card" with the non-active side as its controller. */
const eachDiscardsForOpponent: EngineCardDefinition = {
  ...eachDiscards, id: syntheticId(6203), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, eachPlayer(discard(1)), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: opponent(ctx.state.turn.active), x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
    },
  },
};

/** Fails after both players' discards, inside the same step. */
const eachDiscardsThenFail: EngineCardDefinition = {
  ...eachDiscards, id: syntheticId(6204), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, eachPlayer(discard(1)), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after each player's discard");
    },
  },
};

/** A discarded card returns to a hidden zone before the next prompt. */
const discardReturnsThenFail: EngineCardDefinition = {
  ...eachDiscardsThenFail, id: syntheticId(6205),
  synthetic: {
    resolve(ctx, item) {
      const env = { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } };
      resolveEffect(ctx, discard(1), env);
      returnToHand(ctx, ctx.state.sides[item.controller].void[0]);
      resolveEffect(ctx, discard(1, "opponent"), env);
      throw new Error("synthetic failure after returning a discarded card");
    },
  },
};

const privateThenFail: EngineCardDefinition = {
  ...eachDiscardsThenFail, id: syntheticId(6206),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, sequence(foresee(2), eachPlayer(discard(1))), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after private and public exposures");
    },
  },
};

/** A blind shuffle ends tracking of the publicly discarded card before the next prompt. */
const discardShuffledThenFail = (drawAfterShuffle: boolean): EngineCardDefinition => ({
  ...eachDiscardsThenFail, id: syntheticId(drawAfterShuffle ? 6212 : 6210),
  synthetic: {
    resolve(ctx, item) {
      const env = { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } };
      resolveEffect(ctx, discard(1), env);
      moveInstance(ctx, ctx.state.sides[item.controller].void[0], "deck");
      resolveEffect(ctx, discover({}, { costExactly: 2 }), env);
      if (drawAfterShuffle) resolveEffect(ctx, draw(ctx.state.sides[item.controller].deck.length), env);
      resolveEffect(ctx, discard(1, "opponent"), env);
      throw new Error("synthetic failure after a blind shuffle");
    },
  },
});

const discardDiscovered = discardShuffledThenFail(false);
const discardDiscoveredThenDrawn = discardShuffledThenFail(true);

const revealThenFail: EngineCardDefinition = {
  ...eachDiscardsThenFail, id: syntheticId(6211),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, reveal("opponent"), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      eachDiscardsThenFail.synthetic!.resolve!(ctx, item);
    },
  },
};

const recoveryFigment: EngineFigmentDefinition = {
  id: parseFigmentId(syntheticId(6209)), subtype: "Warrior", spark: 1, status: "authored", abilities: () => [],
};

const bornThenFail = (ceased: boolean): EngineCardDefinition => ({
  ...eachDiscardsThenFail, id: syntheticId(ceased ? 6208 : 6207),
  synthetic: {
    resolve(ctx, item) {
      const born = createInPlay(ctx, { kind: "figment", figment: recoveryFigment.id, spark: 1 }, item.controller, BASE_VARIANT, { rank: "back", index: 0 });
      if (ceased) abandonCharacter(ctx, item.controller, born);
      eachDiscardsThenFail.synthetic!.resolve!(ctx, item);
    },
  },
});

const bornAlive = bornThenFail(false);
const bornCeased = bornThenFail(true);
const eachEngine = createEngine(testCatalog([
  eachDiscards, eachDrawsThenYou, eachEmptiesHand, eachDiscardsForOpponent, eachDiscardsThenFail,
  discardReturnsThenFail, privateThenFail, discardDiscovered, discardDiscoveredThenDrawn, revealThenFail, bornAlive, bornCeased,
], {}, [recoveryFigment]));

const setup = (active: Side, card = eachDiscards.id): BoardSetup => {
  const other = opponent(active);
  return {
    active, phase: "day",
    [active]: { hand: [card, v.vanilla1.id, v.event1.id], deck, energy: 3 },
    [other]: { hand: [v.vanilla2.id, v.vanilla3.id], deck },
  };
};

const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
};

const discardedSides = (events: readonly EngineEvent[]): Side[] =>
  events.flatMap((e) => (e.kind === "discarded" ? [e.side] : []));

describe("eachPlayer", () => {
  it("resolves its effect for the active player first, then the opposing player, each choosing from their own hand", () => {
    for (const active of ["player", "enemy"] as const) {
      const { state, ids } = boardState(eachEngine.catalog, setup(active));
      const source = new PickingSource((candidates) => [candidates[candidates.length - 1]]);
      const result = eachEngine.apply(state, active, playFromHand(ids, active).action, source);
      const other = opponent(active);
      expect(source.prompts.map((prompt) => prompt.side)).toEqual([active, other]);
      expect(source.prompts.map((prompt) => (prompt as ChooseCardsPrompt).candidates)).toEqual([ids[active].hand.slice(1), ids[other].hand]);
      expect(source.prompts.every((prompt) => prompt.purpose.source === ids[active].hand[0] && prompt.purpose.role === "discard")).toBe(true);
      expect(discardedSides(result.events)).toEqual([active, other]);
      expect(result.state.sides[active].void).toContain(ids[active].hand[2]);
      expect(result.state.sides[other].void).toEqual([ids[other].hand[1]]);
      expect(invariantViolations(result.state, eachEngine.catalog)).toEqual([]);
    }
  });

  it("orders by the active player even when the controller is the opposing player", () => {
    const { state, ids } = boardState(eachEngine.catalog, setup("player", eachDiscardsForOpponent.id));
    const source = new PickingSource((candidates) => [candidates[0]]);
    const result = eachEngine.apply(state, "player", playFromHand(ids, "player").action, source);
    expect(source.prompts.map((prompt) => prompt.side)).toEqual(["player", "enemy"]);
    expect(discardedSides(result.events)).toEqual(["player", "enemy"]);
  });

  it("binds 'you' to each player in turn and restores the controller for sibling effects", () => {
    const drawn = runScenario(eachEngine, { board: setup("enemy", eachDrawsThenYou.id), steps: (ids) => [playFromHand(ids, "enemy")] });
    expect(drawn.state.sides.enemy.hand).toHaveLength(drawn.ids.enemy.hand.length - 1 + 2);
    expect(drawn.state.sides.player.hand).toHaveLength(drawn.ids.player.hand.length + 1);
    expect(drawn.events.flatMap((e) => (e.kind === "cardDrawn" ? [e.side] : []))).toEqual(["enemy", "player", "enemy"]);

    const emptied = runScenario(eachEngine, { board: setup("player", eachEmptiesHand.id), steps: (ids) => [playFromHand(ids, "player")] });
    expect(emptied.answers).toEqual([expect.objectContaining({ auto: true }), expect.objectContaining({ auto: true })]);
    expect([...emptied.state.sides.player.void].sort()).toEqual([...emptied.ids.player.hand].sort());
    expect([...emptied.state.sides.enemy.void].sort()).toEqual([...emptied.ids.enemy.hand].sort());
    expect(emptied.state.sides.player.hand).toHaveLength(2);
    expect(emptied.state.sides.enemy.hand).toHaveLength(2);
    expect(emptied.state.sides.player.currentEnergy - emptied.start.sides.player.currentEnergy).toBe(1);
    expect(emptied.state.sides.enemy.currentEnergy - emptied.start.sides.enemy.currentEnergy).toBe(1);
    expect(invariantViolations(emptied.state, eachEngine.catalog)).toEqual([]);
  });

  it("skips a player with nothing to discard without prompting them", () => {
    const board: BoardSetup = { ...setup("player"), enemy: { hand: [], deck } };
    const { state, ids } = boardState(eachEngine.catalog, board);
    const source = new PickingSource((candidates) => [candidates[0]]);
    const result = eachEngine.apply(state, "player", playFromHand(ids, "player").action, source);
    expect(source.prompts.map((prompt) => prompt.side)).toEqual(["player"]);
    expect(discardedSides(result.events)).toEqual(["player"]);
  });

  it("rejects a play-time target or mode, which one controller would choose for every player", () => {
    expect(() => eachPlayer(dissolve(target(enemyCharacter())))).toThrow();
    expect(() => eachPlayer(chooseOne(draw(1), gainEnergy(1)))).toThrow();
    expect(() => eachPlayer(sequence(draw(1), gainEnergy(1)))).not.toThrow();
  });

  describe("in the fold", () => {
    const suspend = () => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const board = setup("player");
      const { state, ids } = boardState(eachEngine.catalog, board);
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const slice = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      return { fold, slice, pending: fold.pending(slice)!, ids };
    };

    it("hides each player's hand from the other's view of their prompt", () => {
      const { fold, slice, pending, ids } = suspend();
      expect(pending.prompt.side).toBe("player");
      expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);
      const second = fold.pending(applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })))!;
      expect(second.prompt).toMatchObject({ side: "enemy", candidates: ids.enemy.hand, cancellable: false });
      expect((promptView(second.prompt, "player", second.display) as ChooseCardsPrompt).candidates).toEqual([]);
    });

    it("reloads to the second player's prompt after the first answered, rejecting stale, foreign, illegal and concurrent input", () => {
      const { fold, slice, pending, ids } = suspend();
      const afterFirst = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] }));
      const second = fold.pending(afterFirst)!;
      expect(second.prompt.id).not.toBe(pending.prompt.id);
      expect(second.display.sides.player.void).toEqual([ids.player.hand[1]]);
      const committed = stateHash(afterFirst.committed);
      expect(afterFirst.committed.sides.player.hand).toEqual(ids.player.hand.slice(1));

      const saved = JSON.parse(JSON.stringify(afterFirst)) as BattleSlice;
      const fresh = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      expect(fresh.pending(saved)).toEqual(second);
      const answer = (side: Side, promptId: PromptId, value: readonly InstanceId[]) => fresh.reduce(saved, { kind: "answer", side, promptId, value });
      expect(answer("player", pending.prompt.id, [ids.player.hand[2]])).toEqual({ kind: "bounced", reason: "stalePrompt" });
      expect(answer("player", second.prompt.id, [ids.enemy.hand[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      for (const value of [[], ids.enemy.hand, [ids.player.hand[2]], [ids.enemy.deck[0]]]) {
        expect(answer("enemy", second.prompt.id, value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      }
      expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(fresh.reduce(saved, { kind: "cancel", side: "enemy", promptId: second.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
      expect(stateHash(saved.committed)).toBe(committed);

      const outcome = answer("enemy", second.prompt.id, [ids.enemy.hand[0]]);
      const done = applied(outcome);
      if (outcome.kind !== "applied") throw new Error("answer bounced");
      expect(discardedSides(outcome.published)).toEqual(["enemy"]);
      expect(done.committed.sides.player.void).toContain(ids.player.hand[1]);
      expect(done.committed.sides.enemy.void).toEqual([ids.enemy.hand[0]]);
      expect(fresh.reduce(done, { kind: "answer", side: "enemy", promptId: second.prompt.id, value: [ids.enemy.hand[1]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      expect(invariantViolations(done.committed, eachEngine.catalog)).toEqual([]);
    });

    it.each(["player", "enemy"] as const)("retains only the knowledge already published before a later discard fails with %s active", (active) => {
      const other = opponent(active);
      const records: EngineLogRecord[] = [];
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true, log: (record) => records.push(record) });
      const { state, ids } = boardState(eachEngine.catalog, setup(active, eachDiscardsThenFail.id));
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const publications: EngineEvent[] = [];
      const collect = (outcome: IntentOutcome) => {
        if (outcome.kind !== "applied") throw new Error("unexpected bounce");
        publications.push(...outcome.published);
        return outcome;
      };
      const first = applied(collect(fold.reduce(start, { kind: "battleAction", side: active, action: playFromHand(ids, active).action })));
      const firstPrompt = fold.pending(first)!;
      const exposed = ids[active].hand[1];
      const unpublished = ids[other].hand[0];
      const second = applied(collect(fold.reduce(first, { kind: "answer", side: active, promptId: firstPrompt.prompt.id, value: [exposed] })));
      const secondPrompt = fold.pending(second)!;
      expect(view(secondPrompt.display, other, eachEngine.catalog).instances[exposed]?.printing).toEqual(state.instances[exposed].printing);
      expect(view(secondPrompt.display, active, eachEngine.catalog).instances[unpublished]).toBeUndefined();
      const outcome = collect(fold.reduce(second, { kind: "answer", side: other, promptId: secondPrompt.prompt.id, value: [unpublished] }));
      expect(outcome.error?.kind).toBe("engine_error");
      expect(outcome.published).toEqual([]);
      expect(discardedSides(publications)).toEqual([active]);
      expect(outcome.slice.inFlight).toBeNull();
      expect(fold.pending(outcome.slice)).toBeNull();
      expect(outcome.slice.committed.sides[active].void).toEqual([]);
      expect(outcome.slice.committed.sides[other].void).toEqual([]);
      expect(outcome.slice.committed.sides).toEqual(second.committed.sides);
      expect(view(outcome.slice.committed, active, eachEngine.catalog).instances[unpublished]).toBeUndefined();
      const expected = { ...second.committed, knownTo: { ...second.committed.knownTo, [other]: [exposed] } };
      expect(stateHash(second.committed)).toBe(stateHash(first.committed));
      expect(records.filter((record) => ["engine.promptOpened", "engine.promptAnswered", "engine.error"].includes(record.event)).map((record) => record.event)).toEqual([
        "engine.promptOpened", "engine.promptAnswered", "engine.promptOpened", "engine.promptAnswered", "engine.error",
      ]);
      expect(records.filter((record) => record.event === "engine.action").map((record) => record.action.kind)).toEqual(["play"]);
      expect(records.filter((record) => record.event === "engine.promptAnswered").map((record) => record.value)).toEqual([[exposed], [unpublished]]);
      const replayedFold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      let replayedSlice = start;
      const replayedEvents: EngineEvent[] = [];
      let replayedError = false;
      for (const record of records) {
        const replayedOutcome = record.event === "engine.action"
          ? replayedFold.reduce(replayedSlice, { kind: "battleAction", side: record.side, action: record.action })
          : record.event === "engine.promptAnswered"
            ? replayedFold.reduce(replayedSlice, { kind: "answer", side: record.side, promptId: replayedFold.pending(replayedSlice)!.prompt.id, value: record.value })
            : null;
        if (replayedOutcome === null) continue;
        if (replayedOutcome.kind !== "applied") throw new Error("log replay bounced");
        replayedEvents.push(...replayedOutcome.published);
        replayedSlice = replayedOutcome.slice;
        replayedError = replayedOutcome.error !== null;
      }
      expect(replayedError).toBe(true);
      expect(replayedEvents).toEqual(publications);
      expect(stateHash(replayedSlice.committed)).toBe(stateHash(outcome.slice.committed));
      // A reload from the last published prompt recovers the same state.
      const reloaded = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const saved = JSON.parse(JSON.stringify(second)) as BattleSlice;
      const again = reloaded.reduce(saved, { kind: "answer", side: other, promptId: reloaded.pending(saved)!.prompt.id, value: [unpublished] });
      if (again.kind !== "applied") throw new Error("reload bounced");
      expect(again.error?.kind).toBe("engine_error");
      expect(again.published).toEqual([]);
      expect(stateHash(again.slice.committed)).toBe(stateHash(outcome.slice.committed));
      expect(view(again.slice.committed, active, eachEngine.catalog)).toEqual(view(outcome.slice.committed, active, eachEngine.catalog));
      expect(view(again.slice.committed, other, eachEngine.catalog)).toEqual(view(outcome.slice.committed, other, eachEngine.catalog));
      expect(view(outcome.slice.committed, other, eachEngine.catalog).instances[exposed]?.printing).toEqual(state.instances[exposed].printing);
      expect(stateHash(outcome.slice.committed)).toBe(stateHash(expected));
    });

    it("keeps public identity learned during a published move even after the card returns to a hidden zone", () => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const { state, ids } = boardState(eachEngine.catalog, setup("player", discardReturnsThenFail.id));
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const first = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      const exposed = ids.player.hand[1];
      const next = fold.reduce(first, { kind: "answer", side: "player", promptId: fold.pending(first)!.prompt.id, value: [exposed] });
      const second = applied(next);
      if (next.kind !== "applied") throw new Error("unexpected bounce");
      expect(next.published.filter((event) => event.kind === "discarded" || event.kind === "returnedToHand").map((event) => event.kind)).toEqual(["discarded", "returnedToHand"]);
      const pending = fold.pending(second)!;
      expect(pending.display.instances[exposed].zone).toBe("hand");
      expect(view(pending.display, "enemy", eachEngine.catalog).instances[exposed]?.printing).toEqual(state.instances[exposed].printing);
      const done = fold.reduce(second, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] });
      if (done.kind !== "applied") throw new Error("unexpected bounce");
      expect(done.error?.kind).toBe("engine_error");
      expect(done.published).toEqual([]);
      expect(done.slice.inFlight).toBeNull();
      expect(stateHash(done.slice.committed)).toBe(stateHash({ ...second.committed, knownTo: { player: [], enemy: [exposed] } }));
      expect(view(done.slice.committed, "enemy", eachEngine.catalog).instances[exposed]?.printing).toEqual(state.instances[exposed].printing);
      expect(view(done.slice.committed, "player", eachEngine.catalog).instances[ids.enemy.hand[0]]).toBeUndefined();
    });

    it("keeps private deck exposure limited to its chooser while retaining the other side's committed tracking", () => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const { state, ids } = boardState(eachEngine.catalog, setup("player", privateThenFail.id));
      const [top, secondCard] = ids.player.deck;
      state.knownTo.enemy = [top];
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      let slice = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      const privatePrompt = fold.pending(slice)!;
      expect(view(privatePrompt.display, "enemy", eachEngine.catalog).sides.player.deck.known).toEqual([]);
      slice = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: privatePrompt.prompt.id, value: [{ card: top, to: "top" }, { card: secondCard, to: "top" }] }));
      const exposed = ids.player.hand[1];
      slice = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: fold.pending(slice)!.prompt.id, value: [exposed] }));
      const done = fold.reduce(slice, { kind: "answer", side: "enemy", promptId: fold.pending(slice)!.prompt.id, value: [ids.enemy.hand[0]] });
      if (done.kind !== "applied") throw new Error("unexpected bounce");
      expect(done.error?.kind).toBe("engine_error");
      expect(done.slice.committed.knownTo).toEqual({ player: [top, secondCard], enemy: [top, exposed] });
      expect(view(done.slice.committed, "player", eachEngine.catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }, { id: secondCard, index: 1 }]);
      expect(view(done.slice.committed, "enemy", eachEngine.catalog).sides.player.deck.known).toEqual([{ id: top, index: 0 }]);
      expect(stateHash(done.slice.committed)).toBe(stateHash({ ...slice.committed, knownTo: { player: [top, secondCard], enemy: [top, exposed] } }));
    });

    it.each([false, true])("respects a blind shuffle without revealing committed deck positions (draw afterward: %s)", (drawAfterShuffle) => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const card = drawAfterShuffle ? discardDiscoveredThenDrawn : discardDiscovered;
      const { state, ids } = boardState(eachEngine.catalog, setup("player", card.id));
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const first = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      const exposed = ids.player.hand[1];
      const second = applied(fold.reduce(first, { kind: "answer", side: "player", promptId: fold.pending(first)!.prompt.id, value: [exposed] }));
      const pending = fold.pending(second)!;
      expect(pending.prompt.side).toBe("enemy");
      expect(pending.display.instances[exposed].zone).toBe(drawAfterShuffle ? "hand" : "deck");
      expect(view(pending.display, "enemy", eachEngine.catalog).instances[exposed]).toBeUndefined();
      const discovered = ids.player.deck[1];
      expect(view(pending.display, "player", eachEngine.catalog).instances[discovered]?.zone).toBe("hand");
      const drawn = pending.display.sides.player.hand.filter((id) => ids.player.deck.includes(id) && id !== discovered);
      expect(drawn).toHaveLength(drawAfterShuffle ? ids.player.deck.length - 1 : 0);
      for (const id of drawn) expect(view(pending.display, "player", eachEngine.catalog).instances[id]?.zone).toBe("hand");
      const done = fold.reduce(second, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] });
      if (done.kind !== "applied") throw new Error("unexpected bounce");
      expect(done.error?.kind).toBe("engine_error");
      expect(view(done.slice.committed, "enemy", eachEngine.catalog).instances[exposed]).toBeUndefined();
      const reloaded = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const saved = JSON.parse(JSON.stringify(second)) as BattleSlice;
      const again = reloaded.reduce(saved, { kind: "answer", side: "enemy", promptId: reloaded.pending(saved)!.prompt.id, value: [ids.enemy.hand[0]] });
      if (again.kind !== "applied") throw new Error("reload bounced");
      expect(again.error?.kind).toBe("engine_error");
      expect(stateHash(again.slice.committed)).toBe(stateHash(done.slice.committed));
      for (const side of ["player", "enemy"] as const) {
        const recovered = view(done.slice.committed, side, eachEngine.catalog);
        expect(view(again.slice.committed, side, eachEngine.catalog)).toEqual(recovered);
        expect(recovered.sides.player.deck.known).toEqual([]);
        for (const id of ids.player.deck) expect(recovered.instances[id]).toBeUndefined();
      }
      expect(stateHash(done.slice.committed)).toBe(stateHash(second.committed));
    });

    it("keeps identities from a public reveal while its cards remain in an opposing hand", () => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const { state, ids } = boardState(eachEngine.catalog, setup("player", revealThenFail.id));
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const first = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      expect(view(fold.pending(first)!.display, "player", eachEngine.catalog).sides.enemy.hand.known.map(({ id }) => id)).toEqual(ids.enemy.hand);
      const exposed = ids.player.hand[1];
      const second = applied(fold.reduce(first, { kind: "answer", side: "player", promptId: fold.pending(first)!.prompt.id, value: [exposed] }));
      const done = fold.reduce(second, { kind: "answer", side: "enemy", promptId: fold.pending(second)!.prompt.id, value: [ids.enemy.hand[0]] });
      if (done.kind !== "applied") throw new Error("unexpected bounce");
      expect(done.error?.kind).toBe("engine_error");
      expect(view(done.slice.committed, "player", eachEngine.catalog).sides.enemy.hand.known.map(({ id }) => id)).toEqual(ids.enemy.hand);
      expect(stateHash(done.slice.committed)).toBe(stateHash({ ...second.committed, knownTo: { player: ids.enemy.hand, enemy: [exposed] } }));
    });

    it.each([bornAlive, bornCeased])("recovers without inventing a committed identity for a published temporary figment ($id)", (card) => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const { state, ids } = boardState(eachEngine.catalog, setup("player", card.id));
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const firstOutcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
      const first = applied(firstOutcome);
      if (firstOutcome.kind !== "applied") throw new Error("unexpected bounce");
      const born = firstOutcome.published.find((event) => event.kind === "materialized");
      if (born?.kind !== "materialized") throw new Error("expected a published materialize");
      expect(first.committed.instances[born.instance]).toBeUndefined();
      const exposed = ids.player.hand[1];
      const second = applied(fold.reduce(first, { kind: "answer", side: "player", promptId: fold.pending(first)!.prompt.id, value: [exposed] }));
      const done = fold.reduce(second, { kind: "answer", side: "enemy", promptId: fold.pending(second)!.prompt.id, value: [ids.enemy.hand[0]] });
      if (done.kind !== "applied") throw new Error("unexpected bounce");
      expect(done.error?.kind).toBe("engine_error");
      expect(done.slice.committed.instances[born.instance]).toBeUndefined();
      expect(done.slice.committed.knownTo.player).not.toContain(born.instance);
      expect(done.slice.committed.knownTo.enemy).not.toContain(born.instance);
      expect(stateHash(done.slice.committed)).toBe(stateHash({ ...second.committed, knownTo: { player: [], enemy: [exposed] } }));
      expect(invariantViolations(done.slice.committed, eachEngine.catalog)).toEqual([]);
    });

    it("replays recorded answers for both players to an identical result", () => {
      const { state, ids } = boardState(eachEngine.catalog, setup("player"));
      const scripted = new ScriptedSource([[ids.player.hand[2]], [ids.enemy.hand[1]]]);
      const inline = eachEngine.apply(state, "player", playFromHand(ids, "player").action, scripted);
      scripted.assertExhausted();
      const { fold, slice, pending } = suspend();
      const afterFirst = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[2]] }));
      const second = fold.pending(afterFirst)!;
      const done = applied(fold.reduce(afterFirst, { kind: "answer", side: "enemy", promptId: second.prompt.id, value: [ids.enemy.hand[1]] }));
      expect(stateHash(done.committed)).toBe(stateHash(inline.state));
    });
  });
});
