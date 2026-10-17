/** "Return all but one character you control to hand. Draw a card for each character returned." */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { event, keyword, staticAbility } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineEvent } from "../../../events";
import type { EngineLogRecord } from "../../../log";
import { aiDecision, runPolicy } from "../../../policy/decide";
import { boardInit, ITERATIONS_ONLY } from "../../../policy/policy.fixtures";
import { isLegalAnswer } from "../../../prompts/answers";
import { stateHash } from "../../../state/hash";
import { opponent, type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, placeFigment, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView } from "../../../view/view";
import { reclaimNotBanished } from "../reclaim-not-banished";
import { returnAllButOne } from "../return-all-but-one";

const drawing: EngineCardDefinition = { ...v.event0, id: syntheticId(0x9b00), status: "authored", abilities: () => [event(returnAllButOne({ drawForEach: true }))] };
const plain: EngineCardDefinition = { ...v.event0, id: syntheticId(0x9b01), status: "authored", abilities: () => [event(returnAllButOne())] };
const untargetable: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x9b02), status: "authored", abilities: () => [keyword("cannotBeTargeted")] };
const notBanished: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x9b03), status: "authored", abilities: () => [staticAbility(reclaimNotBanished())] };
const engine = createEngine(testCatalog([drawing, plain, untargetable, notBanished]));
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

function setup(controller: Side, back: readonly CardId[], front: readonly CardId[] = [], effect = drawing.id): BoardSetup {
  return {
    active: controller, phase: "day",
    [controller]: { hand: [effect], back, front, deck },
    [opponent(controller)]: { back: [v.vanilla3.id], hand: [v.event0.id], deck },
  };
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
function opened(board: BoardSetup, records: EngineLogRecord[] = [], prepare: (state: BattleState) => void = () => undefined) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const { state, ids } = boardState(engine.catalog, board);
  prepare(state);
  const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: playFromHand(ids, board.active).action }));
  return { fold, slice, ids, start };
}
const returnedOf = (events: readonly EngineEvent[]) => events.filter((e) => e.kind === "returnedToHand");

