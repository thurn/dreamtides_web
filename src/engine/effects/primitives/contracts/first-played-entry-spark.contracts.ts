/** Original first-play entry, gain observations, lifetime and replay through public engine APIs. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import { parseCardSubtype } from "../../../../types/card-identity";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristicsOf } from "../../../continuous/characteristics";
import { additionalCost, all, characterYouControl, controls, discardCost, energy, event, everyIn, reclaim, self, staticAbility, target } from "../../../dsl/builders";
import { triggered, triggeringCard, whenGainsSpark, whenMaterialize, whenYouPlay } from "../../../dsl/triggers";
import type { Ability, Variant } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords, type EngineLogRecord } from "../../../log";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { InlineSource, NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { invariantViolations } from "../../../testing/invariants";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import type { Decklists } from "../../../view/determinize";
import * as p from "../index";

const sign = (n: number) => parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0x624001 + n).toString(16).padStart(12, "0")}`);
const card = (n: number, abilities: (variant: Variant) => readonly Ability[] = () => []): EngineCardDefinition => ({
  ...v.vanilla2, id: syntheticId(0x624100 + n), costs: [energy(0)], status: "authored", abilities,
});
const spell = (n: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({ ...card(n, () => [event(effect)]), cardType: "event", spark: null });
const unit = card(0, () => [reclaim(energy(0))]);
const provider = { ...card(1, variant => [staticAbility(p.firstPlayedCharacterEntrySpark(variant.amplified ? 3 : 1))]), subtype: parseCardSubtype("Mage") };
const hidden = card(2, () => [staticAbility(p.firstPlayedCharacterEntrySpark(2), { zone: "hand" })]);
const raise = spell(3, p.materialize(everyIn("void", { cardType: "character" })));
const figments = spell(4, p.materializeFigments(ZONE_FIGMENT.warrior.id, 1));
const again = spell(5, p.rematerialize(all(characterYouControl())));
const leave = spell(6, p.returnToHand(all(characterYouControl())));
const extra = spell(7, p.takeExtraTurn());
const create = spell(8, p.createCard(unit.id));
const thief = spell(9, p.gainControl(all({ controller: "opponent", subtype: "Mage" })));
const prevent = { ...spell(10, p.prevent({ kind: "stackItem", controller: "opponent", cardType: "character" })), speed: "interrupt" as const };
const stealPlay = { ...spell(11, p.prevent({ kind: "stackItem", controller: "opponent", cardType: "character" }, { destination: "yourHand" })), speed: "interrupt" as const };
const paid = card(12, () => [additionalCost(discardCost())]);
const watcher = card(13, () => [triggered(whenGainsSpark(), p.gainPoints(1)),
  triggered(whenMaterialize(characterYouControl({ sparkAtLeast: 3 })), p.gainPoints(10))]);
const pause = card(14, () => [triggered(whenMaterialize(), p.optional(p.gainPoints(1)))]);
const fail = card(15, () => [triggered(whenMaterialize(), p.gainAdditionalSpark(self(), 1))]);
const copied = spell(16, p.materializeFigmentCopy(target(characterYouControl())));
const hide = spell(17, p.shuffleInto([everyIn("hand", { cardType: "character" })]));
const arriver = card(19, () => [triggered(whenYouPlay({ cardType: "character" }, 1), p.materialize(everyIn("void", { cardType: "character" })))]);
const deckProvider = card(20, () => [staticAbility(p.firstPlayedCharacterEntrySpark(2), { zone: "any" })]);
const stealAll = spell(21, p.gainControl(all({ controller: "opponent" })));
const handEntry = spell(22, p.materialize(everyIn("hand", { cardType: "character", subtype: "Mage" })));
const engine = createEngine(testCatalog([unit, provider, hidden, raise, figments, again, leave, extra, create, thief,
  prevent, stealPlay, paid, watcher, pause, fail, copied, hide, arriver, deckProvider, stealAll, handEntry], { dreamsigns: [
  { id: sign(0), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(1))] },
  { id: sign(1), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(0))] },
  { id: sign(2), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(1)),
    triggered(whenYouPlay({ cardType: "character" }, 1), p.copyCard(triggeringCard()))] },
  { id: sign(3), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(1)),
    triggered(whenYouPlay({ cardType: "character" }, 1), p.materialize(everyIn("void", { cardType: "character" })))] },
  { id: sign(4), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(2), { while: controls({ controller: "you", subtype: "Mage" }) })] },
  { id: sign(5), status: "authored", abilities: () => [staticAbility(p.setBaseSpark(all(characterYouControl()), 4)),
    staticAbility(p.sparkModifier(all(characterYouControl()), 2))] },
  { id: sign(6), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(1), { while: controls({ controller: "you", sparkAtMost: 2 }) })] },
  { id: sign(7), status: "authored", abilities: () => [staticAbility(p.firstPlayedCharacterEntrySpark(1)),
    staticAbility(p.revealDeckTop(), { while: controls({ controller: "you", sparkAtLeast: 3 }) })] },
] }, ZONE_FIGMENTS));
const answers = () => new InlineSource({ player: prompt => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected ${prompt.kind}`);
}, enemy: prompt => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected ${prompt.kind}`);
} });
function world(side: Side, hand: SideSetup["hand"], mine: SideSetup = {}, theirs: SideSetup = {}) {
  const deck = Array.from({ length: 20 }, () => v.vanilla1.id);
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 10000,
    [side]: { deck, hand, energy: 50, dreamsigns: [sign(0)], ...mine },
    [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 50, ...theirs } });
}
function finish(state: BattleState) {
  return passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0, answers());
}
function play(state: BattleState, side: Side, id: InstanceId, from: "hand" | "void" = "hand") {
  const started = engine.apply(state, side, { kind: "play", card: id, from }, answers()), rest = finish(started.state);
  return { state: rest.state, events: [...started.events, ...rest.events] };
}
function step(state: BattleState, action: Step) {
  const out = runStep(state, action, NO_PROMPTS, engine.catalog);
  if (out.kind !== "done") throw new Error("Unexpected suspended step");
  return out;
}
const gains = (events: readonly EngineEvent[]) => events.flatMap(e => e.kind === "sparkGained" && e.entrySpark !== undefined ? [e] : []);
const spark = (state: BattleState, id: InstanceId) => characteristicsOf(state, engine.catalog, id);
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out.slice;
}
const restored = (s: BattleSlice): BattleSlice => JSON.parse(JSON.stringify(s)) as BattleSlice;
const saved = (s: BattleSlice) => ({ init: { seed: s.committed.seed, scoreToWin: 10000, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: s });
function lists(state: BattleState): Decklists {
  const entries = (side: Side) => Object.values(state.instances).flatMap(i => i.owner === side && i.printing.kind === "card" && !i.status.created
    ? [{ cardId: i.printing.cardId, ...i.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}

describe.each(SIDES)("firstPlayedCharacterEntrySpark for %s", side => {
  const other = opponent(side);
  it("selects actual first character play after event and nonplayed entries, before materialization observers", () => {
    const b = world(side, [figments.id, unit.id, unit.id], { back: [watcher.id] });
    const earlier = play(b.state, side, b.ids[side].hand[0]);
    expect(gains(earlier.events)).toEqual([]);
    const first = play(earlier.state, side, b.ids[side].hand[1]);
    const second = play(first.state, side, b.ids[side].hand[2]);
    expect(spark(first.state, b.ids[side].hand[1])).toMatchObject({ baseSpark: 2, spark: 3 });
    expect(spark(second.state, b.ids[side].hand[2]).spark).toBe(2);
    expect(second.state.sides[side].score).toBe(11);
    expect(first.events.findIndex(e => e.kind === "sparkGained")).toBeLessThan(first.events.findIndex(e => e.kind === "materialized"));
    expect(invariantViolations(second.state, engine.catalog)).toEqual([]);
  });
  it("adds each occurrence's amount using actual source variant and retains ordinary base/additive layers", () => {
    const b = world(side, [unit.id], { dreamsigns: [sign(0), sign(0), sign(5)], back: [provider.id, provider.id] });
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(gains(out.events).map(e => e.amount)).toEqual([1, 1, 1, 1]);
    expect(spark(out.state, b.ids[side].hand[0])).toMatchObject({ baseSpark: 4, spark: 10 });
    const amplified = world(side, [{ cardId: provider.id, amplified: true }], { dreamsigns: [] });
    const own = play(amplified.state, side, amplified.ids[side].hand[0]);
    expect(gains(own.events).map(e => e.amount)).toEqual([3]);
    expect(spark(own.state, amplified.ids[side].hand[0]).spark).toBe(5);
  });
  it("uses captured effective character type after deck changes, never a printed event ordinal", () => {
    const mods = (cardType: "character" | "event") => ({ sparkBonus: 0, costReduction: 0, fast: false, reclaim: null,
      typeChange: { cardType, subtype: parseCardSubtype("Warrior") } });
    const b = world(side, [{ cardId: unit.id, deckMods: mods("event") }, { cardId: v.event0.id, deckMods: mods("character") }]);
    const first = play(b.state, side, b.ids[side].hand[0]);
    expect(gains(first.events)).toEqual([]);
    const out = play(first.state, side, b.ids[side].hand[1]);
    expect(out.state.turnLog.played[side].map(r => r.cardType)).toEqual(["event", "character"]);
    expect(gains(out.events).map(e => e.instance)).toEqual([b.ids[side].hand[1]]);
  });
  it("reads live functional sources and conditions at original entry, without an at-play promise", () => {
    const withSource = world(side, [unit.id], { dreamsigns: [], back: [provider.id] });
    const stacked = step(withSource.state, { kind: "play", card: withSource.ids[side].hand[0], from: "hand" }).state;
    // A real opposing interrupt removes the source before the original can enter.
    const removal = { ...spell(18, p.returnToHand(all({ controller: "opponent" }))), speed: "interrupt" as const };
    const local = createEngine(testCatalog([unit, provider, removal]));
    const r = boardState(local.catalog, { active: side, phase: "day", [side]: { hand: [unit.id], back: [provider.id] }, [other]: { hand: [removal.id], energy: 10 } });
    let current = local.apply(r.state, side, { kind: "play", card: r.ids[side].hand[0], from: "hand" }, NO_PROMPTS).state;
    current = local.apply(current, other, { kind: "play", card: r.ids[other].hand[0], from: "hand" }, NO_PROMPTS).state;
    current = passUntil(local, current, s => s.stack.length === 0).state;
    expect(current.instances[r.ids[side].hand[0]].status.gainedSpark).toBe(0);
    expect(spark(step(stacked, { kind: "resolveTop" }).state, withSource.ids[side].hand[0]).spark).toBe(3);
    const lateSource = world(side, [unit.id], { dreamsigns: [sign(4)], back: [arriver.id], void: [provider.id] });
    const arrived = play(lateSource.state, side, lateSource.ids[side].hand[0]);
    expect(gains(arrived.events).map(e => e.amount)).toEqual([2, 1]);
    const falseCondition = world(side, [unit.id], { dreamsigns: [sign(4)] });
    expect(gains(play(falseCondition.state, side, falseCondition.ids[side].hand[0]).events)).toEqual([]);
  });
  it("snapshots all source conditions and causal observers before the first contribution", () => {
    const b = world(side, [unit.id], { dreamsigns: [sign(6), sign(6)] });
    expect(gains(play(b.state, side, b.ids[side].hand[0]).events).map(e => e.amount)).toEqual([1, 1]);
    const hiddenDeck = world(side, [unit.id], { dreamsigns: [sign(7)], deck: [deckProvider.id, v.vanilla1.id] });
    const out = play(hiddenDeck.state, side, hiddenDeck.ids[side].hand[0]);
    const contribution = gains(out.events)[1];
    expect(out.events.some(e => e.kind === "revealed" && e.instances.includes(hiddenDeck.ids[side].deck[0]))).toBe(true);
    expect(contribution.entrySpark?.observedBy).toEqual([]);
    for (const viewer of SIDES) expect(eventSeenBy(contribution, viewer, out.state)).toEqual({ ...contribution, entrySpark: null });
  });
  it("applies source control and functional-zone applicability to the acting controller", () => {
    const b = world(side, [thief.id, unit.id, provider.id], { dreamsigns: [] }, { back: [provider.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(state.instances[b.ids[other].back[0]!]).toMatchObject({ owner: other, controller: side });
    expect(spark(state, b.ids[side].hand[1]).spark).toBe(3);
    const late = play(state, side, b.ids[side].hand[2]);
    expect(gains(late.events)).toEqual([]);
    const held = world(side, [unit.id, hidden.id], { dreamsigns: [] });
    expect(spark(play(held.state, side, held.ids[side].hand[0]).state, held.ids[side].hand[0]).spark).toBe(4);
    const nonplayed = world(side, [handEntry.id, provider.id, unit.id], { dreamsigns: [] });
    const staged = play(nonplayed.state, side, nonplayed.ids[side].hand[0]);
    expect(gains(staged.events)).toEqual([]);
    expect(gains(play(staged.state, side, nonplayed.ids[side].hand[2]).events)).toHaveLength(1);
  });
  it("qualifies an opponent-owned hand card by its actual playing controller", () => {
    const b = world(other, [unit.id], { dreamsigns: [] }, { hand: [stealPlay.id], dreamsigns: [sign(0)] });
    let state = engine.apply(b.state, other, { kind: "play", card: b.ids[other].hand[0], from: "hand" }, answers()).state;
    state = engine.apply(state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, answers()).state;
    state = finish(state).state;
    state = passUntil(engine, state, s => s.turn.active === side && s.turn.phase === "day").state;
    const out = play(state, side, b.ids[other].hand[0]);
    expect(out.state.instances[b.ids[other].hand[0]]).toMatchObject({ owner: other, controller: side, status: { gainedSpark: 1 } });
    expect(gains(out.events).map(e => e.entrySpark?.controller)).toEqual([side]);
  });
  it("gives no never-entered Prevented card a gain or later effect-entry promise", () => {
    const b = world(side, [unit.id, raise.id, unit.id], {}, { hand: [prevent.id] });
    let state = engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, answers()).state;
    const prevented = engine.apply(state, other, { kind: "play", card: b.ids[other].hand[0], from: "hand" }, answers());
    state = finish(prevented.state).state;
    expect(state.instances[b.ids[side].hand[0]]).toMatchObject({ zone: "void", status: { gainedSpark: 0 } });
    const entered = play(state, side, b.ids[side].hand[1]);
    expect(gains(entered.events)).toEqual([]);
    const second = play(entered.state, side, b.ids[side].hand[2]);
    expect(gains(second.events)).toEqual([]);
  });
  it("excludes the created stack copy but includes a created hand card genuinely played first", () => {
    const b = world(side, [unit.id], { dreamsigns: [sign(2)] });
    const out = play(b.state, side, b.ids[side].hand[0]);
    const entries = out.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toBe(b.ids[side].hand[0]);
    expect(gains(out.events).map(e => e.instance)).toEqual([entries[1]]);
    expect(spark(out.state, entries[0]).spark).toBe(2);
    const c = world(side, [create.id]);
    const made = play(c.state, side, c.ids[side].hand[0]);
    const id = made.state.sides[side].hand.find(id => made.state.instances[id].status.created)!;
    const genuine = play(made.state, side, id);
    expect(gains(genuine.events).map(e => e.instance)).toEqual([id]);
  });
  it("retains gains through source departure and reentry without repeating on same-turn replay or rematerialize", () => {
    const b = world(side, [unit.id, again.id, leave.id, raise.id], { back: [provider.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    const repeated = play(state, side, b.ids[side].hand[1]);
    expect(gains(repeated.events)).toEqual([]);
    state = play(repeated.state, side, b.ids[side].hand[2]).state;
    expect(spark(state, b.ids[side].hand[0]).spark).toBe(4);
    const replayed = play(state, side, b.ids[side].hand[0]);
    expect(gains(replayed.events)).toEqual([]);
    expect(spark(replayed.state, b.ids[side].hand[0]).spark).toBe(4);
  });
  it("retains physical gains after control transfer and excludes them from a nonplayed figment copy", () => {
    const b = world(side, [unit.id], {}, { hand: [stealAll.id, copied.id], dreamsigns: [sign(0)] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = passUntil(engine, state, s => s.turn.active === other && s.turn.phase === "day").state;
    state = play(state, other, b.ids[other].hand[0]).state;
    expect(state.instances[b.ids[side].hand[0]].controller).toBe(other);
    expect(spark(state, b.ids[side].hand[0]).spark).toBe(3);
    const out = play(state, other, b.ids[other].hand[1]);
    const copy = out.events.flatMap(e => e.kind === "materialized" ? [e.instance] : [])[0];
    expect(gains(out.events)).toEqual([]);
    expect(spark(out.state, copy).spark).toBe(2);
  });
  it("keeps both players' counts separate on opponent turns and renews a real replay on a normal and extra turn", () => {
    const b = world(side, [unit.id, leave.id, extra.id], {}, { dreamsigns: [sign(0)], hand: [v.fastCharacter.id, v.fastCharacter.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    state = passUntil(engine, state, s => s.turn.active === side && s.turn.phase === "dusk").state;
    const theirs = play(state, other, b.ids[other].hand[0]);
    expect(gains(theirs.events).map(e => e.instance)).toEqual([b.ids[other].hand[0]]);
    const later = play(theirs.state, other, b.ids[other].hand[1]);
    expect(gains(later.events)).toEqual([]);
    state = passUntil(engine, later.state, s => s.turn.active === side && s.turn.phase === "day").state;
    const normal = play(state, side, b.ids[side].hand[0]);
    expect(spark(normal.state, b.ids[side].hand[0]).spark).toBe(4);
    state = play(normal.state, side, b.ids[side].hand[2]).state;
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, s => s.turn.turnNumber > turn && s.turn.active === side && s.turn.phase === "day").state;
    const fresh = state.sides[side].hand.find(id => id !== b.ids[side].hand[0])!;
    expect(gains(play(state, side, fresh).events)).toHaveLength(1);
  });
  it("rejects full plays atomically and does not defer an original entry that loses its last slot", () => {
    const b = world(side, [unit.id, leave.id, raise.id, unit.id], { dreamsigns: [sign(3)], back: Array.from({ length: 9 }, () => v.vanilla1.id), void: [v.vanilla1.id] });
    const blocked = play(b.state, side, b.ids[side].hand[0]);
    expect(blocked.state.instances[b.ids[side].hand[0]]).toMatchObject({ zone: "void", status: { gainedSpark: 0 } });
    expect(gains(blocked.events)).toEqual([]);
    const before = stateHash(blocked.state);
    expect(() => engine.apply(blocked.state, side, { kind: "play", card: b.ids[side].hand[3], from: "hand" }, answers())).toThrow();
    expect(stateHash(blocked.state)).toBe(before);
    const freed = play(blocked.state, side, b.ids[side].hand[1]);
    const recovered = play(freed.state, side, b.ids[side].hand[2]);
    expect(gains(recovered.events)).toEqual([]);
  });
  it("preserves pending entry, gained spark and second-play exclusion through clone/save/view sampling", () => {
    const b = world(side, [unit.id, unit.id]);
    const pending = step(b.state, { kind: "play", card: b.ids[side].hand[0], from: "hand" }).state;
    const decklists = lists(b.state);
    for (const current of [pending, cloneState(pending), deserializeState(serializeState(pending)), ...SIDES.map(viewer => engine.determinize(engine.view(pending, viewer), decklists, () => 0.37))]) {
      const out = step(current, { kind: "resolveTop" });
      expect(gains(out.events).map(e => e.instance)).toEqual([b.ids[side].hand[0]]);
      expect(spark(out.state, b.ids[side].hand[0]).spark).toBe(3);
      expect(stateHash(deserializeState(serializeState(out.state)))).toBe(stateHash(out.state));
    }
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(gains(play(deserializeState(serializeState(out.state)), side, b.ids[side].hand[1]).events)).toEqual([]);
    expect(parseEngineBattleFold(saved(slice(out.state)))).not.toBeNull();
  });
  it("keeps an anonymous concealed first-play ordinal without selecting a newly created replacement", () => {
    const b = world(side, [unit.id, leave.id, hide.id, create.id]);
    let state = b.state;
    for (const id of b.ids[side].hand) state = play(state, side, id).state;
    const id = state.sides[side].hand.find(id => state.instances[id].status.created)!;
    const seen = engine.view(state, side);
    expect(seen.turnLog.played[side].find(r => r.cardType === "character")?.instance).toBeNull();
    const sampled = engine.determinize(seen, lists(b.state), () => 0.37);
    expect(gains(play(sampled, side, id).events)).toEqual([]);
  });
  it("cancels real payment choices, reloads, rejects stale/wrong-side/concurrent answers, and commits one gain", () => {
    const b = world(side, [paid.id, unit.id, unit.id]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = { kind: "play" as const, card: b.ids[side].hand[0], from: "hand" as const };
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action }));
    const prompt = fold.pending(opened)!.prompt;
    expect(createFoldAdapter(engine).pending(restored(opened))?.prompt).toEqual(prompt);
    expect(fold.reduce(opened, { kind: "answer", side: other, promptId: prompt.id, value: [b.ids[side].hand[1]] })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(opened, { kind: "answer", side, promptId: prompt.id, value: [b.ids[side].hand[0]] })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(opened, { kind: "battleAction", side, action })).toMatchObject({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(b.state));
    const reopened = applied(fold.reduce(cancelled, { kind: "battleAction", side, action }));
    expect(fold.reduce(reopened, { kind: "answer", side, promptId: prompt.id, value: [b.ids[side].hand[1]] })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    const latest = fold.pending(reopened)!.prompt;
    const committed = applied(fold.reduce(restored(reopened), { kind: "answer", side, promptId: latest.id, value: [b.ids[side].hand[1]] }));
    const out = finish(committed.committed);
    expect(gains(out.events)).toHaveLength(1);
    expect(fold.reduce(committed, { kind: "answer", side, promptId: latest.id, value: [b.ids[side].hand[1]] })).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
  });
  it("reloads a materialization observer prompt after the entry gain was committed without gaining or logging twice", () => {
    const b = world(side, [unit.id], { back: [pause.id] }, { hand: [] });
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: r => records.push(r) });
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(opened)!.prompt;
    expect(opened.committed.instances[b.ids[side].hand[0]].status.gainedSpark).toBe(1);
    const cold = createFoldAdapter(engine, { checkEventPrefix: true, log: r => records.push(r) });
    const done = applied(cold.reduce(restored(opened), { kind: "answer", side, promptId: prompt.id, value: false }));
    expect(done.committed.instances[b.ids[side].hand[0]].status.gainedSpark).toBe(1);
    expect(records.filter(r => r.event === "engine.firstPlayedCharacterEntrySpark")).toHaveLength(1);
  });
  it("keeps committed entry once when a subsequent observer errors and rejects static instructions in current/history saves", () => {
    const b = world(side, [unit.id], { back: [fail.id] }, { hand: [] });
    const before = stateHash(b.state);
    const fold = createFoldAdapter(engine);
    const out = fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } });
    expect(out.kind).toBe("applied");
    if (out.kind !== "applied") throw new Error("Expected recovered error");
    expect(out.error).not.toBeNull();
    expect(out.slice.committed.instances[b.ids[side].hand[0]].status.gainedSpark).toBe(1);
    expect(stateHash(b.state)).toBe(before);
    const cold = deserializeState(serializeState(out.slice.committed)), committedHash = stateHash(cold);
    expect(() => runStep(cold, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    expect(stateHash(cold)).toBe(committedHash);
    expect(cold.instances[b.ids[side].hand[0]].status.gainedSpark).toBe(1);
    const valid = slice(out.slice.committed);
    expect(parseEngineBattleFold(saved(valid))).not.toBeNull();
    expect(parseEngineBattleFold(saved({ ...valid, history: { base: slice(cloneState(valid.committed)), entries: [] } }))).not.toBeNull();
    for (const history of [false, true]) {
      const bad = restored(valid), targetState = history ? cloneState(valid.committed) : bad.committed;
      targetState.floating.push({ id: "e1", source: { kind: "dreamsign", side, index: 0 }, controller: side, timestamp: 0,
        expiry: { at: "never" }, change: { kind: "firstPlayedCharacterEntrySpark", player: side, amount: 1 } });
      targetState.nextEffect = 2;
      const candidate = history ? { ...bad, history: { base: slice(targetState), entries: [] } } : bad;
      expect(parseEngineBattleFold(saved(candidate))).toBeNull();
    }
  });
  it("freezes causal privacy at entry and logs exact source occurrences while preserving ordinary gain events", () => {
    const b = world(side, [unit.id, hidden.id], { dreamsigns: [sign(0), sign(0)] });
    const out = play(b.state, side, b.ids[side].hand[0]);
    const contributions = gains(out.events), last = contributions[2];
    expect(contributions.map(e => e.amount)).toEqual([1, 1, 2]);
    expect(contributions.map(e => e.entrySpark?.source)).toEqual([{ kind: "dreamsign", side, index: 0 }, { kind: "dreamsign", side, index: 1 }, b.ids[side].hand[1]]);
    expect(eventSeenBy(last, side, out.state)).toEqual(last);
    expect(eventSeenBy(last, other, out.state)).toEqual({ ...last, entrySpark: null });
    const revealed = play(out.state, side, b.ids[side].hand[1]);
    expect(eventSeenBy(last, other, revealed.state)).toEqual({ ...last, entrySpark: null });
    const logs = eventLogRecords(out.events, b.state.version).filter(r => r.event === "engine.firstPlayedCharacterEntrySpark");
    expect(logs.map(r => r.detail)).toEqual(contributions);
    expect(logs[2].detail).toMatchObject({ amount: 2, entrySpark: { source: b.ids[side].hand[1], ability: 0, controller: side, observedBy: [side] } });
    const ordinary = { kind: "sparkGained" as const, instance: b.ids[side].hand[0], amount: 2, expiry: { at: "never" as const }, additional: false };
    expect(eventSeenBy(ordinary, other, out.state)).toEqual(ordinary);
    expect(eventSeenBy({ ...ordinary, seenBy: [side] }, other, out.state)).toBeNull();
    expect(eventLogRecords([ordinary], 0)).toEqual([]);
  });
  it("keeps zero inert and refuses invalid authored amounts before any play", () => {
    const b = world(side, [unit.id], { dreamsigns: [sign(1)], back: [watcher.id] });
    const before = stateHash(b.state), out = play(b.state, side, b.ids[side].hand[0]);
    expect(gains(out.events)).toEqual([]);
    expect(out.state.sides[side].score).toBe(0);
    for (const amount of [-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => p.firstPlayedCharacterEntrySpark(amount)).toThrow(RangeError);
    expect(stateHash(b.state)).toBe(before);
  });
});
