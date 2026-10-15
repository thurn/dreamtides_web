/** Zero-base entry, fixed physical cohort, public continuations and retained spark. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { instanceCard } from "../../../catalog";
import { characteristicsOf } from "../../../continuous/characteristics";
import { all, characterYouControl, energy, event, everyIn, fromVoid, keyword, randomIn, self, staticAbility } from "../../../dsl/builders";
import { onMaterialized, triggered, whenGainsSpark, whenMaterialize } from "../../../dsl/triggers";
import { NO_DECK_MODS, type Ability } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { InlineSource, NO_PROMPTS } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import * as p from "../index";

const card = (n: number, abilities: readonly Ability[] = []): EngineCardDefinition => ({
  ...v.vanilla2, id: syntheticId(0x625100 + n), costs: [energy(0)], status: "authored", abilities: () => abilities,
});
const spell = (n: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({ ...card(n, [event(effect)]), cardType: "event", spark: null });
const unit = card(0);
const hiddenTarget = card(1, [keyword("cannotBeTargeted")]);
const chosen = spell(2, p.materialize(fromVoid({ cardType: "character" }), { zeroSpark: true }));
const random = spell(3, p.materialize(randomIn("void", 1, { cardType: "character" }), { zeroSpark: true }));
const batch = spell(4, p.materialize(everyIn("void", { cardType: "character" }), { zeroSpark: true, awakened: true }));
const normal = spell(5, p.materialize(everyIn("void", { cardType: "character" })));
const returnAll = spell(6, p.returnToHand(all(characterYouControl())));
const handZero = spell(7, p.materialize(everyIn("hand", { cardType: "character" }), { zeroSpark: true }));
const handNormal = spell(8, p.materialize(everyIn("hand", { cardType: "character" })));
const setSeven = spell(9, p.setBaseSpark(all(characterYouControl()), 7));
const watcher = card(10, [triggered(whenMaterialize(characterYouControl({ sparkAtMost: 0 })), p.gainPoints(11)), triggered(whenGainsSpark(), p.gainPoints(100))]);
const anthem = card(11, [staticAbility(p.sparkModifier(all(characterYouControl()), 2))]);
const arrival = card(12, [triggered(onMaterialized(), p.gainPoints(3))]);
const thief = spell(13, p.gainControl(all({ controller: "opponent" })));
const create = spell(14, p.createCard(unit.id));
const foreign = spell(18, p.materialize(everyIn("void", { cardType: "character" }, { player: "opponent" }), { zeroSpark: true }));
const wrapped = spell(19, p.forDuration("untilEndOfTurn", p.materialize(everyIn("void", { cardType: "character" }), { zeroSpark: true })));
const pause = card(15, [triggered(whenMaterialize(), p.optional(p.gainPoints(1)))]);
const discover = spell(16, p.materialize(p.discover({ cardType: "character" }), { zeroSpark: true }));
const failing: EngineCardDefinition = { ...spell(17, p.sequence(p.materialize(fromVoid({ cardType: "character" }), { zeroSpark: true }), p.gainAdditionalSpark(self(), 1))) };
const engine = createEngine(testCatalog([unit, hiddenTarget, chosen, random, batch, normal, returnAll, handZero, handNormal, setSeven, watcher, anthem, arrival, thief, create, foreign, wrapped, pause, discover, failing]));
const answers = () => new InlineSource({ player: prompt => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return false;
  throw new Error(`Unexpected ${prompt.kind}`);
}, enemy: prompt => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return false;
  throw new Error(`Unexpected ${prompt.kind}`);
} });
function world(side: Side, hand: SideSetup["hand"], mine: SideSetup = {}, theirs: SideSetup = {}) {
  const deck = Array.from({ length: 10 }, () => v.vanilla1.id);
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 10000,
    [side]: { deck, hand, void: [unit.id, unit.id], energy: 20, ...mine },
    [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 20, ...theirs } });
}
function play(state: BattleState, side: Side, id: InstanceId) {
  const out = engine.apply(state, side, { kind: "play", card: id, from: "hand" }, answers());
  const rest = passUntil(engine, out.state, s => s.stack.length === 0 && s.triggerQueue.length === 0, answers());
  return { state: rest.state, events: [...out.events, ...rest.events] };
}
const spark = (state: BattleState, id: InstanceId) => characteristicsOf(state, engine.catalog, id);
const entered = (events: readonly EngineEvent[]) => events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
const slice = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
const saved = (s: BattleSlice): BattleSlice => JSON.parse(JSON.stringify(s)) as BattleSlice;
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error("Expected applied outcome");
  return out.slice;
}

for (const side of SIDES) describe(`materialize zero spark ${side}`, () => {
  it("changes only the randomly selected physical own-void entry, without targeting or playing it", () => {
    const b = world(side, [random.id], { back: [unit.id], void: [hiddenTarget.id, hiddenTarget.id, v.event0.id] }, { void: [unit.id] });
    const before = stateHash(b.state), out = play(b.state, side, b.ids[side].hand[0]);
    const [id] = entered(out.events);
    expect(b.ids[side].void.slice(0, 2)).toContain(id);
    expect(entered(out.events)).toHaveLength(1);
    expect(spark(out.state, id)).toMatchObject({ baseSpark: 0, spark: 0 });
    for (const other of [...b.ids[side].void.slice(0, 2), b.ids[side].back[0]!, b.ids[opponent(side)].void[0]].filter(x => x !== id)) expect(spark(out.state, other).baseSpark).toBe(2);
    expect(out.events.filter(e => e.kind === "cardPlayed").map(e => e.instance)).toEqual([b.ids[side].hand[0]]);
    expect(out.state.instances[id]).toMatchObject({ owner: side, controller: side, zone: "play", status: { exhausted: true } });
    expect(out.state.rng).not.toEqual(b.state.rng);
    expect(stateHash(b.state)).toBe(before);
    expect(unannouncedChanges(out.events, b.state, out.state)).toEqual([]);
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
  });
  it("keeps empty eligibility inert, including RNG, and preserves the default negative control", () => {
    const b = world(side, [random.id, normal.id], { void: [v.event0.id] });
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(out.state.rng).toEqual(b.state.rng);
    expect(entered(out.events)).toEqual([]);
    expect(out.events.filter(e => e.kind === "effectStarted")).toEqual([]);
    const plain = world(side, [normal.id]);
    const ordinary = play(plain.state, side, plain.ids[side].hand[0]);
    for (const id of entered(ordinary.events)) expect(spark(ordinary.state, id).baseSpark).toBe(2);
  });
  it("sets base before arrival matching and never announces a gain", () => {
    const b = world(side, [batch.id], { back: [watcher.id], void: [arrival.id] });
    const out = play(b.state, side, b.ids[side].hand[0]), id = b.ids[side].void[0];
    expect(out.state.sides[side].score).toBe(14);
    expect(out.state.instances[id].status.exhausted).toBe(false);
    expect(out.events.filter(e => e.kind === "sparkGained")).toEqual([]);
    const setting = out.events.findIndex(e => e.kind === "effectStarted" && e.change.kind === "baseSpark");
    expect(setting).toBeGreaterThanOrEqual(0);
    expect(setting).toBeLessThan(out.events.findIndex(e => e.kind === "materialized"));
  });
  it("keeps variant printing, gained spark and static additions above the zero base", () => {
    const b = world(side, [handZero.id, { cardId: unit.id, amplified: true, deckMods: { ...NO_DECK_MODS, sparkBonus: 5 } }], { back: [anthem.id], void: [] });
    const id = b.ids[side].hand[1];
    b.state.instances[id].status.gainedSpark = 3;
    const printed = instanceCard(engine.catalog, b.state.instances[id]), out = play(b.state, side, b.ids[side].hand[0]);
    expect(spark(out.state, id)).toMatchObject({ baseSpark: 0, spark: 5 });
    expect(instanceCard(engine.catalog, out.state.instances[id])).toEqual(printed);
    expect(out.state.instances[id].variant).toEqual(b.state.instances[id].variant);
    expect(out.state.instances[id].status.gainedSpark).toBe(3);
    expect(engine.catalog.card(unit.id).spark).toBe(2);
  });
  it("changes only the successful capacity cohort and leaves reclaimed and overflow cards alone", () => {
    const b = world(side, [batch.id], { back: Array.from({ length: 9 }, () => unit.id), void: [unit.id, unit.id, unit.id] });
    const [blocked, fits, overflow] = b.ids[side].void;
    b.state.instances[blocked].status.reclaimed = true;
    b.state.instances[overflow].status.gainedSpark = 4;
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(entered(out.events)).toEqual([fits]);
    expect(spark(out.state, fits).baseSpark).toBe(0);
    expect(spark(out.state, blocked)).toMatchObject({ baseSpark: 2, spark: 2 });
    expect(spark(out.state, overflow)).toMatchObject({ baseSpark: 2, spark: 6 });
    expect(out.state.instances[blocked].zone).toBe("void");
    expect(out.state.instances[overflow].zone).toBe("void");
    expect(out.events).toContainEqual({ kind: "capacityReached", side, instance: overflow, missing: 1 });
  });
  it("retains physical zero through source departure, hand, normal reentry and control changes, with latest setting winning", () => {
    const b = world(side, [batch.id, returnAll.id, handNormal.id, setSeven.id, returnAll.id, handZero.id], { void: [unit.id] }, { hand: [thief.id] });
    const id = b.ids[side].void[0];
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    expect(state.instances[b.ids[side].hand[0]].zone).toBe("void");
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(state.instances[id].zone).toBe("hand");
    expect(spark(state, id).baseSpark).toBe(0);
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(spark(state, id).baseSpark).toBe(0);
    state = play(state, side, b.ids[side].hand[3]).state;
    expect(spark(state, id).baseSpark).toBe(7);
    state = play(state, side, b.ids[side].hand[4]).state;
    state = play(state, side, b.ids[side].hand[5]).state;
    expect(spark(state, id).baseSpark).toBe(0);
    state = passUntil(engine, state, s => s.turn.active === opponent(side) && s.turn.phase === "day").state;
    state = play(state, opponent(side), b.ids[opponent(side)].hand[0]).state;
    expect(state.instances[id].controller).toBe(opponent(side));
    expect(spark(state, id).baseSpark).toBe(0);
  });
  it("keeps an opponent-owned selected card under the actual effect controller", () => {
    const b = world(side, [foreign.id], { void: [unit.id] }, { void: [unit.id] });
    const out = play(b.state, side, b.ids[side].hand[0]), id = b.ids[opponent(side)].void[0];
    expect(entered(out.events)).toEqual([id]);
    expect(out.state.instances[id]).toMatchObject({ owner: opponent(side), controller: side, zone: "play" });
    expect(spark(out.state, id).baseSpark).toBe(0);
    expect(spark(out.state, b.ids[side].void[0]).baseSpark).toBe(2);
  });
  it("keeps the intrinsic entry setting through an enclosing duration and turn boundary", () => {
    const b = world(side, [wrapped.id], { void: [unit.id] });
    const out = play(b.state, side, b.ids[side].hand[0]);
    const later = passUntil(engine, out.state, state => state.turn.turnNumber > out.state.turn.turnNumber).state;
    expect(spark(later, b.ids[side].void[0]).baseSpark).toBe(0);
  });
  it("ends a created character's zero change when that character ceases", () => {
    const b = world(side, [create.id, handZero.id, returnAll.id], { void: [] });
    const made = play(b.state, side, b.ids[side].hand[0]);
    const id = made.state.sides[side].hand.find(id => made.state.instances[id].status.created)!;
    const arrived = play(made.state, side, b.ids[side].hand[1]);
    expect(spark(arrived.state, id).baseSpark).toBe(0);
    const out = play(arrived.state, side, b.ids[side].hand[2]);
    expect(out.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: id }));
    expect(engine.view(out.state, side).instances[id]).toBeUndefined();
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
  });
  it("preserves public zero through clone, saved-state acceptance and both viewer determinizations", () => {
    const b = world(side, [batch.id], { void: [unit.id] });
    const out = play(b.state, side, b.ids[side].hand[0]), id = b.ids[side].void[0];
    const lists = Object.fromEntries(SIDES.map(s => [s, Object.values(b.state.instances).filter(i => i.owner === s).map(i => {
      if (i.printing.kind !== "card") throw new Error("Expected catalog card");
      return { cardId: i.printing.cardId };
    })])) as Record<Side, { cardId: typeof unit.id }[]>;
    for (const state of [cloneState(out.state), deserializeState(serializeState(out.state)), ...SIDES.map(viewer => engine.determinize(engine.view(out.state, viewer), lists, () => 0.37))]) {
      expect(spark(state, id)).toMatchObject({ baseSpark: 0, spark: 0 });
      expect(invariantViolations(state, engine.catalog)).toEqual([]);
    }
    const valid = { init: { seed: out.state.seed, scoreToWin: 10000, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: saved(slice(out.state)) };
    expect(parseEngineBattleFold(valid)).not.toBeNull();
    expect(stateHash(deserializeState(serializeState(out.state)))).toBe(stateHash(out.state));
  });
  it("reloads and cancels a genuine target prompt, refusing foreign, stale, invalid and concurrent answers", () => {
    const b = world(side, [chosen.id]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction" as const, side, action: { kind: "play" as const, card: b.ids[side].hand[0], from: "hand" as const } };
    const open = applied(fold.reduce(slice(b.state), intent)), prompt = fold.pending(open)!.prompt;
    expect(createFoldAdapter(engine).pending(saved(open))?.prompt).toEqual(prompt);
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: [b.ids[side].void[1]] };
    expect(fold.reduce(open, { ...answer, side: opponent(side) })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(open, { ...answer, value: [b.ids[side].hand[0]] })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(open, intent)).toMatchObject({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(fold.reduce(open, { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(b.state));
    const reopened = applied(fold.reduce(cancelled, intent)), latest = fold.pending(reopened)!.prompt;
    expect(fold.reduce(reopened, answer)).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    const done = applied(createFoldAdapter(engine).reduce(saved(reopened), { ...answer, promptId: latest.id }));
    const finished = passUntil(engine, done.committed, s => s.stack.length === 0 && s.triggerQueue.length === 0, answers()).state;
    expect(spark(finished, b.ids[side].void[1]).baseSpark).toBe(0);
    expect(spark(finished, b.ids[side].void[0]).baseSpark).toBe(2);
    expect(fold.reduce(done, { ...answer, promptId: latest.id })).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
  });
  it("continues a committed zero entry observer across reload without a second setting", () => {
    const b = world(side, [batch.id], { back: [pause.id], void: [unit.id] }, { hand: [] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const open = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(open)!.prompt, before = spark(open.committed, b.ids[side].void[0]);
    expect(before.baseSpark).toBe(0);
    const out = createFoldAdapter(engine).reduce(saved(open), { kind: "answer", side, promptId: prompt.id, value: false });
    const done = applied(out);
    expect(spark(done.committed, b.ids[side].void[0]).baseSpark).toBe(0);
    if (out.kind !== "applied") throw new Error("Expected applied");
    expect(out.published.filter(e => e.kind === "effectStarted" && e.change.kind === "baseSpark")).toEqual([]);
  });
  it("discovers only the newly chosen card and keeps the preexisting hand character's base", () => {
    const b = world(side, [discover.id, unit.id], { void: [], deck: [unit.id, unit.id, v.event0.id] });
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(entered(out.events)).toHaveLength(1);
    expect(spark(out.state, entered(out.events)[0]).baseSpark).toBe(0);
    expect(spark(out.state, b.ids[side].hand[1]).baseSpark).toBe(2);
  });
  it("rolls back a same-step error after materialization without publishing a partial zero setting", () => {
    const b = world(side, [failing.id]);
    const fold = createFoldAdapter(engine), open = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(open)!.prompt;
    const selected = applied(fold.reduce(open, { kind: "answer", side, promptId: prompt.id, value: [b.ids[side].void[0]] }));
    const before = stateHash(selected.committed);
    expect(() => runStep(selected.committed, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog)).toThrow();
    expect(stateHash(selected.committed)).toBe(before);
    expect(spark(selected.committed, b.ids[side].void[0]).baseSpark).toBe(2);
  });
});
