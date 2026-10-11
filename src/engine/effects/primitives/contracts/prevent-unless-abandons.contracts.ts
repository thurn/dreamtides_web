import { describe, expect, it } from "vitest";
import { AI } from "../../../../content/ai";
import type { EngineCardDefinition } from "../../../catalog";
import { event, stackItem } from "../../../dsl/builders";
import { onDissolved, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { greedyAnswer, stateCardInfo } from "../../../policy/prompts";
import { isLegalAnswer } from "../../../prompts/answers";
import type { Answer } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { prevent } from "../prevent";

const ransomEffect = prevent(stackItem({ controller: "opponent" }), { unlessAbandons: { figment: false } });
/** "Prevent a card the opponent played unless they abandon a non-figment character." */
const ransom: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(1320), status: "authored", abilities: () => [event(ransomEffect)] };
/** "Draw 2 cards." */
const study: EngineCardDefinition = { ...v.event1, id: syntheticId(1321), status: "authored", abilities: () => [event(draw(2))] };
/** "▸Dissolved: Gain 2⍟." */
const keeper: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(1322), status: "authored", abilities: () => [triggered(onDissolved(), gainPoints(2))] };
/** "Prevent a card the opponent played." */
const plain: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(1323), status: "authored", abilities: () => [event(prevent(stackItem({ controller: "opponent" })))],
};
/** Resolves the ransom against the opponent's card on the stack, then fails. */
const failing: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(1324), status: "authored", abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      const target = ctx.state.stack.find((entry) => entry.kind === "card" && entry.controller !== item.controller);
      if (target?.kind !== "card") throw new Error("no opposing stack card");
      resolveEffect(ctx, ransomEffect, {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [[target.instance]] },
      });
      throw new Error("synthetic failure after the ransom");
    },
  },
};
const engine = createEngine(testCatalog([ransom, study, keeper, plain, failing]));
const deck = Array.from({ length: 5 }, () => v.vanilla1.id);

/**
 * `prevented` plays the study holding two characters of unequal spark (a
 * 2-spark vanilla, then the 1-spark keeper) and a figment; its opponent
 * holds `answer` and one character of its own.
 */
function board(prevented: Side, answer: EngineCardDefinition = ransom, back = [v.vanilla2.id, keeper.id]) {
  const { state, ids } = boardState(engine.catalog, {
    active: prevented, phase: "day",
    [prevented]: { hand: [study.id], back, energy: 3, deck },
    [opponent(prevented)]: { hand: [answer.id], back: [v.vanilla2.id], energy: 3, deck },
  });
  const figment = placeFigment(state, prevented, { rank: "back", index: 2 }, { kind: "figmentCopy", cardId: v.vanilla3.id, spark: null });
  return { state, ids, figment, studied: ids[prevented].hand[0], answered: ids[opponent(prevented)].hand[0] };
}

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}

