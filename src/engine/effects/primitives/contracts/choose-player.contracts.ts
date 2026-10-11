import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, all, costPaid, energy, energyX, event, optionalCost, target, x } from "../../../dsl/builders";
import { whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type CardId, type Side } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { chooseOne } from "../choose-one";
import { choosePlayer } from "../choose-player";
import { discard } from "../discard";
import { draw } from "../draw";
import { delayed } from "../floating-trigger";
import { forDuration } from "../for-duration";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

const swap: EngineCardDefinition = {
  id: syntheticId(980), cardType: "event", costs: [energyX(0)], spark: null,
  subtype: "", speed: "standard", status: "authored",
  abilities: () => [event(choosePlayer((player) => sequence(discard(x(), player), draw(x(), player))))],
};
const trailing: EngineCardDefinition = {
  ...swap, id: syntheticId(981), costs: [],
  abilities: () => [event(sequence(choosePlayer((player) => draw(1, player)), draw(1)))],
};
const paid: EngineCardDefinition = {
  ...trailing, id: syntheticId(987),
  abilities: () => [additionalCost(optionalCost(energy(1))), event(choosePlayer((player) => ifThen(costPaid(), gainPoints(3, player), gainPoints(1, player))))],
};
const nested: EngineCardDefinition = {
  ...trailing, id: syntheticId(982),
  abilities: () => [event(choosePlayer((player) => chooseOne(
    gainSpark(target({ controller: player }), 2), gainPoints(3, player),
  )))],
};
const sharedTarget = target({ controller: "opponent" });
const sharedMode = chooseOne(gainSpark(sharedTarget, 1), gainPoints(3));
const sharedChoices: EngineCardDefinition = {
  ...trailing, id: syntheticId(986),
  abilities: () => [event(sequence(sharedMode, choosePlayer(() => sharedMode), sharedMode))],
};
const duration: EngineCardDefinition = {
  ...trailing, id: syntheticId(983),
  abilities: () => [event(forDuration("untilEndOfTurn", choosePlayer((player) => sparkModifier(all({ controller: player }), 2))))],
};
const root: EngineCardDefinition = {
  ...trailing, id: syntheticId(984),
  abilities: () => [event(choosePlayer((player) => delayed(whenYouPlay({ cardType: "event" }), draw(1, player))))],
};
const failing: EngineCardDefinition = {
  ...trailing, id: syntheticId(985), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, choosePlayer((player) => sequence(discard(1, player), draw(2, player))), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic chosen-player failure after discard and draw");
    },
  },
};
const engine = createEngine(testCatalog([swap, trailing, nested, duration, root, failing, sharedChoices, paid]));
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
const hand = [v.vanilla1.id, v.vanilla1.id, v.vanilla2.id];
const setup = (controller: Side = "player", card = swap.id, selectedHand: readonly CardId[] = hand): BoardSetup => ({
  active: controller, phase: "day",
  [controller]: { hand: [card, ...hand], energy: 4, deck },
  [opponent(controller)]: { hand: selectedHand, deck },
});
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
function opened(board = setup("player", trailing.id), records: EngineLogRecord[] = []) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const { state, ids } = boardState(engine.catalog, board);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: playFromHand(ids, board.active).action }));
  return { fold, slice, ids, start };
}