describe("returnAllButOne", () => {
  it.each(["player", "enemy"] as const)("%s keeps one chosen character, including an untargetable one, returns the rest and draws per return", (controller) => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids, start } = opened(setup(controller, [v.vanilla1.id, untargetable.id], [v.vanilla2.id]), records);
    const pending = fold.pending(slice)!;
    const cohort = [...ids[controller].back, ...ids[controller].front] as InstanceId[];
    expect(pending.prompt).toMatchObject({
      kind: "chooseCards", side: controller, candidates: cohort, min: 1, max: 1,
      cancellable: false, purpose: { role: "keep", source: ids[controller].hand[0], cardId: drawing.id },
    });
    expect(pending.prompt.privateTo).toBeUndefined();
    expect(promptView(pending.prompt, opponent(controller), pending.display)).toMatchObject({ candidates: cohort });
    const kept = ids[controller].back[1]!;
    const outcome = fold.reduce(slice, { kind: "answer", side: controller, promptId: pending.prompt.id, value: [kept] });
    const done = applied(outcome).committed;
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(done.instances[kept].zone).toBe("play");
    const returned = cohort.filter((id) => id !== kept);
    expect(returnedOf(outcome.published)).toEqual(returned.map((instance) => ({ kind: "returnedToHand", instance, side: controller })));
    expect(done.sides[controller].hand.slice(0, 2)).toEqual(returned);
    expect(done.sides[controller].hand).toHaveLength(4);
    expect(done.sides[controller].deck).toHaveLength(deck.length - 2);
    expect(done.sides[opponent(controller)].backRank.filter(Boolean)).toEqual(ids[opponent(controller)].back);
    expect(unannouncedChanges(outcome.published, start.committed, done)).toEqual([]);
    expect(invariantViolations(done, engine.catalog)).toEqual([]);
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", side: controller, role: "keep", cardId: drawing.id }));
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", side: controller, value: [kept] }));

    const other = opened(setup(controller, [v.vanilla1.id, untargetable.id], [v.vanilla2.id]));
    const untargetableKept = applied(other.fold.reduce(other.slice, { kind: "answer", side: controller, promptId: other.fold.pending(other.slice)!.prompt.id, value: [other.ids[controller].back[1]!] }));
    expect(untargetableKept.committed.instances[other.ids[controller].back[1]!].zone).toBe("play");
    expect(untargetableKept.committed.sides[controller].hand).toHaveLength(4);
  });

  it("asks nothing, returns nothing and draws nothing with zero or one character", () => {
    for (const back of [[], [untargetable.id]]) {
      const { fold, slice, ids, start } = opened(setup("player", back));
      expect(fold.pending(slice)).toBeNull();
      const direct = engine.apply(start.committed, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
      expect(direct.events.filter((e) => e.kind === "promptAutoAnswered" || e.kind === "returnedToHand" || e.kind === "cardDrawn")).toEqual([]);
      expect(slice.committed.sides.player.backRank.filter(Boolean)).toEqual(ids.player.back);
      expect(slice.committed.sides.player.hand).toEqual([]);
      expect(slice.committed.sides.player.deck).toHaveLength(deck.length);
      expect(slice.committed.sides.player.void).toEqual([ids.player.hand[0]]);
    }
  });

  it("counts only characters that reach a hand: an opponent-owned one does, a created or reclaimed one does not", () => {
    const records: EngineLogRecord[] = [];
    const figments: InstanceId[] = [];
    const { fold, slice, ids, start } = opened(setup("player", [v.vanilla2.id, v.vanilla1.id, v.vanilla1.id, v.vanilla1.id]), records, (state) => {
      const owned = state.sides.player.backRank;
      state.instances[owned[1]!] = { ...state.instances[owned[1]!], owner: "enemy" };
      state.instances[owned[2]!].status.reclaimed = true;
      figments.push(placeFigment(state, "player", { rank: "front", index: 0 }, { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null }));
    });
    const figment = figments[0];
    const [kept, borrowed, reclaimed, ordinary] = ids.player.back as InstanceId[];
    const prompt = fold.pending(slice)!.prompt;
    expect(prompt).toMatchObject({ candidates: [...ids.player.back, figment] });
    const outcome = fold.reduce(slice, { kind: "answer", side: "player", promptId: prompt.id, value: [kept] });
    const done = applied(outcome).committed;
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(returnedOf(outcome.published)).toEqual([
      { kind: "returnedToHand", instance: borrowed, side: "enemy" },
      { kind: "returnedToHand", instance: ordinary, side: "player" },
    ]);
    expect(done.instances[borrowed]).toMatchObject({ zone: "hand", owner: "enemy", controller: "enemy" });
    expect(done.sides.enemy.hand).toEqual([...ids.enemy.hand, borrowed]);
    expect(done.instances[reclaimed].zone).toBe("banished");
    expect(done.instances[figment]).toBeUndefined();
    expect(outcome.published).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: figment }));
    expect(done.sides.player.hand).toHaveLength(1 + 2);
    expect(done.sides.player.deck).toHaveLength(deck.length - 2);
    expect(unannouncedChanges(outcome.published, start.committed, done)).toEqual([]);
    expect(invariantViolations(done, engine.catalog)).toEqual([]);
    expect(records.filter((record) => record.event === "engine.returnedToHand")).toHaveLength(2);
  });

  it("honors a kept character's 'Cards you reclaim are not banished', counting the reclaimed return", () => {
    const { fold, slice, ids } = opened(setup("player", [notBanished.id, v.vanilla1.id, v.vanilla2.id]), [], (state) => {
      state.instances[state.sides.player.backRank[1]!].status.reclaimed = true;
    });
    const [keeper, reclaimed, ordinary] = ids.player.back as InstanceId[];
    const done = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: fold.pending(slice)!.prompt.id, value: [keeper] })).committed;
    expect(done.instances[reclaimed]).toMatchObject({ zone: "hand", status: { reclaimed: false } });
    expect(done.sides.player.hand.slice(0, 2)).toEqual([reclaimed, ordinary]);
    expect(done.sides.player.hand).toHaveLength(4);
    expect(done.sides.player.deck).toHaveLength(deck.length - 2);
  });

  it("returns without drawing when the draw is not part of the effect", () => {
    const { state, ids } = boardState(engine.catalog, setup("player", [v.vanilla1.id, v.vanilla2.id], [], plain.id));
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[ids.player.back[0]!]]));
    expect(result.state.sides.player.hand).toEqual([ids.player.back[1]]);
    expect(result.state.sides.player.deck).toHaveLength(deck.length);
  });

  it("applies Greedy's legal keep answer after reload", () => {
    const { fold, slice, ids } = opened(setup("enemy", [v.vanilla1.id, v.vanilla3.id], [v.vanilla2.id]));
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    expect(pending).toEqual(fold.pending(slice));
    const decision = aiDecision({ engine, init: boardInit, slice: saved, pending, side: "enemy", policy: "greedy", budgets: ITERATIONS_ONLY });
    if (decision?.kind !== "prompt") throw new Error("expected the enemy's keep prompt");
    expect(decision.request.decision).toMatchObject({ kind: "prompt", prompt: { purpose: { role: "keep" } } });
    const result = runPolicy(engine, decision.request);
    if (result.choice.kind !== "answer" || !Array.isArray(result.choice.value)) throw new Error("expected a keep selection");
    const selected = result.choice.value;
    expect(isLegalAnswer(pending.prompt, selected)).toBe(true);
    const cohort = [...ids.enemy.back, ...ids.enemy.front].filter((id): id is InstanceId => id !== null);
    const kept = cohort.find((id) => id === selected[0]);
    if (kept === undefined) throw new Error("expected an eligible keeper");
    const hash = stateHash(saved.committed);
    for (const value of [[], [ids.enemy.back[0]!, ids.enemy.back[1]!], [ids.player.back[0]!]]) {
      expect(fresh.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(saved, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(hash);
    const outcome = fresh.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: selected });
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    const returned = cohort.filter((id) => id !== kept);
    expect(done.committed.instances[kept].zone).toBe("play");
    expect(returnedOf(outcome.published)).toEqual(returned.map((instance) => ({ kind: "returnedToHand", instance, side: "enemy" })));
    for (const id of returned) expect(done.committed.instances[id].zone).toBe("hand");
    expect(done.committed.sides.enemy.hand.slice(0, returned.length)).toEqual(returned);
    expect(done.committed.sides.enemy.hand).toHaveLength(returned.length * 2);
    expect(done.committed.sides.enemy.deck).toHaveLength(deck.length - returned.length);
    expect(fresh.pending(done)).toBeNull();
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });
});