/** Plays the study, then the answer, through the fold: the ransom resolves and asks the study's controller. */
function opened(prevented: Side, answer: EngineCardDefinition = ransom, records: EngineLogRecord[] = []) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
  const placed = board(prevented, answer);
  const play = (slice: BattleSlice, side: Side, card: InstanceId) =>
    applied(fold.reduce(slice, { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
  const start: BattleSlice = { committed: placed.state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const slice = play(play(start, prevented, placed.studied), opponent(prevented), placed.answered);
  return { fold, slice, ...placed };
}

/** Answers the pending prompt, returning the applied slice and the events it published. */
function answer(fold: ReturnType<typeof createFoldAdapter>, slice: BattleSlice, value: Answer) {
  const pending = fold.pending(slice);
  if (pending === null) throw new Error("no pending prompt");
  const outcome = fold.reduce(slice, { kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value });
  return { slice: applied(outcome), published: outcome.kind === "applied" ? outcome.published : [] };
}

/** Plays the study and the answer through the engine with scripted answers. */
function played(prevented: Side, answers: readonly Answer[], back?: readonly InstanceId[] | null, answerCard: EngineCardDefinition = ransom) {
  const placed = board(prevented, answerCard, back === null ? [] : undefined);
  const source = new ScriptedSource(answers);
  const first = engine.apply(placed.state, prevented, { kind: "play", card: placed.studied, from: "hand" }, source);
  const second = engine.apply(first.state, opponent(prevented), { kind: "play", card: placed.answered, from: "hand" }, source);
  source.assertExhausted();
  const events: EngineEvent[] = [...first.events, ...second.events];
  expect(invariantViolations(second.state, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(events, placed.state, second.state)).toEqual([]);
  return { ...placed, state: second.state, events, answers: [...first.answers, ...second.answers] };
}

describe("prevent unless the opponent abandons", () => {
  it.each(["player", "enemy"] as const)("lets %s keep its card by abandoning one of its own non-figment characters", (prevented) => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids, figment, studied, answered } = opened(prevented, ransom, records);
    const preventer = opponent(prevented);
    const confirm = fold.pending(slice)!;
    expect(confirm.prompt).toMatchObject({
      kind: "confirm", side: prevented, cancellable: false,
      purpose: { role: "preventUnlessAbandons", source: answered, cardId: ransom.id, ability: 0 },
    });
    expect(confirm.prompt.privateTo).toBeUndefined();
    // Both sides see the same public choice; neither sees the other's hand or deck.
    for (const viewer of [prevented, preventer]) {
      expect(promptView(confirm.prompt, viewer, confirm.display)).toEqual(promptView(confirm.prompt, prevented, confirm.display));
      const battle = view(confirm.display, viewer, engine.catalog);
      expect(battle.instances[ids[opponent(viewer)].deck[0]]).toBeUndefined();
    }
    const accepted = answer(fold, slice, true);
    const choice = fold.pending(accepted.slice)!;
    const own = ids[prevented].back.filter((id): id is InstanceId => id !== null);
    expect(choice.prompt).toMatchObject({
      kind: "chooseCards", side: prevented, candidates: own, min: 1, max: 1, cancellable: false,
      purpose: { role: "abandon", source: answered, cardId: ransom.id },
    });
    expect(choice.prompt).not.toHaveProperty("candidates", expect.arrayContaining([figment]));
    expect(promptView(choice.prompt, preventer, choice.display)).toMatchObject({ candidates: own });
    const chosen = ids[prevented].back[1]!;
    const done = answer(fold, accepted.slice, [chosen]);
    const state = done.slice.committed;
    expect(done.published).toContainEqual({ kind: "abandoned", instance: chosen, side: prevented });
    expect(done.published.some((e) => e.kind === "prevented")).toBe(false);
    expect(done.published).toContainEqual(expect.objectContaining({ kind: "resolved", instance: studied }));
    expect(state.instances[chosen].zone).toBe("void");
    expect(state.instances[ids[prevented].back[0]!].zone).toBe("play");
    expect(state.instances[figment].zone).toBe("play");
    expect(state.instances[ids[preventer].back[0]!].zone).toBe("play");
    // The saved card resolved for its controller, and the abandoned character's ▸Dissolved fired.
    expect(state.sides[prevented].hand).toHaveLength(2);
    expect(state.sides[prevented].score).toBe(2);
    expect(state.sides[preventer].void).toEqual([answered]);
    expect(state.stack).toEqual([]);
    expect(invariantViolations(state, engine.catalog)).toEqual([]);
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", side: prevented, role: "preventUnlessAbandons", cardId: ransom.id }));
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", side: prevented, value: true }));
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", side: prevented, value: [chosen] }));
  });

  it("prevents the card when its controller declines, abandoning nothing", () => {
    const { state, events, ids, figment, studied } = played("player", [false]);
    expect(events).toContainEqual({ kind: "prevented", instance: studied, side: "player", to: "void", zoneOf: "player" });
    expect(events.some((e) => e.kind === "abandoned" || e.kind === "dissolved" || e.kind === "resolved" && e.instance === studied)).toBe(false);
    expect(state.sides.player.backRank.filter(Boolean)).toEqual([...ids.player.back, figment]);
    expect(state.sides.player.void).toEqual([studied]);
    expect(state.sides.player.hand).toEqual([]);
  });

  it("prevents the card without a prompt when its controller has no non-figment character", () => {
    const { state, events, answers, figment, studied } = played("player", [], null);
    // Only the ransom's own target, its one legal choice, is answered.
    expect(answers.map((recorded) => recorded.auto)).toEqual([true]);
    expect(events.filter((e) => e.kind === "promptAutoAnswered" && e.purpose.role !== "target")).toEqual([]);
    expect(events).toContainEqual({ kind: "prevented", instance: studied, side: "player", to: "void", zoneOf: "player" });
    expect(state.instances[figment].zone).toBe("play");
  });

  it("offers nothing and abandons nothing when its target left the stack before it resolved", () => {
    const { state: start, ids, studied } = board("player");
    const [ransomCard, plainCard] = [ids.enemy.hand[0], ids.player.hand[0]];
    // The stack holds the study, the ransom aimed at it, and a plain Prevent aimed at it on top.
    const plainId: InstanceId = `i${start.nextInstance}`;
    start.instances[plainId] = { ...start.instances[ransomCard], id: plainId, printing: { kind: "card", cardId: plain.id } };
    start.nextInstance += 1;
    for (const [id, controller, targets] of [[plainCard, "player", []], [ransomCard, "enemy", [[studied]]], [plainId, "enemy", [[studied]]]] as const) {
      const owner = start.instances[id].owner;
      start.sides[owner].hand = start.sides[owner].hand.filter((card) => card !== id);
      start.instances[id].zone = "stack";
      start.stack.push({ kind: "card", instance: id, controller, choices: [{ modes: [], targets: targets.map((list) => [...list]) }], x: null, optionalPaid: [] });
    }
    start.priority = "player";
    const { state, events, answers } = engine.apply(start, "player", { kind: "pass" }, NO_PROMPTS);
    expect(answers).toEqual([]);
    expect(events.filter((e) => e.kind === "prevented")).toEqual([{ kind: "prevented", instance: studied, side: "player", to: "void", zoneOf: "player" }]);
    expect(events).toContainEqual({ kind: "noLegalTarget", source: ransomCard });
    expect(events.some((e) => e.kind === "abandoned")).toBe(false);
    expect(state.sides.player.backRank.filter(Boolean)).toHaveLength(3);
    expect(state.stack).toEqual([]);
  });

  it("reconstructs both prompts after reload and rejects foreign, invalid, stale and concurrent input", () => {
    const { fold, slice, ids, figment } = opened("player");
    const reload = (from: BattleSlice) => JSON.parse(JSON.stringify(from)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const bounced = (from: BattleSlice, side: Side, value: Answer) =>
      fresh.reduce(from, { kind: "answer", side, promptId: fresh.pending(from)!.prompt.id, value });
    const saved = reload(slice);
    const hash = stateHash(saved.committed);
    expect(fresh.pending(saved)).toEqual(fold.pending(slice));
    const confirmId = fresh.pending(saved)!.prompt.id;
    // The preventer cannot answer for the card's controller.
    expect(bounced(saved, "enemy", false)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[], 1, [ids.player.back[0]!]] as const) expect(bounced(saved, "player", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "player", promptId: confirmId, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: confirmId })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(hash);

    const accepted = reload(applied(fresh.reduce(saved, { kind: "answer", side: "player", promptId: confirmId, value: true })));
    expect(createFoldAdapter(engine).pending(accepted)).toEqual(fresh.pending(accepted));
    expect(fresh.pending(accepted)!.prompt.id).not.toBe(confirmId);
    expect(bounced(accepted, "enemy", [ids.player.back[0]!])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const own = ids.player.back.filter((id): id is InstanceId => id !== null);
    // A figment, the preventer's character, two characters, none, or a hidden card are never accepted.
    for (const value of [[figment], [ids.enemy.back[0]!], own, [], [ids.player.deck[0]], true]) {
      expect(bounced(accepted, "player", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(accepted, { kind: "answer", side: "player", promptId: confirmId, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const intent = { kind: "answer" as const, side: "player" as const, promptId: fresh.pending(accepted)!.prompt.id, value: [own[0]] };
    const done = applied(fresh.reduce(accepted, intent));
    const live = answer(fold, answer(fold, slice, true).slice, [own[0]]).slice;
    expect(done.committed).toEqual(live.committed);
    expect(fresh.pending(done)).toBeNull();
    expect(done.committed.instances[own[0]].zone).toBe("void");
    expect(fresh.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("rolls back an error after the abandonment without committing or publishing any of it", () => {
    const { fold, slice, ids } = opened("player", failing);
    const accepted = answer(fold, slice, true).slice;
    const prompt = fold.pending(accepted)!.prompt;
    const outcome = fold.reduce(accepted, { kind: "answer", side: "player", promptId: prompt.id, value: [ids.player.back[1]!] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected the synthetic failure");
    expect(outcome.error.message).toContain("synthetic failure after the ransom");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed).toEqual(slice.committed);
    expect(outcome.slice.committed.sides.player.score).toBe(0);
    expect(outcome.slice.committed.instances[ids.player.back[1]!].zone).toBe("play");
    expect(fold.pending(outcome.slice)).toBeNull();
  });

  // At the optional-chain cap the unless cost is still paid: declining it is not doing less, it loses the card.
  it.each([0, AI.enginePolicy.optionalChainCap])("has Greedy pay the unless cost with its least valuable character after %i automatic choices", (automaticChoices) => {
    const { fold, slice, ids } = opened("enemy");
    const greedy = (from: BattleSlice) => {
      const { prompt } = fold.pending(from)!;
      const value = greedyAnswer(prompt, stateCardInfo(from.committed, engine.catalog, prompt.side), () => new Set(), automaticChoices);
      expect(isLegalAnswer(prompt, value)).toBe(true);
      return value;
    };
    expect(greedy(slice)).toBe(true);
    const accepted = answer(fold, slice, true).slice;
    const [valuable, least] = [ids.enemy.back[0]!, ids.enemy.back[1]!];
    expect(greedy(accepted)).toEqual([least]);
    const done = answer(fold, accepted, [least]).slice;
    expect(done.committed.instances[least].zone).toBe("void");
    expect(done.committed.instances[valuable].zone).toBe("play");
    expect(done.committed.sides.enemy.hand).toHaveLength(2);
    expect(fold.pending(done)).toBeNull();
  });
});