describe("choosePlayer", () => {
  it.each(["player", "enemy"] as const)("%s controls both choices of affected side and keeps X independent of the discarded count", (controller) => {
    for (const mode of [0, 1]) {
      const side = mode === 0 ? controller : opponent(controller);
      const result = runScenario(engine, {
        board: setup(controller), steps: (ids) => [playFromHand(ids, controller)],
        answers: (ids) => [2, mode, [ids[side].hand[mode === 0 ? 1 : 0], ids[side].hand[mode === 0 ? 3 : 2]]],
      });
      const discarded = result.events.filter((event) => event.kind === "discarded");
      expect(discarded).toHaveLength(2);
      expect(discarded.every((event) => event.side === side)).toBe(true);
      expect(result.state.sides[side].hand).toHaveLength(3);
      expect(result.state.sides[side].deck).toHaveLength(4);
      expect(result.state.sides[controller].currentEnergy).toBe(2);
      expect(result.state.instances[result.ids[controller].hand[0]].controller).toBe(controller);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it("admits generic X zero, and draws the full X after short or empty selected hands", () => {
    for (const count of [0, 3]) for (const selectedHand of [[], [v.vanilla1.id]]) {
      const result = runScenario(engine, {
        board: setup("player", swap.id, selectedHand), steps: (ids) => [playFromHand(ids, "player")], answers: () => [count, 1],
      });
      expect(result.state.sides.enemy.deck).toHaveLength(6 - count);
      expect(result.state.sides.enemy.hand).toHaveLength(count === 0 ? selectedHand.length : count);
      expect(result.events.filter((event) => event.kind === "discarded")).toHaveLength(count === 0 ? 0 : selectedHand.length);
      expect(result.state.sides.player.hand).toHaveLength(3);
    }
  });

  it.each(["player", "enemy"] as const)("the selected opponent owns the discard, and %s cannot see that private hand choice", (controller) => {
    // No paid X prompt, so this fixture opens on the player choice itself.
    const board = setup(controller, failing.id);
    const { fold, slice, ids } = opened(board);
    const choice = fold.pending(slice)!.prompt;
    expect(choice).toMatchObject({ kind: "chooseMode", side: controller, cancellable: false, purpose: { role: "choosePlayer", source: ids[controller].hand[0], cardId: failing.id } });
    const next = applied(fold.reduce(slice, { kind: "answer", side: controller, promptId: choice.id, value: 1 }));
    const pending = fold.pending(next)!;
    const selected = opponent(controller);
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", side: selected, candidates: ids[selected].hand, min: 1, max: 1, cancellable: false, purpose: { role: "discard", source: ids[controller].hand[0] } });
    expect((promptView(pending.prompt, controller, pending.display) as ChooseCardsPrompt).candidates).toEqual([]);
    expect(view(pending.display, controller, engine.catalog).instances[ids[selected].hand[0]]).toBeUndefined();
    expect(view(pending.display, selected, engine.catalog).instances[ids[selected].hand[0]]).toBeDefined();
  });

  it("keeps the source ability's optional-cost binding inside the selected branch", () => {
    for (const paidCost of [false, true]) {
      const result = runScenario(engine, {
        board: setup("player", paid.id), steps: (ids) => [playFromHand(ids, "player")], answers: () => [paidCost, 1],
      });
      expect(result.state.sides.enemy.score).toBe(paidCost ? 3 : 1);
      expect(result.state.sides.player.score).toBe(0);
      expect(result.state.sides.player.currentEnergy).toBe(paidCost ? 3 : 4);
    }
  });

  it("chooses only the selected branch's modes and targets at resolution", () => {
    const board = { ...setup("player", nested.id), player: { hand: [nested.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } };
    const { fold, slice, ids } = opened(board);
    expect(fold.pending(slice)!.prompt.purpose.role).toBe("choosePlayer");
    const choice = fold.pending(slice)!.prompt;
    const modeSlice = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: choice.id, value: 1 }));
    const mode = fold.pending(modeSlice)!.prompt;
    expect(mode).toMatchObject({ kind: "chooseMode", cancellable: false, purpose: { role: "chooseOne" }, options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
    const targetSlice = applied(fold.reduce(modeSlice, { kind: "answer", side: "player", promptId: mode.id, value: 0 }));
    const prompt = fold.pending(targetSlice)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets", candidates: ids.enemy.back, cancellable: false });
    const done = applied(fold.reduce(targetSlice, { kind: "answer", side: "player", promptId: prompt.id, value: [ids.enemy.back[1]!] }));
    expect(effectiveSpark(done.committed, engine.catalog, ids.enemy.back[1]!)).toBe(4);
    expect(effectiveSpark(done.committed, engine.catalog, ids.enemy.back[0]!)).toBe(1);
    // The empty controller branch still remains a valid player choice, whose only modal option is points.
    const alternate = runScenario(engine, { board, steps: (ids) => [playFromHand(ids, "player")], answers: () => [0] });
    expect(alternate.state.sides.player.score).toBe(3);
  });

  it("keeps enclosing target and mode bindings when their same objects are chosen within the selected subtree", () => {
    const result = runScenario(engine, {
      board: { ...setup("player", sharedChoices.id), enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [0, [ids.enemy.back[0]!], 1, 0, [ids.enemy.back[1]!]],
    });
    expect(effectiveSpark(result.state, engine.catalog, result.ids.enemy.back[0]!)).toBe(3);
    expect(effectiveSpark(result.state, engine.catalog, result.ids.enemy.back[1]!)).toBe(3);
    expect(result.state.sides.player.score).toBe(0);
    const differentMode = runScenario(engine, {
      board: { ...setup("player", sharedChoices.id), enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [0, [ids.enemy.back[0]!], 1, 1],
    });
    expect(effectiveSpark(differentMode.state, engine.catalog, differentMode.ids.enemy.back[0]!)).toBe(3);
    expect(differentMode.state.sides.player.score).toBe(3);
  });

  it("keeps trailing you effects, enclosing duration, and delayed trigger root provenance", () => {
    const drawResult = runScenario(engine, { board: setup("enemy", trailing.id), steps: (ids) => [playFromHand(ids, "enemy")], answers: () => [1] });
    expect(drawResult.state.sides.player.deck).toHaveLength(5);
    expect(drawResult.state.sides.enemy.deck).toHaveLength(5);
    const durationResult = runScenario(engine, {
      board: { ...setup("player", duration.id), enemy: { back: [v.vanilla1.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")], answers: () => [1],
    });
    const affected = durationResult.ids.enemy.back[0]!;
    expect(effectiveSpark(durationResult.state, engine.catalog, affected)).toBe(3);
    expect(durationResult.state.floating[0]).toMatchObject({ controller: "player", source: durationResult.ids.player.hand[0], expiry: { at: "endOfTurn" } });
    let ended = durationResult.state;
    for (const side of ["player", "enemy", "player"] as const) ended = engine.apply(ended, side, { kind: "pass" }, NO_PROMPTS).state;
    expect(effectiveSpark(ended, engine.catalog, affected)).toBe(1);
    const trigger = runScenario(engine, {
      board: { ...setup("player", root.id), player: { hand: [root.id, v.event0.id], deck } },
      steps: (ids) => [playFromHand(ids, "player"), playFromHand(ids, "player", 1)], answers: () => [1],
    });
    expect(trigger.state.sides.enemy.deck).toHaveLength(5);
    expect(trigger.state.sides.player.deck).toHaveLength(6);
    expect(trigger.events.some((event) => event.kind === "triggerResolved")).toBe(true);
    expect(trigger.state.floating).toEqual([]);
  });

  it("reloads both sequential prompts, rejects stale, wrong-side and concurrent intents, and commits exactly once", () => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids } = opened(setup("player", failing.id), records);
    const choice = fold.pending(slice)!.prompt;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    expect(fresh.pending(saved)!.prompt).toEqual(choice);
    expect(fresh.reduce(saved, { kind: "answer", side: "enemy", promptId: choice.id, value: 1 })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { kind: "answer", side: "player", promptId: choice.id, value: 2 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "player", promptId: choice.id, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: choice.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const selected = applied(fold.reduce(saved, { kind: "answer", side: "player", promptId: choice.id, value: 1 }));
    const reload = JSON.parse(JSON.stringify(selected)) as BattleSlice;
    const discardPrompt = fresh.pending(reload)!.prompt;
    expect(discardPrompt).toEqual(fold.pending(selected)!.prompt);
    expect(fresh.reduce(reload, { kind: "answer", side: "player", promptId: choice.id, value: 0 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reload, { kind: "answer", side: "player", promptId: discardPrompt.id, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reload, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const before = stateHash(reload.committed);
    const failed = fresh.reduce(reload, { kind: "answer", side: "enemy", promptId: discardPrompt.id, value: [ids.enemy.hand[2]] });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected synthetic failure");
    expect(failed.published).toEqual([]);
    expect(failed.slice.inFlight).toBeNull();
    expect(stateHash(failed.slice.committed)).toBe(before);
    expect(failed.slice.committed.sides.enemy.hand).toEqual(ids.enemy.hand);
    expect(failed.slice.committed.sides.enemy.deck).toEqual(ids.enemy.deck);
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", side: "player", role: "choosePlayer", source: ids.player.hand[0], cardId: failing.id }));
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", side: "player", value: 1 }));
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", side: "enemy", role: "discard", source: ids.player.hand[0] }));
    const normal = opened(setup("player", trailing.id));
    const normalPrompt = normal.fold.pending(normal.slice)!.prompt;
    const intent = { kind: "answer" as const, side: "player" as const, promptId: normalPrompt.id, value: 1 };
    const done = applied(normal.fold.reduce(normal.slice, intent));
    expect(normal.fold.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(done.committed.sides.enemy.deck).toHaveLength(5);
    expect(done.committed.sides.player.deck).toHaveLength(5);
  });

  it("cancels paid-X preparation before player selection with no partial binding or payment", () => {
    const { fold, slice, start } = opened(setup());
    const prompt = fold.pending(slice)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseNumber", cancellable: true, purpose: { role: "chooseX" } });
    const cancelled = applied(fold.reduce(slice, { kind: "cancel", side: "player", promptId: prompt.id }));
    expect(cancelled.committed).toEqual(start.committed);
    expect(cancelled.inFlight).toBeNull();
  });
});
