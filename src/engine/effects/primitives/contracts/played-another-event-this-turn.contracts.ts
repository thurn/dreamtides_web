/** Public committed-play and resolution contracts for another physical event. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { parseAvatarId, parsePromptId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, additionalCost, all, characterYouControl, discardCost, energy, event, playedAnotherEventThisTurn, reclaim, stackItem, staticAbility, target } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { triggered, triggeringCard, whenOpponentPlays, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { LAB } from "../../../testing/prompt-lab";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { conditionHolds, resolveEffect } from "../../interpreter";
import * as p from "../index";

const reading = () => p.ifThen(playedAnotherEventThisTurn(), p.gainPoints(7), p.gainPoints(2));
const card = (index: number, fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x69720 + index), status: "authored", abilities: () => [event(p.sequence())], ...fields,
});
const reader = card(0, { costs: [energy(1)], abilities: () => [event(reading()), reclaim(energy(1))] });
const prior = card(1, { abilities: () => [event(p.gainPoints(0)), reclaim(energy(1))] });
const responseReader = card(15, { speed: "interrupt", abilities: () => [event(reading())] });
const interrupt = card(2, { speed: "interrupt" });
const permit = card(3, { ...v.vanilla1, id: syntheticId(0x69723), status: "authored",
  abilities: () => [staticAbility(p.playFromZone("void", { cardType: "event" }))] });
const preventer = card(4, { speed: "interrupt", abilities: () => [event(p.prevent(stackItem({ cardType: "event" })))] });
const mirror = (index: number, theirs: boolean) => card(index, { ...v.vanilla1, id: syntheticId(0x69720 + index), status: "authored",
  abilities: () => [triggered(theirs ? whenOpponentPlays({ cardType: "event" }) : whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard()), { oncePerTurn: true })] });
const mineMirror = mirror(5, false), theirMirror = mirror(6, true);
const cancelled = card(7, { abilities: () => [event(p.chooseOne(p.gainPoints(0), p.gainPoints(1)))] });
const failedPlay = card(8, { synthetic: { play() { throw new Error("synthetic play preparation failure"); } } });
const changed = card(9, { synthetic: { resolve(ctx, item) {
  // A synthetic-only type transition: current printing changes, captured play history does not.
  ctx.state.instances[item.instance] = { ...ctx.state.instances[item.instance], printing: { kind: "card", cardId: v.vanilla1.id } };
} } });
const extra = card(10, { abilities: () => [event(p.takeExtraTurn())] });
const bearer = card(11, { ...v.vanilla1, id: syntheticId(0x6972b), status: "authored",
  abilities: () => [activated([abandonSelfCost()], reading())] });
const steal = card(12, { abilities: () => [event(p.gainControl(target({ controller: "opponent" })))] });
const paid = card(13, { costs: [energy(2)], abilities: () => [additionalCost(discardCost()), event(p.sequence(p.draw(2), p.ifThen(playedAnotherEventThisTurn(), p.sequence(), p.discard(1))))] });
const failingResolution = card(14, { synthetic: { resolve(ctx, item) {
  const instance = ctx.state.instances[item.instance];
  resolveEffect(ctx, p.sequence(p.draw(2), reading()), { source: item.instance, controller: item.controller,
    origin: instanceOrigin(instance), ability: 0, x: item.x, optionalPaid: item.optionalPaid, choices: item.choices[0] });
  throw new Error("synthetic resolution failure after conditional draws");
} } });
const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-00000006973f"), status: "authored" as const,
  abilities: () => [activated([], reading()), activated([], p.createCard(prior.id))] };
const engine = createEngine(testCatalog([reader, prior, interrupt, permit, preventer, mineMirror, theirMirror, cancelled,
  failedPlay, changed, extra, bearer, steal, paid, failingResolution, responseReader, LAB.playedAnotherEventDraw], { avatars: [avatar] }));
const deck = Array.from({ length: 18 }, () => v.vanilla1.id);
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const play = (card: InstanceId, from: "hand" | "void" = "hand") => ({ kind: "play" as const, card, from });
const applied = (result: IntentOutcome) => {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(result)}`);
  return result;
};
function board(side: Side, hand: readonly CardId[], otherHand: readonly CardId[] = [], back: readonly CardId[] = [], otherBack: readonly CardId[] = [], voids: readonly CardId[] = []) {
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { hand, back, void: voids, energy: 20, deck, avatar: avatar.id },
    [opponent(side)]: { hand: otherHand, back: otherBack, energy: 20, deck } });
}
function cast(state: BattleState, side: Side, id: InstanceId, from: "hand" | "void" = "hand", answers: AnswerSource = NO_PROMPTS) {
  const first = engine.apply(state, side, play(id, from), answers);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  expect(invariantViolations(rest.state, engine.catalog)).toEqual([]);
  return { state: rest.state, events: [...first.events, ...rest.events], answers: first.answers };
}
function save(state: BattleSlice) {
  return { init: { seed: state.committed.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: state };
}

// This form has a resolving physical-source binding; continuous effects cannot use it.
// @ts-expect-error playedAnotherEventThisTurn is excluded from StaticCondition.
staticAbility(p.sparkModifier(all(characterYouControl()), 1), { while: playedAnotherEventThisTurn() });

describe("played another event this turn", () => {
  it.each(SIDES)("%s excludes the current source, characters and the opponent's event", side => {
    const empty = board(side, [reader.id]);
    expect(cast(empty.state, side, empty.ids[side].hand[0]).state.sides[side].score).toBe(2);
    const character = board(side, [v.vanilla0.id, reader.id]);
    const entered = cast(character.state, side, character.ids[side].hand[0]);
    expect(cast(entered.state, side, character.ids[side].hand[1]).state.sides[side].score).toBe(2);
    const enemy = board(side, [reader.id], [interrupt.id]);
    const declared = engine.apply(enemy.state, side, play(enemy.ids[side].hand[0]), NO_PROMPTS);
    const answered = cast(declared.state, opponent(side), enemy.ids[opponent(side)].hand[0]);
    expect(answered.state.sides[side].score).toBe(2);
    expect(answered.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
  });

  it.each(SIDES)("%s accepts ordinary, same-UUID distinct, Interrupt, Reclaim and permission plays", side => {
    const twice = board(side, [reader.id, reader.id]);
    const first = cast(twice.state, side, twice.ids[side].hand[0]);
    expect(cast(first.state, side, twice.ids[side].hand[1]).state.sides[side].score).toBe(9);
    const ordinary = board(side, [prior.id, reader.id]);
    const earlier = cast(ordinary.state, side, ordinary.ids[side].hand[0]);
    expect(cast(earlier.state, side, ordinary.ids[side].hand[1]).state.sides[side].score).toBe(7);
    for (const byPermission of [false, true]) {
      const b = board(side, [reader.id], [], byPermission ? [permit.id] : [], [], [byPermission ? interrupt.id : prior.id]);
      const previous = cast(b.state, side, b.ids[side].void[0], "void");
      expect(cast(previous.state, side, b.ids[side].hand[0]).state.sides[side].score).toBe(7);
      expect(previous.events.some(e => e.kind === "cardPlayed" && e.side === side)).toBe(true);
    }
    const response = board(opponent(side), [prior.id, prior.id], [interrupt.id, responseReader.id]);
    const opening = engine.apply(response.state, opponent(side), play(response.ids[opponent(side)].hand[0]), NO_PROMPTS);
    const replied = cast(opening.state, side, response.ids[side].hand[0]);
    const another = engine.apply(replied.state, opponent(side), play(response.ids[opponent(side)].hand[1]), NO_PROMPTS);
    expect(cast(another.state, side, response.ids[side].hand[1]).state.sides[side].score).toBe(7);
  });

  it.each(SIDES)("%s excludes every prior play of the same physical source, including Reclaim", side => {
    const b = board(side, [reader.id]);
    const once = cast(b.state, side, b.ids[side].hand[0]);
    const twice = cast(once.state, side, b.ids[side].hand[0], "void");
    expect(twice.state.sides[side].score).toBe(4);
    expect(twice.events.filter(e => e.kind === "cardPlayed")).toEqual([{ kind: "cardPlayed", side, instance: b.ids[side].hand[0] }]);
    expect(twice.state.sides[side].banished).toContain(b.ids[side].hand[0]);
  });

  it.each(SIDES)("%s uses captured effective event type after a synthetic type change, departure and cessation", side => {
    const b = board(side, [changed.id, reader.id]);
    const earlier = cast(b.state, side, b.ids[side].hand[0]);
    expect(earlier.state.instances[b.ids[side].hand[0]].printing).toEqual({ kind: "card", cardId: v.vanilla1.id });
    expect(cast(earlier.state, side, b.ids[side].hand[1]).state.sides[side].score).toBe(7);
    const converted = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
      [side]: { hand: [{ cardId: v.vanilla0.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } }, reader.id], deck, energy: 20 },
      [opponent(side)]: { deck } });
    const effective = cast(converted.state, side, converted.ids[side].hand[0]);
    expect(cast(effective.state, side, converted.ids[side].hand[1]).state.sides[side].score).toBe(7);
    const created = board(side, [reader.id]);
    const made = engine.apply(created.state, side, { kind: "activate", source: { kind: "avatar", side }, ability: 1 }, NO_PROMPTS);
    const id = made.state.sides[side].hand.find(id => id !== created.ids[side].hand[0])!;
    const ceased = cast(made.state, side, id);
    expect(ceased.state.instances[id]).toBeUndefined();
    expect(cast(ceased.state, side, created.ids[side].hand[0]).state.sides[side].score).toBe(7);
  });

  it.each(SIDES)("%s uses the copy's own physical source and controller without recording copies as plays", side => {
    for (const theirs of [false, true]) {
      const b = board(side, [reader.id], [], theirs ? [] : [mineMirror.id], theirs ? [theirMirror.id] : []);
      const out = cast(b.state, side, b.ids[side].hand[0]);
      expect(out.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
      expect(out.events.filter(e => e.kind === "cardCopied")).toHaveLength(1);
      expect(out.state.sides[side].score).toBe(theirs ? 2 : 9);
      expect(out.state.sides[opponent(side)].score).toBe(theirs ? 2 : 0);
    }
  });

  it.each(SIDES)("%s counts a committed Prevented play but excludes declarations, cancellation and failed preparation", side => {
    const b = board(side, [prior.id, reader.id], [preventer.id]);
    const announced = engine.apply(b.state, side, play(b.ids[side].hand[0]), NO_PROMPTS);
    const prevented = cast(announced.state, opponent(side), b.ids[opponent(side)].hand[0]);
    expect(prevented.events.some(e => e.kind === "prevented" && e.instance === b.ids[side].hand[0])).toBe(true);
    expect(cast(prevented.state, side, b.ids[side].hand[1]).state.sides[side].score).toBe(7);
    const c = board(side, [cancelled.id, reader.id]);
    const fold = createFoldAdapter(engine);
    const pending = applied(fold.reduce(slice(c.state), { kind: "battleAction", side, action: play(c.ids[side].hand[0]) })).slice;
    const prompt = fold.pending(pending)!.prompt;
    const abandoned = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.id })).slice;
    expect(cast(abandoned.committed, side, c.ids[side].hand[1]).state.sides[side].score).toBe(2);
    const f = board(side, [failedPlay.id]);
    const hash = stateHash(f.state);
    expect(() => engine.apply(f.state, side, play(f.ids[side].hand[0]), NO_PROMPTS)).toThrow("synthetic play preparation failure");
    expect(stateHash(f.state)).toBe(hash);
    expect(conditionHolds(f.state, engine.catalog, playedAnotherEventThisTurn(), { controller: side, source: { kind: "avatar", side }, optionalPaid: [] })).toBe(false);
    const activation = runStep(f.state, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS, engine.catalog);
    if (activation.kind !== "done") throw new Error("Expected public reader activation");
    const observed = runStep(activation.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (observed.kind !== "done") throw new Error("Expected public reader resolution");
    expect(observed.state.sides[side].score).toBe(2);
    expect(observed.events).toContainEqual(expect.objectContaining({ kind: "pointsScored", side, amount: 2 }));
    expect(stateHash(f.state)).toBe(hash);
    expect(stateHash(c.state)).toBe(stateHash(abandoned.committed));
  });

  it.each(SIDES)("%s reads a noncard source and retains the effect controller when its physical source departs", side => {
    const b = board(side, [prior.id, steal.id], [], [], [bearer.id]);
    const empty = engine.apply(b.state, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS);
    expect(empty.state.sides[side].score).toBe(2);
    const earlier = cast(empty.state, side, b.ids[side].hand[0]);
    const read = engine.apply(earlier.state, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS);
    expect(read.state.sides[side].score).toBe(9);
    const taken = cast(read.state, side, b.ids[side].hand[1], "hand", new ScriptedSource([[b.ids[opponent(side)].back[0]!]]));
    const id = b.ids[opponent(side)].back[0]!;
    const gone = engine.apply(taken.state, side, { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
    expect(gone.state.sides[side].score).toBe(16);
    expect(gone.state.sides[opponent(side)].score).toBe(0);
    expect(gone.state.sides[opponent(side)].void).toContain(id);
  });

  it.each(SIDES)("%s resets the historical predicate at each ordinary or extra turn", side => {
    for (const takeExtra of [false, true]) {
      const b = board(side, [prior.id, ...(takeExtra ? [extra.id] : [])]);
      let state = cast(b.state, side, b.ids[side].hand[0]).state;
      if (takeExtra) state = cast(state, side, b.ids[side].hand[1]).state;
      state = engine.apply(state, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS).state;
      expect(state.sides[side].score).toBe(7);
      const turn = state.turn.turnNumber + (takeExtra ? 1 : 2);
      const day = passUntil(engine, state, next => next.turn.turnNumber >= turn && next.turn.phase === "day").state;
      expect(day.turn.turnNumber).toBe(turn);
      expect(day.turn.active).toBe(side);
      expect(day.turn.phase).toBe("day");
      expect(day.turn.extra).toBe(takeExtra);
      expect(engine.decision(day)).toEqual({ kind: "main", side });
      expect(engine.apply(day, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS).state.sides[side].score).toBe(9);
    }
  });

  it.each(SIDES)("%s draws two before the conditional discard, with exact cohort, source and payment", side => {
    for (const met of [false, true]) {
      const b = board(side, [LAB.playedAnotherEventDraw.id, prior.id, v.vanilla0.id]);
      const start = met ? cast(b.state, side, b.ids[side].hand[1]).state : b.state;
      const prompts: Prompt[] = [];
      const out = cast(start, side, b.ids[side].hand[0], "hand", { answer(prompt) {
        prompts.push(prompt);
        if (prompt.kind !== "chooseCards") throw new Error("Expected discard");
        return [b.ids[side].deck[1]];
      } });
      expect(prompts).toHaveLength(met ? 0 : 1);
      if (!met) {
        expect(prompts[0]).toMatchObject({ kind: "chooseCards", side, min: 1, max: 1,
          purpose: { source: b.ids[side].hand[0], cardId: LAB.playedAnotherEventDraw.id, role: "discard" },
          candidates: [...start.sides[side].hand.slice(1), ...b.ids[side].deck.slice(0, 2)] });
      }
      expect(out.state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy - 2);
      expect(out.state.sides[side].hand).toEqual([...start.sides[side].hand.slice(1), ...b.ids[side].deck.slice(0, met ? 2 : 1)]);
      expect(out.state.sides[side].deck).toEqual(b.ids[side].deck.slice(2));
      const travels = out.events.flatMap(e => e.kind === "cardDrawn" || e.kind === "discarded" ? [{ kind: e.kind, id: e.instance }] : []);
      expect(travels).toEqual([{ kind: "cardDrawn", id: b.ids[side].deck[0] }, { kind: "cardDrawn", id: b.ids[side].deck[1] },
        ...(met ? [] : [{ kind: "discarded", id: b.ids[side].deck[1] }])]);
    }
    const b = board(side, [paid.id, v.vanilla0.id, v.vanilla2.id]);
    const out = cast(b.state, side, b.ids[side].hand[0], "hand", new ScriptedSource([[b.ids[side].hand[1]], [b.ids[side].deck[0]]]));
    expect(out.state.sides[side].currentEnergy).toBe(18);
    expect(out.events.filter(e => e.kind === "discarded")).toHaveLength(2);
    expect(out.state.sides[side].hand).toEqual([b.ids[side].hand[2], b.ids[side].deck[1]]);
  });

  it.each(SIDES)("%s replays a suspended draw/discard after cold LOAD and rejects foreign, invalid, cancelled and stale answers", side => {
    const b = board(side, [LAB.playedAnotherEventDraw.id, v.vanilla0.id], [interrupt.id]);
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: row => records.push(row) });
    const declaration = { kind: "battleAction" as const, side, action: play(b.ids[side].hand[0]) };
    const declared = applied(fold.reduce(slice(b.state), declaration));
    const response = { kind: "battleAction" as const, side: opponent(side), action: play(b.ids[opponent(side)].hand[0]) };
    const responded = applied(fold.reduce(declared.slice, response));
    const resolution = { kind: "battleAction" as const, side: opponent(side), action: { kind: "pass" as const } };
    const needsPass = fold.pending(responded.slice) === null;
    const pending = needsPass ? applied(fold.reduce(responded.slice, resolution)) : responded;
    const prompt = fold.pending(pending.slice)!;
    expect(prompt.display.sides[side].hand).toEqual([b.ids[side].hand[1], ...b.ids[side].deck.slice(0, 2)]);
    expect(prompt.prompt.purpose.source).toBe(b.ids[side].hand[0]);
    const loaded = parseEngineBattleFold(JSON.parse(JSON.stringify(save(pending.slice))))!;
    expect(loaded).not.toBeNull();
    const fresh = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const frozen = stateHash(loaded.slice.committed);
    for (const intent of [
      { kind: "answer" as const, side: opponent(side), promptId: prompt.prompt.id, value: [b.ids[side].deck[0]] },
      { kind: "answer" as const, side, promptId: parsePromptId("0:0:999"), value: [b.ids[side].deck[0]] },
      { kind: "answer" as const, side, promptId: prompt.prompt.id, value: [] },
      { kind: "cancel" as const, side, promptId: prompt.prompt.id },
      { kind: "battleAction" as const, side, action: { kind: "pass" as const } },
    ]) expect(fresh.reduce(loaded.slice, intent).kind).toBe("bounced");
    expect(stateHash(loaded.slice.committed)).toBe(frozen);
    const answer = { kind: "answer" as const, side, promptId: prompt.prompt.id, value: [b.ids[side].deck[1]] };
    const done = applied(fresh.reduce(loaded.slice, answer));
    expect(fresh.reduce(done.slice, answer).kind).toBe("bounced");
    let replay = slice(deserializeState(serializeState(b.state)));
    for (const intent of [declaration, response, ...(needsPass ? [resolution] : []), answer]) replay = applied(fold.reduce(replay, intent)).slice;
    expect(stateHash(replay.committed)).toBe(stateHash(done.slice.committed));
    expect(done.slice.committed.sides[side].hand).toEqual([b.ids[side].hand[1], b.ids[side].deck[0]]);
    expect(records.filter(row => row.event === "engine.promptOpened").some(row => row.cardId === LAB.playedAnotherEventDraw.id)).toBe(true);
  });

  it.each(SIDES)("%s rolls back a failed resolution's draws and branch without losing the committed play", side => {
    const b = board(side, [failingResolution.id]);
    const fold = createFoldAdapter(engine);
    const out = fold.reduce(slice(b.state), { kind: "battleAction", side, action: play(b.ids[side].hand[0]) });
    if (out.kind !== "applied" || out.error === null) throw new Error("Expected rollback");
    expect(out.slice.committed.sides[side].deck).toEqual(b.ids[side].deck);
    expect(out.slice.committed.sides[side].hand).toEqual([]);
    expect(out.slice.committed.sides[side].score).toBe(0);
    expect(out.slice.committed.stack).toHaveLength(1);
    expect(out.published.filter(e => e.kind === "cardDrawn" || e.kind === "pointsScored")).toEqual([]);
    expect(stateHash(parseEngineBattleFold(JSON.parse(JSON.stringify(save(out.slice))))!.slice.committed)).toBe(stateHash(out.slice.committed));
  });
});
