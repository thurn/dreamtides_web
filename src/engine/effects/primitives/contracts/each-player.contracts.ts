import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { enemyCharacter, event, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseCardsPrompt, PromptId } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { chooseOne } from "../choose-one";
import { discard } from "../discard";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { eachPlayer } from "../each-player";
import { gainEnergy } from "../gain-energy";
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

const eachEngine = createEngine(testCatalog([eachDiscards, eachDrawsThenYou, eachEmptiesHand, eachDiscardsForOpponent, eachDiscardsThenFail]));

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

    it("keeps nothing of either player's discard when the step fails after both answered", () => {
      const fold = createFoldAdapter(eachEngine, { checkEventPrefix: true });
      const { state, ids } = boardState(eachEngine.catalog, setup("player", eachDiscardsThenFail.id));
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const first = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
      const firstPrompt = fold.pending(first)!;
      const second = applied(fold.reduce(first, { kind: "answer", side: "player", promptId: firstPrompt.prompt.id, value: [ids.player.hand[1]] }));
      const secondPrompt = fold.pending(second)!;
      const outcome = fold.reduce(second, { kind: "answer", side: "enemy", promptId: secondPrompt.prompt.id, value: [ids.enemy.hand[0]] });
      if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
      expect(outcome.published).toEqual([]);
      expect(outcome.slice.inFlight).toBeNull();
      expect(outcome.slice.committed).toEqual(second.committed);
      expect(outcome.slice.committed.sides.player.void).toEqual([]);
      expect(outcome.slice.committed.sides.enemy.void).toEqual([]);
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
