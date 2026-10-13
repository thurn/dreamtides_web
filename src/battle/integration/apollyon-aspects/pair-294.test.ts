/** Public synthetic contracts for genuine permanent pair-294 engine emblems. */
import { describe, expect, it } from "vitest";
import { smallEnemyDissolveAspectAbilities } from "../../../content/apollyon/aspects/aspect-ccc0385e-ff00-4be3-a807-99e4def47d2d";
import { reclaimedCharacterSparkAspectAbilities } from "../../../content/apollyon/aspects/aspect-e70d2d02-9ba6-434b-94d3-73ad29d3e9f4";
import { parseAvatarId, parsePromptId } from "../../../types/identifiers";
import type { EngineCardDefinition } from "../../../engine/catalog";
import { copiableCostOf } from "../../../engine/continuous/characteristics";
import { discardCost, energy, event, keyword, reclaim, target, enemyCharacter } from "../../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../../engine/dsl/triggers";
import { NO_DECK_MODS } from "../../../engine/dsl/types";
import { createEngine, IllegalAction } from "../../../engine/engine";
import * as p from "../../../engine/effects/primitives";
import { eventSeenBy, type EngineEvent } from "../../../engine/events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../engine/fold/slice";
import type { Answer } from "../../../engine/prompts/types";
import type { Action } from "../../../engine/rules/actions";
import { effectiveSpark } from "../../../engine/rules/spark";
import { routeCosts } from "../../../engine/rules/timing";
import { deserializeState, stateHash } from "../../../engine/state/hash";
import { opponent, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { boardState, type SideSetup } from "../../../engine/testing/board";
import { invariantViolations } from "../../../engine/testing/invariants";
import { eventRedactionViolations, redactionViolations } from "../../../engine/testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";

const DISSOLVER = parseAvatarId("9bcfcec6-873a-4d2b-992d-91fecdd96208");
const RECLAIMER = parseAvatarId("649a0d89-a07d-4bc0-ade6-ea9eb5805c80");
const subject: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x64400), status: "authored", costs: [energy(3)], abilities: () => [reclaim(energy(2))] };
const C = {
  subject,
  response: { ...subject, id: syntheticId(0x64401), speed: "interrupt", abilities: () => [reclaim(energy(1))] },
  event: { ...v.event1, id: syntheticId(0x64402), status: "authored", abilities: () => [keyword("reclaim")] },
  protected: { ...v.vanilla2, id: syntheticId(0x64403), status: "authored", abilities: () => [keyword("veil")] },
  dissolve: { ...v.event0, id: syntheticId(0x64404), status: "authored", abilities: () => [event(p.dissolve(target(enemyCharacter())))] },
  failure: { ...subject, id: syntheticId(0x64405), synthetic: { resolve(ctx, item) {
    ctx.state.instances[item.instance].status.gainedSpark += 99;
    throw new Error("synthetic failure after physical gain");
  } } },
  cost: { ...subject, id: syntheticId(0x64406), abilities: () => [reclaim(energy(1), discardCost())] },
  interactive: { ...subject, id: syntheticId(0x64407), abilities: () => [reclaim(energy(2)), triggered(onMaterialized(), p.optional(p.gainPoints(1)))] },
} satisfies Record<string, EngineCardDefinition>;
const E = createEngine(testCatalog(Object.values(C), { avatars: [
  { id: DISSOLVER, status: "authored", abilities: smallEnemyDissolveAspectAbilities },
  { id: RECLAIMER, status: "authored", abilities: reclaimedCharacterSparkAspectAbilities },
] }));
const deck = Array.from({ length: 8 }, () => v.vanilla3.id);
function setup(side: Side, avatar: typeof RECLAIMER, own: SideSetup = {}, other: SideSetup = {}) {
  return boardState(E.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { avatar, energy: 8, deck, ...own },
    [opponent(side)]: { avatar, energy: 8, deck, hand: [v.interruptEvent.id], ...other } });
}
const emblem = (side: Side) => ({ kind: "avatar", side } as const);
const activate = (side: Side): Action => ({ kind: "activate", source: emblem(side), ability: 0 });
const play = (card: InstanceId, from: "hand" | "void" = "void"): Action => ({ kind: "play", card, from });
const queued = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerQueued");
const gains = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "sparkGained");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out;
}
function settle(first: { state: BattleState; events: readonly EngineEvent[] }, before: BattleState, source = new ScriptedSource([])) {
  const rest = passUntil(E, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  const events = [...first.events, ...rest.events];
  source.assertExhausted();
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  expect(redactionViolations(rest.state, E.catalog)).toEqual([]);
  expect(eventRedactionViolations(events, before, rest.state)).toEqual([]);
  return { state: rest.state, events };
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  return settle(E.apply(state, side, action, source), state, source);
}
function saved(state: BattleState) {
  const loaded = deserializeState(JSON.stringify(state));
  expect(stateHash(loaded)).toBe(stateHash(state));
  for (const viewer of ["player", "enemy"] as const) expect(E.view(loaded, viewer)).toEqual(E.view(state, viewer));
  return loaded;
}

describe.each(["player", "enemy"] as const)("pair 294 permanent Aspects for %s", side => {
  const other = opponent(side);
  it("activates the exact permanent emblem, pays two energy, exhausts it and resets at Ending", () => {
    const w = setup(side, DISSOLVER, { back: [v.vanilla2.id] }, { back: [v.vanilla2.id, v.vanilla3.id] });
    const victim = w.ids[other].back[0]!;
    const first = E.apply(w.state, side, activate(side), NO_PROMPTS);
    expect(first.state.sides[side].avatar).toEqual({ id: DISSOLVER, exhausted: true });
    expect(first.state.sides[side].currentEnergy).toBe(6);
    expect(first.events).toContainEqual({ kind: "avatarExhaustionChanged", side, exhausted: true });
    expect(first.events).toContainEqual({ kind: "abilityActivated", side, source: emblem(side), ability: 0 });
    expect(first.state.stack).toEqual([expect.objectContaining({ kind: "ability", source: emblem(side), origin: { kind: "avatar", id: DISSOLVER }, controller: side })]);
    const done = settle(first, w.state);
    expect(done.state.instances[victim]?.zone).toBe("void");
    expect(done.state.instances[w.ids[side].back[0]!].zone).toBe("play");
    expect(E.legalActions(done.state, side)).not.toContainEqual(activate(side));
    const next = passUntil(E, done.state, at(E, other, "day")).state;
    expect(next.sides[side].avatar?.exhausted).toBe(false);
    for (const viewer of [side, other]) expect(E.view(done.state, viewer).sides[side].avatar).toEqual({ id: DISSOLVER, exhausted: true });
  });

  it("targets current enemy effective spark at the boundary and honors Veil", () => {
    const w = setup(side, DISSOLVER, {}, { back: [C.protected.id] });
    const protectedId = w.ids[other].back[0]!;
    const blocked = act(w.state, side, activate(side));
    expect(blocked.state.instances[protectedId]?.zone).toBe("play");
    expect(E.view(blocked.state, side).instances[protectedId]?.characteristics.keywords).not.toContain("veil");
    const next = passUntil(E, passUntil(E, blocked.state, at(E, other, "day")).state, at(E, side, "day")).state;
    const dissolved = act(next, side, activate(side));
    expect(dissolved.state.instances[protectedId]?.zone).toBe("void");
    const changed = setup(side, DISSOLVER, {}, { hand: [{ cardId: v.vanilla3.id, amplified: true, deckMods: { ...NO_DECK_MODS, sparkBonus: -1 } }] });
    const opponentDay = passUntil(E, changed.state, at(E, other, "day")).state;
    const enemy = act(opponentDay, other, play(changed.ids[other].hand[0], "hand")).state;
    const ownDay = passUntil(E, enemy, at(E, side, "day")).state;
    expect(effectiveSpark(ownDay, E.catalog, changed.ids[other].hand[0])).toBe(2);
    expect(act(ownDay, side, activate(side)).state.instances[changed.ids[other].hand[0]]?.zone).toBe("void");
  });

  it("refuses insufficient energy, foreign source, and absence of eligible enemy targets atomically", () => {
    for (const [energyLeft, enemy] of [[1, v.vanilla2.id], [8, v.vanilla3.id]] as const) {
      const w = setup(side, DISSOLVER, { energy: energyLeft, back: [v.vanilla2.id] }, { back: [enemy] });
      const hash = stateHash(w.state);
      expect(E.legalActions(w.state, side)).not.toContainEqual(activate(side));
      expect(() => E.apply(w.state, side, activate(side), NO_PROMPTS)).toThrow(IllegalAction);
      expect(() => E.apply(w.state, side, activate(other), NO_PROMPTS)).toThrow(IllegalAction);
      expect(stateHash(w.state)).toBe(hash);
      expect(w.state.sides[side].avatar?.exhausted).toBe(false);
    }
  });

  it("reloads, cancels and retries a real emblem target prompt without spending payment", () => {
    const w = setup(side, DISSOLVER, { back: [v.vanilla1.id] }, { back: [v.vanilla1.id, v.vanilla2.id] });
    const targetId = w.ids[other].back[1]!;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: activate(side) }));
    const persisted = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(persisted)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", cancellable: true });
    expect(stateHash(persisted.committed)).toBe(stateHash(w.state));
    expect(fresh.reduce(persisted, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(persisted, { kind: "answer", side: other, promptId: pending.prompt.id, value: [targetId] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(persisted, { kind: "answer", side, promptId: parsePromptId("0:0:0"), value: [targetId] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(persisted, { kind: "answer", side, promptId: pending.prompt.id, value: [w.ids[side].back[0]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(fresh.reduce(persisted, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(w.state));
    const retry = applied(fresh.reduce(cancelled.slice, { kind: "battleAction", side, action: activate(side) }));
    const current = fresh.pending(retry.slice)!;
    expect(current.prompt.id).not.toBe(pending.prompt.id);
    const answered = applied(fresh.reduce(retry.slice, { kind: "answer", side, promptId: current.prompt.id, value: [targetId] }));
    const done = settle({ state: answered.slice.committed, events: [...opened.published, ...answered.published] }, w.state);
    const inline = act(w.state, side, activate(side), [[targetId]]);
    expect(stateHash(done.state)).toBe(stateHash(inline.state));
    expect(done.events).toEqual(inline.events);
    expect(fresh.reduce(answered.slice, { kind: "answer", side, promptId: current.prompt.id, value: [targetId] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("gains on the first physical Reclaim stack subject before materialization, then resets next turn", () => {
    const w = setup(side, RECLAIMER, { void: [C.subject.id, C.subject.id, C.subject.id], back: [C.subject.id] });
    const [firstId, secondId, thirdId] = w.ids[side].void;
    const first = E.apply(w.state, side, play(firstId), NO_PROMPTS);
    expect(first.state.instances[firstId]?.zone).toBe("stack");
    expect(gains(first.events)).toEqual([{ kind: "sparkGained", instance: firstId, amount: 1, expiry: { at: "never" }, additional: false }]);
    expect(queued(first.events)).toEqual([expect.objectContaining({ source: emblem(side), controller: side, subject: firstId })]);
    expect(effectiveSpark(first.state, E.catalog, firstId)).toBe(3);
    expect(first.state.sides[side].currentEnergy).toBe(6);
    expect(copiableCostOf(first.state, E.catalog, firstId)).toBe(3);
    expect(routeCosts(first.state, E.catalog, firstId, "reclaim")).toEqual([energy(2)]);
    for (const viewer of [side, other]) expect(eventSeenBy(gains(first.events)[0], viewer, first.state)).toEqual(gains(first.events)[0]);
    const landed = settle(first, w.state).state;
    expect(landed.instances[firstId]?.zone).toBe("play");
    expect(effectiveSpark(landed, E.catalog, w.ids[side].back[0]!)).toBe(2);
    const second = act(landed, side, play(secondId));
    expect(gains(second.events)).toEqual([]);
    expect(effectiveSpark(second.state, E.catalog, secondId)).toBe(2);
    const next = passUntil(E, passUntil(E, second.state, at(E, other, "day")).state, at(E, side, "day")).state;
    expect(gains(act(next, side, play(thirdId)).events)).toEqual([expect.objectContaining({ instance: thirdId, amount: 1 })]);
    expect(stateHash(settle(E.apply(saved(w.state), side, play(firstId), NO_PROMPTS), w.state).state)).toBe(stateHash(landed));
  });

  it("excludes hand plays and events, and follows effective character type at announcement", () => {
    const w = setup(side, RECLAIMER, { hand: [C.subject.id], void: [C.event.id, C.subject.id] });
    const hand = act(w.state, side, play(w.ids[side].hand[0], "hand"));
    expect(gains(hand.events)).toEqual([]);
    const eventPlay = act(hand.state, side, play(w.ids[side].void[0]));
    expect(gains(eventPlay.events)).toEqual([]);
    expect(eventPlay.state.instances[w.ids[side].void[0]]?.zone).toBe("banished");
    expect(gains(act(eventPlay.state, side, play(w.ids[side].void[1])).events)).toHaveLength(1);
    for (const character of [false, true]) {
      const changed = setup(side, RECLAIMER, { back: [v.discardOne.id], hand: [{ cardId: character ? C.event.id : C.subject.id, amplified: true,
        deckMods: { ...NO_DECK_MODS, typeChange: { cardType: character ? "character" : "event", subtype: character ? "Mage" : "" }, sparkBonus: 4 } }] });
      // Move the variant into the void through an actual discard, then reclaim it.
      const instance = changed.ids[side].hand[0];
      const discarded = act(changed.state, side, { kind: "activate", source: changed.ids[side].back[0]!, ability: 0 });
      expect(discarded.state.instances[instance]?.zone).toBe("void");
      const done = act(discarded.state, side, play(instance));
      expect(gains(done.events)).toHaveLength(character ? 1 : 0);
      expect(done.state.instances[instance]?.status.gainedSpark).toBe(character ? 1 : 0);
    }
  });

  it("uses the opposing permanent emblem for a real Interrupt Reclaim response", () => {
    const w = setup(side, RECLAIMER, { void: [C.subject.id] }, { void: [C.response.id] });
    const firstId = w.ids[side].void[0], responseId = w.ids[other].void[0];
    const played = E.apply(w.state, side, play(firstId), NO_PROMPTS);
    expect(E.decision(played.state)).toEqual({ kind: "respond", side: other });
    const response = E.apply(played.state, other, play(responseId), NO_PROMPTS);
    expect(queued(response.events)).toEqual([expect.objectContaining({ source: emblem(other), controller: other, subject: responseId })]);
    expect(gains(response.events)).toEqual([expect.objectContaining({ instance: responseId, amount: 1 })]);
    const done = settle(response, played.state);
    expect(effectiveSpark(done.state, E.catalog, firstId)).toBe(3);
    expect(effectiveSpark(done.state, E.catalog, responseId)).toBe(3);
    expect(done.state.sides[other].currentEnergy).toBe(7);
  });

  it("retains physical gain through Reclaim banishment and both public save views", () => {
    const w = setup(side, RECLAIMER, { void: [C.subject.id] }, { hand: [C.dissolve.id] });
    const id = w.ids[side].void[0];
    const played = act(w.state, side, play(id));
    const next = passUntil(E, played.state, at(E, other, "day")).state;
    const banished = act(next, other, play(w.ids[other].hand[0], "hand"));
    expect(banished.state.instances[id]?.zone).toBe("banished");
    expect(effectiveSpark(banished.state, E.catalog, id)).toBe(3);
    for (const viewer of [side, other]) expect(E.view(saved(banished.state), viewer).instances[id]?.status.gainedSpark).toBe(1);
  });

  it("respects normal capacity, rejects another Reclaim and leaves RNG unchanged", () => {
    const w = setup(side, RECLAIMER, { back: Array.from({ length: 9 }, () => v.vanilla1.id), void: [C.subject.id, C.subject.id] });
    const first = act(w.state, side, play(w.ids[side].void[0]));
    expect(first.state.sides[side].backRank.filter(Boolean)).toHaveLength(10);
    expect(first.state.rng).toEqual(w.state.rng);
    const hash = stateHash(first.state);
    expect(() => E.apply(first.state, side, play(w.ids[side].void[1]), NO_PROMPTS)).toThrow(IllegalAction);
    expect(stateHash(first.state)).toBe(hash);
    expect(first.state.instances[w.ids[side].void[1]]?.status.gainedSpark).toBe(0);
  });

  it("cancels a real Reclaim cost prompt without consuming the emblem and replays its payment", () => {
    const w = setup(side, RECLAIMER, { void: [C.cost.id], hand: [v.event0.id, v.event1.id] });
    const id = w.ids[side].void[0], payment = w.ids[side].hand[1];
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: play(id) }));
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const persisted = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const pending = fresh.pending(persisted)!;
    expect(pending.prompt.cancellable).toBe(true);
    expect(persisted.committed.oncePerTurn).toEqual([]);
    const cancelled = applied(fresh.reduce(persisted, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(w.state));
    const retry = applied(fresh.reduce(cancelled.slice, { kind: "battleAction", side, action: play(id) }));
    const current = fresh.pending(retry.slice)!;
    const done = applied(fresh.reduce(retry.slice, { kind: "answer", side, promptId: current.prompt.id, value: [payment] }));
    const settled = settle({ state: done.slice.committed, events: done.published }, w.state);
    expect(settled.state.sides[side].currentEnergy).toBe(7);
    expect(settled.state.instances[payment]?.zone).toBe("void");
    expect(gains(settled.events)).toEqual([expect.objectContaining({ instance: id, amount: 1 })]);
    expect(stateHash(settled.state)).toBe(stateHash(act(w.state, side, play(id), [[payment]]).state));
  });

  it("refuses cancellation after materialization, reloads its real optional prompt and preserves gain", () => {
    const w = setup(side, RECLAIMER, { void: [C.interactive.id] }, { hand: [] });
    const id = w.ids[side].void[0];
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: play(id) }));
    const persisted = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(persisted)!;
    expect(pending.prompt.cancellable).toBe(false);
    expect(persisted.committed.instances[id]?.zone).toBe("play");
    expect(persisted.committed.instances[id]?.status.gainedSpark).toBe(1);
    expect(fresh.reduce(persisted, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const done = applied(fresh.reduce(persisted, { kind: "answer", side, promptId: pending.prompt.id, value: true }));
    expect(done.slice.committed.sides[side].score).toBe(1);
    const inline = act(w.state, side, play(id), [true]);
    expect([...opened.published, ...done.published]).toEqual(inline.events);
    expect(stateHash(done.slice.committed)).toBe(stateHash(inline.state));
    expect(gains([...opened.published, ...done.published])).toHaveLength(1);
  });

  it("rolls back a later failing resolve while retaining the already committed physical trigger gain", () => {
    const w = setup(side, RECLAIMER, { void: [C.failure.id] }, { hand: [] });
    const id = w.ids[side].void[0];
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const failed = fold.reduce(slice(w.state), { kind: "battleAction", side, action: play(id) });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected synthetic later resolve failure");
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed.instances[id]?.zone).toBe("stack");
    expect(failed.slice.committed.instances[id]?.status.gainedSpark).toBe(1);
    expect(gains(failed.published)).toEqual([expect.objectContaining({ instance: id, amount: 1 })]);
    expect(failed.published.filter(e => e.kind === "resolved")).toEqual([]);
    expect(stateHash(saved(failed.slice.committed))).toBe(stateHash(failed.slice.committed));
    // The deliberately broken resolver has no legal continuation; replay the saved healthy action boundary.
    const repeated = createFoldAdapter(E, { checkEventPrefix: true }).reduce(slice(saved(w.state)),
      { kind: "battleAction", side, action: play(id) });
    if (repeated.kind !== "applied" || repeated.error === null) throw new Error("expected repeat synthetic failure");
    expect(stateHash(repeated.slice.committed)).toBe(stateHash(failed.slice.committed));
    expect(repeated.published).toEqual(failed.published);
  });
});
