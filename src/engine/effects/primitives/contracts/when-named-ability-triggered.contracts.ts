/** Successful exact named admissions, whole batches, privacy and terminal recovery. */
import { describe, expect, it } from "vitest";
import type { EmblemDefinitions, EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, conditionCardCounts, discardCost, everyIn, self, staticAbility } from "../../../dsl/builders";
import { either, onDawn, onMaterialized, triggered, whenHandBecomesEmpty, whenMaterialize, whenNamedAbilityTriggered } from "../../../dsl/triggers";
import type { Trigger } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords } from "../../../log";
import { oncePerTurnKey } from "../../../rules/activation";
import { stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { identifies } from "../../../view/knowledge";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseAvatarId, parseDreamsignId, parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import * as p from "../index";

const card = (index: number, abilities: EngineCardDefinition["abilities"], subtype: EngineCardDefinition["subtype"] = "Warrior"): EngineCardDefinition =>
  ({ ...v.vanilla1, id: syntheticId(0x711000 + index), abilities, subtype });
const mages = all(characterYouControl({ subtype: "Mage" }));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
function world(side: Side, cards: readonly EngineCardDefinition[], own: SideSetup, other: SideSetup = {}, emblems: EmblemDefinitions = {}) {
  const engine = createEngine(testCatalog(cards, emblems));
  return { engine, side, ...boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { deck, energy: 8, ...own }, [opponent(side)]: { deck, energy: 8, ...other } }) };
}
type World = ReturnType<typeof world>;
function step(w: World, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const out = runStep(state, action, source, w.engine.catalog);
  if (out.kind !== "done") throw new Error("Unexpected suspension");
  if (source instanceof ScriptedSource) source.assertExhausted();
  return out;
}
function activate(w: World, source: InstanceId, ability = 0) {
  const cast = step(w, w.state, { kind: "activate", source, ability });
  return step(w, cast.state, { kind: "resolveTop" });
}
function drain(w: World, start: BattleState) {
  let state = start;
  for (let n = 0; state.triggerQueue.length > 0 && state.result === null; n++) {
    if (n >= 40) throw new Error("Fixture did not drain");
    state = step(w, state, { kind: "resolveTrigger" }).state;
  }
  return state;
}
const queued = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerQueued");
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out;
}
function reload(slice: BattleSlice) {
  const loaded = parseJourneyBattleFoldState({ mode: { kind: "journey" }, init: {
    battleId: parseBattleId("named-admission"), siteId: parseSiteId("named-admission"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("named-admission"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } });
  if (loaded === null) throw new Error("Saved admission rejected");
  return loaded.engine.slice;
}
const root = card(0, () => [triggered(onMaterialized(), p.gainEnergy(1)), triggered(onMaterialized(), p.gainEnergy(2))], "Mage");
const watch = card(1, () => [triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(1))]);
const otherWatch = card(2, () => [triggered(whenNamedAbilityTriggered("materialized", "opponent"), p.gainPoints(1))]);
const force = card(3, () => [activated([], p.triggerAbility(mages, "materialized"))]);

describe("whenNamedAbilityTriggered", () => {
  it.each(SIDES)("observes actual %s occurrences, not ordinary materialization, with a null card subject", side => {
    for (const count of [0, 1, 2]) {
      const source = card(4, () => root.abilities({ amplified: false }).slice(0, count), "Mage");
      const enter = card(5, () => [activated([], p.rematerialize(mages))]);
      const w = world(side, [source, watch, otherWatch, enter], { back: [source.id, watch.id, enter.id] }, { back: [otherWatch.id] });
      const out = activate(w, w.ids[side].back[2]!);
      const observers = queued(out.events).filter(e => e.source !== w.ids[side].back[0]);
      expect(observers).toHaveLength(count * 2);
      expect(observers.every(e => e.subject === null)).toBe(true);
      const done = drain(w, out.state);
      expect(done.sides[side].score).toBe(count);
      expect(done.sides[opponent(side)].score).toBe(count);
      expect(done.sides[side].currentEnergy).toBe(w.state.sides[side].currentEnergy + (count === 2 ? 3 : count));
    }
  });

  it.each(SIDES)("excludes failed, spent, disabled and wrong-zone %s candidates", side => {
    const source = card(6, () => [triggered(onMaterialized(), p.gainEnergy(1), { condition: { cond: "energyAtLeast", amount: 99 } }),
      triggered(onMaterialized(), p.gainEnergy(2), { oncePerTurn: true }), triggered(onMaterialized(), p.gainEnergy(4), { zone: "void" })], "Mage");
    const disabled = card(7, () => [triggered(onMaterialized(), p.gainEnergy(8))], "Mage");
    const starter = card(8, () => [activated([], p.sequence(p.disableTriggers(mages, "untilEndOfTurn"), p.triggerAbility(mages, "materialized")))]);
    const w = world(side, [source, disabled, watch, force, starter], { back: [source.id, watch.id, force.id, starter.id] });
    w.state.oncePerTurn.push(oncePerTurnKey(w.ids[side].back[0]!, 1));
    expect(queued(activate(w, w.ids[side].back[2]!).events)).toEqual([]);
    const control = world(side, [disabled, watch, force, starter], { back: [disabled.id, watch.id, force.id, starter.id] });
    expect(drain(control, activate(control, control.ids[side].back[2]!).state).sides[side].score).toBe(1);
    expect(queued(activate(control, control.ids[side].back[3]!).events)).toEqual([]);
  });

  it.each(SIDES)("applies %s observer eligibility and keeps an admitted occurrence after source loss", side => {
    const observers = card(39, () => [triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(1), { oncePerTurn: true }),
      triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(10), { condition: { cond: "energyAtLeast", amount: 99 } }),
      triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(100), { zone: "void" })]);
    const remove = card(40, () => [activated([], p.sequence(p.triggerAbility(mages, "materialized"), p.loseAllAbilities(mages), p.dissolve(mages)))]);
    const w = world(side, [root, observers, remove], { back: [root.id, observers.id, remove.id] });
    const out = activate(w, w.ids[side].back[2]!);
    expect(out.state.instances[w.ids[side].back[0]!]?.zone).toBe("void");
    expect(out.state.triggerQueue).toHaveLength(3);
    const loaded = reload(sliceOf(out.state)), done = drain(w, loaded.committed);
    expect(done.sides[side].currentEnergy).toBe(11);
    expect(done.sides[side].score).toBe(1);
    const disable = card(41, () => [activated([], p.sequence(p.disableTriggers(all(characterYouControl({ subtype: "Warrior" })), "untilEndOfTurn"), p.triggerAbility(mages, "materialized")))]);
    const blocked = world(side, [root, watch, disable], { back: [root.id, watch.id, disable.id] });
    expect(drain(blocked, activate(blocked, blocked.ids[side].back[2]!).state).sides[side].score).toBe(0);
  });

  it.each(SIDES)("batches all explicit %s sources and preserves independent identical instructions", side => {
    const twice = card(9, () => [activated([], p.sequence(p.triggerAbility(mages, "materialized"), p.triggerAbility(mages, "materialized")))]);
    const w = world(side, [root, watch, twice], { back: [root.id, root.id, watch.id, watch.id, twice.id] });
    const out = activate(w, w.ids[side].back[4]!);
    const ids = w.ids[side].back;
    expect(queued(out.events).map(e => e.source)).toEqual([ids[0], ids[0], ids[1], ids[1], ...Array.from({ length: 4 }, () => [ids[2], ids[3]]).flat(),
      ids[0], ids[0], ids[1], ids[1], ...Array.from({ length: 4 }, () => [ids[2], ids[3]]).flat()]);
    expect(out.state.result).toBeNull();
    expect(drain(w, out.state).sides[side].score).toBe(16);
    expect(eventLogRecords(out.events, out.state.version).filter(r => r.event === "engine.trigger")).toHaveLength(24);
  });

  it.each(SIDES)("keeps named-bearing either, floating and delayed %s admissions distinct", side => {
    const combined: Trigger = either(onDawn(), whenMaterialize());
    const observe = card(10, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const starter = card(11, () => [activated([], p.sequence(p.floating(combined, p.gainEnergy(1)), p.delayed(combined, p.gainEnergy(2)),
      p.rematerialize(mages), p.rematerialize(mages)))]);
    const plain = card(12, () => [], "Mage");
    const w = world(side, [observe, starter, plain], { back: [plain.id, observe.id, starter.id] });
    const out = activate(w, w.ids[side].back[2]!);
    const causes = queued(out.events).filter(e => e.source === w.ids[side].back[2]);
    expect(causes).toHaveLength(3);
    expect(new Set(causes.map(e => e.node)).size).toBe(2);
    expect(out.state.floating.filter(e => e.change.kind === "trigger")).toHaveLength(1);
    expect(drain(w, out.state).sides[side].score).toBe(3);
  });

  it.each(SIDES)("keeps %s Dawn threshold reactions after all siblings and before named observers", side => {
    const source = card(13, () => [triggered(onDawn(), p.gainEnergy(1))]);
    const threshold = card(14, () => [staticAbility(p.ruleModifier({ rule: "dawnThreshold", count: 3, effect: p.draw(1) }))]);
    const observer = card(15, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const w = world(side, [source, threshold, observer], { back: [source.id, source.id, source.id, threshold.id, observer.id] });
    const out = step(w, { ...w.state, turn: { ...w.state.turn, phase: "draw" } }, { kind: "advancePhase" });
    expect(out.state.triggerQueue.map(t => t.kind ?? "ordinary")).toEqual(["ordinary", "ordinary", "ordinary", "ruleReaction", "ordinary", "ordinary", "ordinary"]);
    expect(queued(out.events).slice(0, 3).map(e => e.source)).toEqual(w.ids[side].back.slice(0, 3));
    expect(drain(w, out.state).sides[side].hand).toHaveLength(1);
    expect(drain(w, out.state).sides[side].score).toBe(3);
  });

  it.each(SIDES)("queues a later genuine %s named instruction from an observer body", side => {
    const observer = card(16, () => [triggered(whenNamedAbilityTriggered("materialized"), p.triggerAbility(mages, "dawn"))]);
    const source = card(17, () => [triggered(onMaterialized(), p.gainEnergy(1)), triggered(onDawn(), p.gainEnergy(2))], "Mage");
    const w = world(side, [source, observer, force], { back: [source.id, observer.id, force.id] });
    const out = activate(w, w.ids[side].back[2]!);
    expect(out.state.triggerQueue.map(t => t.ability)).toEqual([0, 0]);
    expect(drain(w, out.state).sides[side].currentEnergy).toBe(11);
  });

  it.each(SIDES.flatMap(side => [false, true].map(limited => ({ side, limited }))))("proves admission-only cycles for $side with limiter=$limited", ({ side, limited }) => {
    const cycle = card(18, () => [triggered(either(onMaterialized(), whenNamedAbilityTriggered("materialized")), p.optional(p.draw(1)), { oncePerTurn: limited })], "Mage");
    const starter = card(19, () => [activated([], p.sequence(p.triggerAbility(mages, "materialized"), p.optional(p.draw(1)), p.gainPoints(7)))]);
    const w = world(side, [cycle, starter], { back: [cycle.id, starter.id] });
    const cast = step(w, w.state, { kind: "activate", source: w.ids[side].back[1]!, ability: 0 });
    const out = step(w, cast.state, { kind: "resolveTop" }, limited ? [false] : []);
    if (limited) {
      expect(out.state.result).toBeNull();
      expect(out.state.sides[side].score).toBe(7);
      expect(out.state.triggerQueue).toHaveLength(1);
    } else {
      expect(out.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
      expect(out.state.sides[side].score).toBe(0);
      expect(out.state.sides[side].hand).toHaveLength(0);
      expect(out.events[out.events.length - 1]?.kind).toBe("battleEnded");
      expect(out.answers).toEqual([]);
      expect(reload(sliceOf(out.state)).committed).toEqual(out.state);
    }
  });

  it.each(SIDES)("terminates %s one-shot cycles and preserves their selected node", side => {
    const descriptor = either(onMaterialized(), whenNamedAbilityTriggered("materialized"));
    const starter = card(20, () => [activated([], p.sequence(p.delayed(descriptor, p.gainEnergy(1)), p.triggerAbility(mages, "materialized")))]);
    const w = world(side, [root, starter], { back: [root.id, starter.id] });
    const out = activate(w, w.ids[side].back[1]!);
    expect(out.state.result).toBeNull();
    expect(out.state.triggerQueue.filter(t => t.node !== null)).toHaveLength(1);
    expect(out.state.floating.filter(e => e.change.kind === "trigger")).toHaveLength(0);
    expect(drain(w, out.state).sides[side].currentEnergy).toBe(12);
  });

  it.each(SIDES)("retains a terminal %s draw inside a real optional loop with unused recorded answers", side => {
    const source = card(21, () => [activated([], p.sequence(p.gainEnergy(1), p.triggerAbility(self(), "materialized"), p.optional(p.sequence()))),
      triggered(either(onMaterialized(), whenNamedAbilityTriggered("materialized")), p.sequence(), { condition: { cond: "energyAtLeast", amount: 3 } })]);
    const w = world(side, [source], { back: [source.id], energy: 0 });
    const first = w.engine.apply(w.state, side, { kind: "activate", source: w.ids[side].back[0]!, ability: 0 }, new ScriptedSource([true]));
    expect(first.state.sides[side].currentEnergy).toBe(1);
    const action = w.engine.legalActions(first.state, side).find(a => a.kind === "repeatLoop");
    if (action?.kind !== "repeatLoop") throw new Error("No actual optional loop offered");
    const out = w.engine.apply(first.state, side, { ...action, count: 3 }, NO_PROMPTS);
    expect(out.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(out.state.sides[side].currentEnergy).toBe(3);
    expect(out.events.filter(e => e.kind === "loopEnded").map(e => e.reason)).toEqual(["battleEnded"]);
    expect(out.events.slice(out.events.findIndex(e => e.kind === "battleEnded") + 1).map(e => e.kind)).toEqual(["loopEnded"]);
  });

  it.each(SIDES.flatMap(side => [false, true].map(limited => ({ side, limited }))))("retains an unseen terminal top for $side limiter=$limited", ({ side, limited }) => {
    const source = card(22, () => [activated([discardCost(1)], p.gainPoints(7)),
      triggered(either(onMaterialized(), whenHandBecomesEmpty(), whenNamedAbilityTriggered("materialized")), p.sequence(), { oncePerTurn: limited }),
      staticAbility(p.revealDeckTop(), { while: conditionCardCounts("hand", 0, { atMost: 0 }) })]);
    const w = world(side, [source], { back: [source.id], hand: [v.vanilla1.id] });
    const top = w.ids[side].deck[0];
    expect(identifies(w.state, top, opponent(side))).toBe(false);
    const out = step(w, w.state, { kind: "activate", source: w.ids[side].back[0]!, ability: 0 });
    expect(out.state.sides[side].hand).toHaveLength(0);
    expect(identifies(out.state, top, opponent(side))).toBe(limited);
    expect(out.events.some(e => e.kind === "revealed" && e.instances.includes(top))).toBe(limited);
    expect(out.state.result).toEqual(limited ? null : { kind: "draw", reason: "mandatoryLoop" });
  });


  it.each(SIDES.flatMap(side => (["hand", "deck"] as const).map(zone => ({ side, zone }))))("keeps hidden named sources subjectless for $side/$zone", ({ side, zone }) => {
    const secret = card(23, () => [triggered(either(onDawn(), whenMaterialize()), p.sequence(), { zone: "any" })]);
    const observer = card(24, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const plain = card(25, () => [], "Mage");
    const starter = card(26, () => [activated([], p.rematerialize(mages))]);
    const w = world(side, [secret, observer, plain, starter], { back: [plain.id, observer.id, starter.id],
      ...(zone === "hand" ? { hand: [secret.id] } : { deck: [secret.id, ...deck] }) });
    const id = w.ids[side][zone][0], out = activate(w, w.ids[side].back[2]!);
    const original = queued(out.events).find(e => e.source === id);
    if (original === undefined) throw new Error("Missing genuine private admission");
    const observed = queued(out.events).find(e => e.source === w.ids[side].back[1]);
    expect(observed).toMatchObject({ subject: null });
    const lists = Object.fromEntries(SIDES.map(owner => [owner, Object.values(w.state.instances).flatMap(i =>
      i.owner === owner && i.printing.kind === "card" ? [{ cardId: i.printing.cardId }] : [])])) as { player: { cardId: typeof secret.id }[]; enemy: { cardId: typeof secret.id }[] };
    for (const viewer of zone === "deck" ? SIDES : [opponent(side)]) {
      expect(identifies(w.state, id, viewer)).toBe(false);
      expect(eventSeenBy(original, viewer, out.state)).toEqual(viewer === side ? { ...original, source: null } : null);
      const shown = w.engine.view(out.state, viewer);
      const seen = JSON.stringify([out.events.map(e => eventSeenBy(e, viewer, out.state)), shown]);
      expect(seen.includes(`"${id}"`)).toBe(false);
      expect(seen.includes(secret.id)).toBe(false);
      expect(comparableView(w.engine.view(w.engine.determinize(shown, lists, () => 0.2), viewer))).toEqual(comparableView(shown));
    }
    expect(drain(w, out.state).sides[side].score).toBe(1);
  });

  it.each(SIDES)("round-trips %s pending observers and rejects stale competing continuations", side => {
    const observer = card(27, () => [triggered(whenNamedAbilityTriggered("materialized"), p.optional(p.draw(1)))]);
    const single = card(28, () => [triggered(onMaterialized(), p.gainEnergy(1))], "Mage");
    const w = world(side, [single, observer, force], { back: [single.id, observer.id, force.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    const pending = fold.pending(opened.slice);
    if (pending?.prompt.kind !== "confirm") throw new Error("Missing actual observer prompt");
    const loaded = reload(opened.slice), before = stateHash(loaded.committed);
    expect(fold.pending(loaded)?.prompt).toEqual(pending.prompt);
    expect(fold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    for (const value of [false, true]) {
      const intent = { kind: "answer", side, promptId: pending.prompt.id, value } as const;
      const direct = applied(fold.reduce(opened.slice, intent)), restored = applied(createFoldAdapter(w.engine).reduce(loaded, intent));
      expect(stateHash(direct.slice.committed)).toBe(stateHash(restored.slice.committed));
      expect(direct.published).toEqual(restored.published);
      expect(direct.slice.committed.sides[side].hand).toHaveLength(value ? 1 : 0);
      expect(fold.reduce(restored.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    }
    expect(stateHash(loaded.committed)).toBe(before);
  });

  it.each(SIDES)("rolls back %s admission writes on a later genuine primitive failure", side => {
    const fail = card(29, () => [activated([], p.sequence(p.gainEnergy(2), p.triggerAbility(mages, "materialized"),
      p.materializeFigments(parseFigmentId("00000000-0000-4000-8000-000000711999"))))]);
    const single = card(30, () => [triggered(onMaterialized(), p.gainEnergy(1), { oncePerTurn: true })], "Mage");
    const w = world(side, [single, fail, watch], { back: [single.id, fail.id, watch.id] });
    const cast = step(w, w.state, { kind: "activate", source: w.ids[side].back[1]!, ability: 0 });
    const before = stateHash(cast.state), fold = createFoldAdapter(w.engine);
    const loaded = reload({ ...sliceOf(cast.state), inFlight: { step: { kind: "resolveTop" }, automatic: true, answers: [] } });
    const failed = fold.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } });
    expect(failed).toMatchObject({ kind: "applied", error: { kind: "engine_error" } });
    if (failed.kind !== "applied") throw new Error("No recovered failure");
    expect(stateHash(failed.slice.committed)).toBe(before);
    expect(failed.slice.inFlight).toBeNull();
    expect(stateHash(cast.state)).toBe(before);
  });

  it.each(SIDES)("keeps independent %s roots that converge on the same named observer distinct", side => {
    const bridge = card(32, () => [triggered(either(onDawn(), whenNamedAbilityTriggered("materialized")), p.sequence())]);
    const final = card(33, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const w = world(side, [root, bridge, final, force], { back: [root.id, bridge.id, final.id, force.id] });
    const out = activate(w, w.ids[side].back[3]!);
    expect(out.state.result).toBeNull();
    expect(queued(out.events).map(e => e.source)).toEqual([w.ids[side].back[0], w.ids[side].back[0],
      w.ids[side].back[1], w.ids[side].back[1], w.ids[side].back[2], w.ids[side].back[2]]);
    expect(drain(w, out.state).sides[side].score).toBe(2);
  });

  it.each(SIDES.flatMap(side => [false, true].map(limited => ({ side, limited }))))("handles two-controller causal cycles for $side limiter=$limited", ({ side, limited }) => {
    const a = card(34, () => [triggered(either(onMaterialized(), whenNamedAbilityTriggered("materialized", "opponent")), p.gainEnergy(1))], "Mage");
    const b = card(35, () => [triggered(either(onMaterialized(), whenNamedAbilityTriggered("materialized", "opponent")), p.gainPoints(1), { oncePerTurn: limited })]);
    const w = world(side, [a, b, force], { back: [a.id, force.id] }, { back: [b.id] });
    const out = activate(w, w.ids[side].back[1]!);
    expect(out.state.result).toEqual(limited ? null : { kind: "draw", reason: "mandatoryLoop" });
    if (limited) {
      const done = drain(w, out.state);
      expect(done.sides[side].currentEnergy).toBe(10);
      expect(done.sides[opponent(side)].score).toBe(1);
    }
  });

  it.each(SIDES)("retains the original %s floating captured cohort across observer admission and reload", side => {
    const plain = card(36, () => [], "Mage");
    const observer = card(37, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const starter = card(38, () => [activated([], p.sequence(p.withMaterialized(p.materialize(everyIn("void", { subtype: "Mage" })),
      p.floating(either(onDawn(), whenMaterialize()), p.banishCards([p.capturedCards()]))), p.rematerialize(mages)))]);
    const w = world(side, [plain, observer, starter], { back: [observer.id, starter.id], void: [plain.id] });
    const out = activate(w, w.ids[side].back[1]!), member = w.ids[side].void[0];
    expect(out.state.triggerQueue[0]?.captured).toEqual([member]);
    const loaded = reload(sliceOf(out.state));
    expect(loaded.committed.triggerQueue).toEqual(out.state.triggerQueue);
    const done = drain(w, loaded.committed);
    expect(done.instances[member]?.zone).toBe("banished");
    expect(done.sides[side].score).toBe(1);
  });

  it.each(SIDES)("orders each %s admitted occasion's observers by avatar, dreamsign and card", side => {
    const ability = () => [triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(1))];
    const avatar = { id: parseAvatarId("00000000-0000-4000-8000-000000711001"), status: "authored" as const, abilities: ability };
    const sign = { id: parseDreamsignId("00000000-0000-4000-8000-000000711002"), status: "authored" as const, abilities: ability };
    const w = world(side, [root, watch, force], { back: [root.id, watch.id, force.id], avatar: avatar.id, dreamsigns: [sign.id] }, {}, { avatars: [avatar], dreamsigns: [sign] });
    const out = activate(w, w.ids[side].back[2]!);
    expect(queued(out.events).map(e => e.source)).toEqual([w.ids[side].back[0], w.ids[side].back[0],
      { kind: "avatar", side }, { kind: "dreamsign", side, index: 0 }, w.ids[side].back[1],
      { kind: "avatar", side }, { kind: "dreamsign", side, index: 0 }, w.ids[side].back[1]]);
    expect(drain(w, out.state).sides[side].score).toBe(6);
  });

  it.each(SIDES)("refreshes %s gained observer presence separately for each causing batch", side => {
    const donor = card(42, () => [triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(1))]);
    const starter = card(43, () => [activated([], p.sequence(p.triggerAbility(mages, "materialized"),
      p.gainAbilities(p.banishCards([everyIn("void")])), p.triggerAbility(mages, "materialized"),
      p.loseAllAbilities(self()), p.triggerAbility(mages, "materialized")))]);
    const w = world(side, [root, donor, starter], { back: [root.id, starter.id], void: [donor.id] });
    const out = activate(w, w.ids[side].back[1]!);
    expect(queued(out.events).filter(e => e.source === w.ids[side].back[1])).toHaveLength(2);
    expect(drain(w, out.state).sides[side].score).toBe(2);
  });

  it.each(SIDES)("retains %s floating observers after their creating source loses its abilities", side => {
    const starter = card(44, () => [activated([], p.sequence(p.floating(whenNamedAbilityTriggered("materialized"), p.gainPoints(1)),
      p.triggerAbility(mages, "materialized"), p.loseAllAbilities(self()), p.triggerAbility(mages, "materialized")))]);
    const w = world(side, [root, starter], { back: [root.id, starter.id] });
    const out = activate(w, w.ids[side].back[1]!);
    expect(out.state.triggerQueue.filter(t => t.node !== null)).toHaveLength(4);
    expect(drain(w, out.state).sides[side].score).toBe(4);
  });

  it.each(SIDES)("keeps a %s one-shot consumed by the causing occasion retired", side => {
    const starter = card(45, () => [activated([], p.sequence(p.delayed(either(onMaterialized(), whenNamedAbilityTriggered("materialized")),
      p.gainPoints(1)), p.rematerialize(mages)))]);
    const w = world(side, [root, starter], { back: [root.id, starter.id] });
    const out = activate(w, w.ids[side].back[1]!);
    expect(out.state.triggerQueue.filter(t => t.node !== null)).toHaveLength(1);
    expect(out.state.floating.filter(e => e.change.kind === "trigger")).toHaveLength(0);
    expect(out.state.result).toBeNull();
    expect(drain(w, out.state).sides[side].score).toBe(1);
  });

  it.each(SIDES)("cancels %s planning before payment without an admission", side => {
    const source = card(31, () => [activated([discardCost(1)], p.triggerAbility(mages, "materialized"))]);
    const w = world(side, [root, watch, source], { back: [root.id, watch.id, source.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const fold = createFoldAdapter(w.engine), before = stateHash(w.state);
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    const pending = fold.pending(opened.slice);
    if (pending === null) throw new Error("No actual cost prompt");
    const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(before);
    expect(queued(cancelled.published)).toEqual([]);
  });

});
