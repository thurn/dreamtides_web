/** Current-turn references through synthetic public actions, saves, views and replay. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { characteristicsOf, copiableCostOf } from "../../../continuous/characteristics";
import { abandonedIn, activated, all, characterYouControl, energy, event, everyIn, exhaustSelf, lastMaterialized, lastPlayed, materializedThisTurn, self, staticAbility, target, thisTurn } from "../../../dsl/builders";
import { atEndOfTurn, onMaterialized, triggered, triggeringCard, whenYouPlay } from "../../../dsl/triggers";
import { NO_DECK_MODS } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { createFigments } from "../../../rules/figments";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, DeckEntry } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import { CHOSEN_SUBTYPE, withChosenSubtype } from "../choose-subtype";
import * as p from "../index";

const warrior = lastPlayed({ cardType: "character", subtype: "Warrior" });
const copy = p.materializeFigmentCopy(warrior, { zeroSpark: true });
const spell = (n: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({ ...v.event0, id: syntheticId(0x220000 + n), status: "authored", abilities: () => [event(effect)] });
const a: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x220001), status: "authored", abilities: () => [triggered(onMaterialized(), p.gainEnergy(1))] };
const b: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x220002) };
const mage: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x220003), subtype: "Mage" };
const F = {
  copy: { ...spell(10, copy), speed: "fast" as const }, other: { ...spell(11, p.materializeFigmentCopy(lastPlayed({ cardType: "character", subtype: "Warrior" }, "opponent"), { zeroSpark: true })), speed: "fast" as const },
  kill: spell(12, p.dissolve(target(characterYouControl()))),
  make: spell(13, p.createCard(b.id)), again: { ...spell(14, p.rematerialize(lastMaterialized())), speed: "fast" as const },
  put: spell(15, p.materialize(everyIn("void", { cardType: "character" }))),
  bounce: spell(16, p.returnToHand(all(characterYouControl()))),
  hide: spell(17, p.shuffleInto([everyIn("hand", { cardType: "character" })])),
  types: spell(18, p.giveAllTypes(all(characterYouControl()))),
  pause: spell(20, p.sequence(copy, p.optional(p.gainPoints(1)))),
  fail: spell(21, p.sequence(copy, p.optional(p.gainPoints(1)), p.gainAdditionalSpark(self(), 1))),
  abandon: spell(22, p.abandon()), raise: spell(23, p.materialize(abandonedIn("void", { cardType: "character" }))),
  extra: spell(24, p.takeExtraTurn()),
  copyStack: { ...b, id: syntheticId(0x220025), status: "authored" as const, abilities: () => [triggered(whenYouPlay({ cardType: "character" }), p.copyCard(triggeringCard()))] },
  prevent: { ...spell(26, p.prevent({ kind: "stackItem", controller: "opponent", cardType: "character" })), speed: "interrupt" as const },
  remap: spell(27, withChosenSubtype(p.materializeFigmentCopy(lastPlayed({ cardType: "character", subtype: CHOSEN_SUBTYPE }), { zeroSpark: true }), "Mage")),
  steal: { ...spell(28, p.gainControl(lastMaterialized("opponent"))), speed: "fast" as const },
  selectedAgain: spell(29, p.rematerialize(target(characterYouControl()))),
  physicalZero: spell(40, p.materializeFigmentCopy(target(characterYouControl()), { zeroSpark: true })),
  physical: spell(41, p.materializeFigmentCopy(target(characterYouControl()))),
  fill: { ...spell(42, p.materializeFigments(ZONE_FIGMENT.warrior.id, 1, { player: "opponent" })), speed: "interrupt" as const },
  shares: { ...spell(43, p.sequence()), synthetic: { resolve(ctx, item) {
    createFigments(ctx, item.controller, { kind: "figmentCopy", cardId: b.id, spark: 5 }, { amplified: false, deckMods: { ...NO_DECK_MODS, sparkBonus: 3 } }, 3);
  } } } satisfies EngineCardDefinition,
};
const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000220030"), status: "authored" as const, abilities: () => [activated([energy(2), exhaustSelf()], copy)] };
const bell: EngineDreamsignDefinition = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000220031"), status: "authored", abilities: () => [triggered(atEndOfTurn(), p.rematerialize(lastMaterialized()), { condition: thisTurn(materializedThisTurn(), 2, 2) })] };
const prior: EngineDreamsignDefinition = { ...bell, id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000220032"), abilities: () => [triggered(atEndOfTurn(), p.materialize(everyIn("void", { cardType: "character" })))] };
const referenceReader: EngineDreamsignDefinition = { ...bell, id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000220033"), abilities: () => [activated([], p.rematerialize(lastMaterialized()))] };
const engine = createEngine(testCatalog([a, b, mage, ...Object.values(F)], { avatars: [avatar], dreamsigns: [bell, prior, referenceReader] }, ZONE_FIGMENTS));
const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
const setup = (side: Side, mine: SideSetup, theirs: SideSetup = {}) => boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100, [side]: { energy: 30, deck, ...mine }, [opponent(side)]: { energy: 30, deck, ...theirs } });
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const envelope = (committed: BattleState, current = slice(committed)) => ({ init: { seed: committed.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: current });
const loaded = (state: BattleState) => parseEngineBattleFold(JSON.parse(JSON.stringify(envelope(state))));
function applied(out: IntentOutcome): BattleSlice { if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out)); return out.slice; }
function cast(state: BattleState, side: Side, card: InstanceId, source: AnswerSource = NO_PROMPTS) {
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, source);
  const rest = passUntil(engine, played.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  const events = [...played.events, ...rest.events];
  expect(invariantViolations(rest.state, engine.catalog)).toEqual([]);
  expect(eventRedactionViolations(events, state, rest.state)).toEqual([]);
  return { state: rest.state, events };
}
const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];
const created = (events: readonly EngineEvent[]) => events.flatMap(e => e.kind === "cardCreated" && e.printing.kind !== "card" ? [e.instance] : []);
const repeated = (events: readonly EngineEvent[]) => events.flatMap(e => e.kind === "materialized" && e.rematerialized === true ? [e.instance] : []);
const decks = (state: BattleState) => Object.fromEntries(SIDES.map(side => [side, Object.values(state.instances).flatMap(card => card.owner === side && card.printing.kind === "card" && !card.status.created ? [{ cardId: card.printing.cardId, ...card.variant }] : [])])) as Record<Side, DeckEntry[]>;
function expectCopy(state: BattleState, events: readonly EngineEvent[], side: Side, cardId: typeof a.id) {
  const [id] = created(events); expect(created(events)).toHaveLength(1);
  expect(state.instances[id]).toMatchObject({ owner: side, controller: side, zone: "play", printing: { kind: "figmentCopy", cardId, spark: 0 }, status: { created: true, gainedSpark: 0, counters: 0 } });
  return id;
}

describe("historyRefs", () => {
  it.each(SIDES)("selects the latest matching actual play rather than UUID, board order or latest materialization for %s", side => {
    const f = setup(side, { hand: [a.id, b.id, a.id, mage.id, F.copy.id], void: [b.id] });
    let state = f.state;
    for (const id of f.ids[side].hand.slice(0, 4)) state = cast(state, side, id).state;
    const result = cast(state, side, f.ids[side].hand[4]);
    expectCopy(result.state, result.events, side, a.id);
    expect(state.turnLog.played[side].map(r => r.instance)).toEqual(f.ids[side].hand.slice(0, 4));
    const none = setup(side, { hand: [F.copy.id], back: [b.id] });
    expect(created(cast(none.state, side, none.ids[side].hand[0]).events)).toEqual([]);
  });

  it.each(SIDES)("retains a created latest warrior after cessation without substituting an earlier survivor for %s", side => {
    const f = setup(side, { hand: [a.id, F.make.id, F.kill.id, F.copy.id] });
    let state = cast(f.state, side, f.ids[side].hand[0]).state;
    state = cast(state, side, f.ids[side].hand[1]).state;
    const latest = last(state.sides[side].hand)!;
    state = cast(state, side, latest).state;
    state = cast(state, side, f.ids[side].hand[2], new ScriptedSource([[latest]])).state;
    expect(state.instances[latest]).toBeUndefined();
    expect(state.instances[f.ids[side].hand[0]].zone).toBe("play");
    const result = cast(state, side, f.ids[side].hand[3]);
    expectCopy(result.state, result.events, side, b.id);
    expect(loaded(state)).not.toBeNull();
    const record = last(state.turnLog.played[side].filter(entry => entry.instance === latest))!;
    const legacy = cloneState(state), legacyRecord = last(legacy.turnLog.played[side].filter(entry => entry.instance === latest))!;
    delete (legacyRecord as { copiable?: unknown }).copiable;
    expect(loaded(legacy)).not.toBeNull();
    expect(created(cast(legacy, side, f.ids[side].hand[3]).events)).toEqual([]);
    for (const invalid of [{}, { ...record.copiable, status: {} }, { printing: record.copiable!.printing, variant: { amplified: "invalid" } }]) {
      const bad = cloneState(state);
      Object.assign(last(bad.turnLog.played[side].filter(entry => entry.instance === latest))!, { copiable: invalid });
      expect(loaded(bad)).toBeNull();
    }
  });

  it.each(SIDES)("excludes unplayed entries and stack copies while retaining a prevented committed play for %s", side => {
    const f = setup(side, { hand: [F.put.id, F.copy.id], void: [b.id] });
    const put = cast(f.state, side, f.ids[side].hand[0]);
    expect(created(cast(put.state, side, f.ids[side].hand[1]).events)).toEqual([]);
    const copied = setup(side, { hand: [b.id], back: [F.copyStack.id] });
    const played = cast(copied.state, side, copied.ids[side].hand[0]);
    expect(played.state.turnLog.played[side]).toHaveLength(1);
    expect(played.events.filter(e => e.kind === "materialized")).toHaveLength(2);
    const stopped = setup(side, { hand: [b.id, F.copy.id] }, { hand: [F.prevent.id] });
    const announced = engine.apply(stopped.state, side, { kind: "play", card: stopped.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const prevented = engine.apply(announced.state, opponent(side), { kind: "play", card: stopped.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS);
    const ready = passUntil(engine, prevented.state, next => next.stack.length === 0, NO_PROMPTS).state;
    expect(ready.instances[stopped.ids[side].hand[0]].zone).toBe("void");
    const result = cast(ready, side, stopped.ids[side].hand[1]);
    expectCopy(result.state, result.events, side, b.id);
  });

  it.each(SIDES)("copies immutable variant values and own abilities without gained layers or statuses for %s", side => {
    const variant = { amplified: true, deckMods: { ...NO_DECK_MODS, sparkBonus: 3, costReduction: 1, typeChange: { cardType: "character" as const, subtype: "Warrior" as const } } };
    const f = setup(side, { hand: [{ cardId: a.id, ...variant }, F.types.id, F.copy.id] });
    let state = cast(f.state, side, f.ids[side].hand[0]).state;
    state = cast(state, side, f.ids[side].hand[1]).state;
    const original = f.ids[side].hand[0];
    // Raw mutable statuses are synthetic input; the copied values remain ordinary real play records.
    state = cloneState(state);
    state.instances[original].status.gainedSpark = 9; state.instances[original].status.counters = 4;
    const before = state.sides[side].currentEnergy;
    const result = cast(state, side, f.ids[side].hand[2]);
    const id = expectCopy(result.state, result.events, side, a.id);
    expect(result.state.instances[id].variant).toEqual(state.instances[original].variant);
    expect(result.state.instances[id].variant).toMatchObject(variant);
    expect(characteristicsOf(result.state, engine.catalog, id)).toMatchObject({ allTypes: false, spark: 0 });
    expect(copiableCostOf(result.state, engine.catalog, id)).toBe(0);
    expect(result.state.sides[side].currentEnergy).toBe(before + 1);
    const ordinary = setup(side, { hand: [{ cardId: a.id, ...variant }, F.physical.id, F.physicalZero.id] });
    let live = cast(ordinary.state, side, ordinary.ids[side].hand[0]).state;
    const normal = cast(live, side, ordinary.ids[side].hand[1]);
    const [normalId] = created(normal.events);
    expect(normal.state.instances[normalId].printing).toMatchObject({ kind: "figmentCopy", spark: null });
    expect(characteristicsOf(normal.state, engine.catalog, normalId).spark).toBe(4);
    live = normal.state;
    const zero = cast(live, side, ordinary.ids[side].hand[2], new ScriptedSource([[ordinary.ids[side].hand[0]]]));
    const zeroId = expectCopy(zero.state, zero.events, side, a.id);
    expect(characteristicsOf(zero.state, engine.catalog, zeroId).spark).toBe(0);
    expect(zero.state.instances[zeroId].variant).toEqual(live.instances[ordinary.ids[side].hand[0]].variant);
  });

  it.each(SIDES)("matches types as played, retains all-types qualification and accepts a remapped subtype for %s", side => {
    const f = setup(side, { hand: [mage.id, F.types.id, F.copy.id, F.bounce.id, F.copy.id, F.remap.id] });
    let state = cast(f.state, side, f.ids[side].hand[0]).state;
    state = cast(state, side, f.ids[side].hand[1]).state;
    expect(created(cast(state, side, f.ids[side].hand[2]).events)).toEqual([]);
    state = cast(state, side, f.ids[side].hand[3]).state;
    state = cast(state, side, f.ids[side].hand[0]).state;
    expect(last(state.turnLog.played[side])?.allTypes).toBe(true);
    const result = cast(state, side, f.ids[side].hand[4]);
    expectCopy(result.state, result.events, side, mage.id);
    const other = setup(side, { hand: [mage.id, F.remap.id] });
    const ready = cast(other.state, side, other.ids[side].hand[0]);
    const remapped = cast(ready.state, side, other.ids[side].hand[1]);
    expectCopy(remapped.state, remapped.events, side, mage.id);
  });

  it.each(SIDES)("uses the reference's relative player while copies belong to the effect controller for %s", side => {
    const f = setup(side, { hand: [b.id] }, { hand: [F.other.id] });
    const played = cast(f.state, side, f.ids[side].hand[0]);
    const turn = passUntil(engine, played.state, next => next.turn.phase === "dusk", NO_PROMPTS).state;
    const playedOther = runStep(turn, { kind: "play", card: f.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS, engine.catalog);
    if (playedOther.kind !== "done") throw new Error("Unexpected other-side play prompt");
    const resolved = runStep(playedOther.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (resolved.kind !== "done") throw new Error("Unexpected other-side resolve prompt");
    expectCopy(resolved.state, resolved.events, opponent(side), b.id);
  });

  it.each(SIDES)("selects the latest materialized physical member and never replaces a departed or ceased latest for %s", side => {
    const f = setup(side, { hand: [b.id, b.id, F.kill.id, F.again.id] });
    let state = cast(f.state, side, f.ids[side].hand[0]).state;
    state = cast(state, side, f.ids[side].hand[1]).state;
    const latest = f.ids[side].hand[1];
    const again = cast(state, side, f.ids[side].hand[3]);
    expect(repeated(again.events)).toEqual([latest]);
    const gone = cast(state, side, f.ids[side].hand[2], new ScriptedSource([[latest]])).state;
    expect(repeated(cast(gone, side, f.ids[side].hand[3]).events)).toEqual([]);
    const ceased = setup(side, { hand: [a.id, F.make.id, F.kill.id, F.again.id] });
    let made = cast(ceased.state, side, ceased.ids[side].hand[0]).state;
    made = cast(made, side, ceased.ids[side].hand[1]).state;
    const createdId = last(made.sides[side].hand)!;
    made = cast(made, side, createdId).state;
    made = cast(made, side, ceased.ids[side].hand[2], new ScriptedSource([[createdId]])).state;
    expect(repeated(cast(made, side, ceased.ids[side].hand[3]).events)).toEqual([]);
    const reordered = setup(side, { hand: [b.id, b.id, F.selectedAgain.id, F.again.id] });
    let ordered = cast(reordered.state, side, reordered.ids[side].hand[0]).state;
    ordered = cast(ordered, side, reordered.ids[side].hand[1]).state;
    ordered = cast(ordered, side, reordered.ids[side].hand[2], new ScriptedSource([[reordered.ids[side].hand[0]]])).state;
    expect(repeated(cast(ordered, side, reordered.ids[side].hand[3]).events)).toEqual([reordered.ids[side].hand[0]]);
  });

  it.each(SIDES)("requires current control of the latest materialization for %s", side => {
    const f = setup(side, { hand: [b.id, F.again.id] }, { hand: [F.steal.id] });
    const ready = cast(f.state, side, f.ids[side].hand[0]).state;
    const dusk = passUntil(engine, ready, next => next.turn.phase === "dusk").state;
    const played = runStep(dusk, { kind: "play", card: f.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS, engine.catalog);
    if (played.kind !== "done") throw new Error("Unexpected steal prompt");
    const stolen = runStep(played.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (stolen.kind !== "done") throw new Error("Unexpected steal resolution prompt");
    expect(stolen.state.instances[f.ids[side].hand[0]].controller).toBe(opponent(side));
    const night = passUntil(engine, stolen.state, next => next.turn.phase === "night").state;
    expect(repeated(cast(night, side, f.ids[side].hand[1]).events)).toEqual([]);
  });

  it.each(SIDES)("composes exactly two materializations with the end-of-turn latest reference for %s", side => {
    for (const count of [0, 1, 2, 3]) {
      const f = setup(side, { hand: Array.from({ length: count }, () => b.id), dreamsigns: [bell.id] });
      let state = f.state;
      for (const id of f.ids[side].hand) state = cast(state, side, id).state;
      const end = passUntil(engine, state, next => next.turn.turnNumber > state.turn.turnNumber);
      expect(repeated(end.events)).toEqual(count === 2 ? [f.ids[side].hand[1]] : []);
    }
    const f = setup(side, { hand: [b.id, b.id], void: [mage.id], dreamsigns: [prior.id, bell.id] });
    let state = f.state;
    for (const id of f.ids[side].hand) state = cast(state, side, id).state;
    const end = passUntil(engine, state, next => next.turn.turnNumber > state.turn.turnNumber);
    expect(end.events.some(e => e.kind === "triggerQueued" && typeof e.source === "object" && e.source?.kind === "dreamsign" && e.source.index === 1)).toBe(true);
    expect(repeated(end.events)).toEqual([]);
  });

  it.each(SIDES)("uses only the active ordinary or extra turn and preserves the abandoned physical collection for %s", side => {
    for (const extra of [false, true]) {
      const f = setup(side, { hand: [b.id, F.copy.id, F.again.id, ...(extra ? [F.extra.id] : [])] });
      let state = cast(f.state, side, f.ids[side].hand[0]).state;
      if (extra) state = cast(state, side, f.ids[side].hand[3]).state;
      let next = passUntil(engine, state, current => current.turn.turnNumber > state.turn.turnNumber).state;
      expect(next.turnLog.played[side]).toEqual([]);
      if (!extra) next = passUntil(engine, next, current => current.turn.phase === "dusk").state;
      const direct = runStep(next, { kind: "play", card: f.ids[side].hand[1], from: "hand" }, NO_PROMPTS, engine.catalog);
      if (direct.kind !== "done") throw new Error("Unexpected new turn prompt");
      const result = runStep(direct.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
      if (result.kind !== "done") throw new Error("Unexpected copy resolution prompt");
      expect(created(result.events)).toEqual([]);
    }
    const f = setup(side, { hand: [F.abandon.id, F.raise.id], back: [b.id] });
    const gone = cast(f.state, side, f.ids[side].hand[0]);
    const raised = cast(gone.state, side, f.ids[side].hand[1]);
    expect(raised.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([f.ids[side].back[0]]);
  });

  it.each(SIDES)("preserves captured values through cloning, hashing, LOAD, concealment and both viewers' sampling for %s", side => {
    const f = setup(side, { hand: [b.id, F.bounce.id, F.hide.id], avatar: avatar.id, dreamsigns: [referenceReader.id] });
    let state = cast(f.state, side, f.ids[side].hand[0]).state;
    state = cast(state, side, f.ids[side].hand[1]).state;
    state = cast(state, side, f.ids[side].hand[2]).state;
    const roundtrip = deserializeState(serializeState(state));
    expect(stateHash(roundtrip)).toBe(stateHash(state)); expect(loaded(state)).not.toBeNull();
    const clone = cloneState(state);
    expect(clone.turnLog.played[side][0].copiable).toEqual(state.turnLog.played[side][0].copiable);
    expect(clone.turnLog.played[side][0].copiable).not.toBe(state.turnLog.played[side][0].copiable);
    expect(clone.turnLog.played[side][0].copiable?.variant).not.toBe(state.turnLog.played[side][0].copiable?.variant);
    const before = stateHash(clone); Object.assign(clone.turnLog.played[side][0].copiable!.variant, { amplified: true });
    expect(stateHash(clone)).not.toBe(before);
    for (const viewer of SIDES) {
      const view = engine.view(state, viewer);
      expect(view.turnLog.played[side][0].instance).toBeNull();
      expect(view.turnLog.played[side][0].copiable).toEqual(state.turnLog.played[side][0].copiable);
      const sampled = engine.determinize(view, decks(state), () => 0.5);
      expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(view));
      expect(loaded(sampled)).not.toBeNull();
      const physical = sampled.turnLog.played[side][0].instance;
      const member = view.turnLog.played[side][0].firstCharacterMember;
      const descriptor = view.hiddenCards?.[side].find(card => card.member === member);
      expect(descriptor).toBeDefined();
      expect({ printing: descriptor!.printing, variant: descriptor!.variant }).toEqual(view.turnLog.played[side][0].copiable);
      expect(sampled.instances[physical]).toMatchObject({ zone: "deck", printing: descriptor!.printing, variant: descriptor!.variant });
      expect(sampled.instances[sampled.turnLog.materialized![side][0].instance]).toBeUndefined();
      const reading = engine.apply(sampled, side, { kind: "activate", source: { kind: "dreamsign", side, index: 0 }, ability: 0 }, NO_PROMPTS);
      const read = passUntil(engine, reading.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
      expect(repeated([...reading.events, ...read.events])).toEqual([]);
      const start = engine.apply(read.state, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS);
      const result = passUntil(engine, start.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
      expectCopy(result.state, [...start.events, ...result.events], side, b.id);
    }
    expect(determinizationDivergences(engine, state, decks(state), battleSeed("history-refs"), 0)).toEqual([]);
  });

  it.each(SIDES)("loads valid legacy pairs conservatively and rejects malformed or live-conflicting retained values for %s", side => {
    const f = setup(side, { hand: [b.id, F.copy.id, F.kill.id] });
    const state = cast(f.state, side, f.ids[side].hand[0]).state;
    for (const field of ["printing", "variant"] as const) {
      const bad = cloneState(state), tuple = bad.turnLog.played[side][0].copiable!;
      Object.assign(tuple, field === "printing" ? { printing: { kind: "card", cardId: a.id } } : { variant: { amplified: true } });
      expect(loaded(bad)).toBeNull();
    }
    for (const invalid of [{}, { printing: { kind: "card", cardId: "invalid" }, variant: { amplified: false } }, { printing: state.instances[f.ids[side].hand[0]].printing }, { ...state.turnLog.played[side][0].copiable, status: {} }]) {
      const bad = cloneState(state); Object.assign(bad.turnLog.played[side][0], { copiable: invalid });
      expect(loaded(bad)).toBeNull();
    }
    const legacy = cloneState(state); delete (legacy.turnLog.played[side][0] as { copiable?: unknown }).copiable;
    expect(loaded(legacy)).not.toBeNull();
    const result = cast(legacy, side, f.ids[side].hand[1]);
    expectCopy(result.state, result.events, side, b.id);
    delete legacy.turnLog.materialized;
    expect(loaded(legacy)).not.toBeNull();
  });

  it.each(SIDES)("keeps history transactional across suspended reload, wrong-side, stale, duplicate and concurrent intents for %s", side => {
    const f = setup(side, { hand: [b.id, F.pause.id] });
    const ready = cast(f.state, side, f.ids[side].hand[0]).state, fold = createFoldAdapter(engine);
    let pending = applied(fold.reduce(slice(ready), { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[1], from: "hand" } }));
    if (fold.pending(pending) === null) pending = applied(fold.reduce(pending, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
    const prompt = fold.pending(pending)!;
    expect(Object.values(prompt.display.instances).filter(i => i.printing.kind === "figmentCopy")).toHaveLength(1);
    const restored = parseEngineBattleFold(JSON.parse(JSON.stringify(envelope(pending.committed, pending))))!;
    expect(restored).not.toBeNull(); expect(fold.pending(restored.slice)?.prompt).toEqual(prompt.prompt);
    const cold = createFoldAdapter(createEngine(engine.catalog));
    expect(stateHash(cold.pending(restored.slice)!.display)).toBe(stateHash(prompt.display));
    const hash = stateHash(restored.slice.committed);
    for (const intent of [
      { kind: "answer" as const, side: opponent(side), promptId: prompt.prompt.id, value: true },
      { kind: "answer" as const, side, promptId: `${prompt.prompt.id}0`, value: true },
      { kind: "answer" as const, side, promptId: prompt.prompt.id, value: [] },
      { kind: "battleAction" as const, side, action: { kind: "pass" as const } },
    ]) expect(fold.reduce(restored.slice, intent as Parameters<typeof fold.reduce>[1]).kind).toBe("bounced");
    expect(stateHash(restored.slice.committed)).toBe(hash);
    const intent = { kind: "answer" as const, side, promptId: prompt.prompt.id, value: true };
    const done = applied(fold.reduce(restored.slice, intent));
    expect(Object.values(done.committed.instances).filter(i => i.printing.kind === "figmentCopy")).toHaveLength(1);
    expect(fold.reduce(done, intent).kind).toBe("bounced");
    expect(cold.reduce(restored.slice, intent)).toEqual(fold.reduce(pending, intent));
  });

  it.each(SIDES)("rolls back a midstep error after new copy output and can replay the same published prefix for %s", side => {
    const f = setup(side, { hand: [b.id, F.fail.id] });
    const state = cast(f.state, side, f.ids[side].hand[0]).state, fold = createFoldAdapter(engine);
    let pending = applied(fold.reduce(slice(state), { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[1], from: "hand" } }));
    if (fold.pending(pending) === null) pending = applied(fold.reduce(pending, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
    const prompt = fold.pending(pending)!, before = stateHash(pending.committed);
    const failed = fold.reduce(pending, { kind: "answer", side, promptId: prompt.prompt.id, value: true });
    expect(failed.kind).toBe("applied");
    if (failed.kind !== "applied") throw new Error("Expected recoverable error");
    expect(failed.error).not.toBeNull(); expect(stateHash(failed.slice.committed)).toBe(before);
    expect(Object.values(failed.slice.committed.instances).some(i => i.printing.kind === "figmentCopy")).toBe(false);
    expect(fold.pending(pending)?.prompt).toEqual(prompt.prompt);
  });

  it.each(SIDES)("enforces avatar exhaustion and ordinary capacity, with resolving references excluded from statics for %s", side => {
    const f = setup(side, { hand: [b.id], avatar: avatar.id });
    const ready = cast(f.state, side, f.ids[side].hand[0]).state;
    const before = ready.sides[side].currentEnergy;
    const result = engine.apply(ready, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS);
    const done = passUntil(engine, result.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
    expectCopy(done.state, [...result.events, ...done.events], side, b.id);
    expect(done.state.sides[side].avatar?.exhausted).toBe(true);
    expect(done.state.sides[side].currentEnergy).toBe(before - 2);
    const full = setup(side, { back: Array(10).fill(b.id), avatar: avatar.id });
    expect(engine.legalActions(full.state, side).some(action => action.kind === "activate")).toBe(false);
    const race = setup(side, { hand: [b.id], back: Array(8).fill(v.vanilla0.id), avatar: avatar.id }, { hand: [F.fill.id] });
    const room = cast(race.state, side, race.ids[side].hand[0]).state;
    const activation = engine.apply(room, side, { kind: "activate", source: { kind: "avatar", side }, ability: 0 }, NO_PROMPTS);
    const filling = engine.apply(activation.state, opponent(side), { kind: "play", card: race.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS);
    const filled = passUntil(engine, filling.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
    expect(Object.values(filled.state.instances).filter(i => i.printing.kind === "figmentCopy")).toEqual([]);
    expect([...filling.events, ...filled.events]).toContainEqual({ kind: "capacityReached", side, instance: null, missing: 1 });
    const share = setup(side, { hand: [F.shares.id], back: Array(8).fill(v.vanilla0.id) });
    const shared = cast(share.state, side, share.ids[side].hand[0]);
    expect(created(shared.events).map(id => characteristicsOf(shared.state, engine.catalog, id).spark)).toEqual([8, 7]);
    const invalid = { ...b, id: syntheticId(0x220099), status: "authored" as const, abilities: () => [staticAbility(p.sparkModifier(lastMaterialized(), 1))] };
    const local = createEngine(testCatalog([invalid]));
    const board = boardState(local.catalog, { active: side, phase: "day", [side]: { back: [invalid.id] } });
    expect(() => local.view(board.state, side)).toThrow();
  });
});
