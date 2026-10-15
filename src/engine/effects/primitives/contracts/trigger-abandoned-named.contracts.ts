/** Retained abandonment contracts through public steps, views and saved folds. */
import { describe, expect, it } from "vitest";
import type { Effect } from "../../registry";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, discardCost, energy, everyIn, randomIn, self, triggerSubjectCost } from "../../../dsl/builders";
import { either, onDawn, onDissolved, onMaterialized, triggered, whenAbandon, whenNamedAbilityTriggered } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { cycleHash } from "../../../loops/signature";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import type { BattleState, LinkedBanishedCards } from "../../../state/types";
import { SIDES, opponent, parseFigmentId, type Side, type InstanceId } from "../../../state/ids";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { comparableView } from "../../../testing/determinization-fidelity";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import * as p from "../index";

const card = (n: number, abilities: EngineCardDefinition["abilities"], subtype: EngineCardDefinition["subtype"] = "Warrior"): EngineCardDefinition =>
  ({ ...v.vanilla1, id: syntheticId(0x616000 + n), abilities, subtype });
const mages = all(characterYouControl({ subtype: "Mage" }));
const named = p.triggerAbandonedNamed;
const reader = (n: number, body: Effect = p.sequence(named("materialized"), named("dawn"))) => card(n, () => [triggered(whenAbandon("you", { subtype: "Mage" }), body)]);
const starter = card(0, () => [activated([], p.abandon("you", { subtype: "Mage" }))]);
function world(side: Side, cards: readonly EngineCardDefinition[], own: SideSetup, other: SideSetup = {}) {
  const engine = createEngine(testCatalog(cards));
  return { engine, side, ...boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { deck: [v.vanilla1.id, v.vanilla2.id], energy: 10, ...own },
    [opponent(side)]: { deck: [v.vanilla1.id], energy: 10, ...other } }) };
}
type World = ReturnType<typeof world>;
function step(w: World, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const out = runStep(state, action, answers.length ? new ScriptedSource(answers) : NO_PROMPTS, w.engine.catalog);
  if (out.kind !== "done") throw new Error("Unexpected prompt");
  return out;
}
function activate(w: World, source: InstanceId, ability = 0, state = w.state) {
  const paid = step(w, state, { kind: "activate", source, ability });
  return step(w, paid.state, { kind: "resolveTop" });
}
function drain(w: World, state: BattleState): BattleState {
  for (let i = 0; state.triggerQueue.length; i++) {
    if (i > 60) throw new Error("Unbounded synthetic trigger chain");
    state = step(w, state, { kind: "resolveTrigger" }).state;
  }
  return state;
}
const queued = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "triggerQueued");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out;
}
function saved(value: unknown) {
  return parseJourneyBattleFoldState({ mode: { kind: "journey" }, init: {
    battleId: parseBattleId("abandoned-named"), siteId: parseSiteId("abandoned-named"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("abandoned-named"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(value)) as unknown } })?.engine.slice ?? null;
}
const lists = (w: World) => Object.fromEntries(SIDES.map(side => [side, Object.values(w.state.instances).flatMap(instance => instance.owner === side && instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId }] : [])])) as Record<Side, { cardId: EngineCardDefinition["id"] }[]>;

describe("triggerAbandonedNamed retained origin", () => {
  it.each(SIDES)("retains %s actual variant, named indexes, controller and detached causal payload", side => {
    const target = card(1, variant => [triggered(onMaterialized(), p.gainEnergy(variant.amplified ? 4 : 2)), triggered(onDawn(), p.gainPoints(3)), triggered(onDissolved(), p.gainPoints(5))], "Mage");
    const watch = reader(2);
    const w = world(side, [target, watch, starter], { back: [target.id, watch.id, starter.id] });
    const id = w.ids[side].back[0]!;
    w.state.instances[id] = { ...w.state.instances[id], variant: { amplified: true } };
    const out = activate(w, w.ids[side].back[2]!);
    expect(out.state.instances[id].zone).toBe("void");
    const log = JSON.stringify(out.events);
    expect(queued(out.events)[0]).toMatchObject({ abandonedNamed: { source: id, controller: side, origin: { cardId: target.id, variant: { amplified: true } } } });
    for (const viewer of SIDES) expect(eventSeenBy(queued(out.events)[0], viewer, out.state)).not.toHaveProperty("abandonedNamed");
    const done = drain(w, out.state);
    expect(done.sides[side]).toMatchObject({ currentEnergy: 14, score: 8 });
    expect(done.sides[opponent(side)].score).toBe(0);
    expect(JSON.stringify(out.events)).toBe(log);
  });

  it.each(SIDES)("batches every %s matching index before observer reactions and excludes void-only names", side => {
    const target = card(3, () => [triggered(onMaterialized(), p.gainEnergy(1)), triggered(onMaterialized(), p.gainPoints(2)), triggered(onMaterialized(), p.gainPoints(20), { zone: "void" })], "Mage");
    const watch = reader(4, named("materialized"));
    const observe = card(5, () => [triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(1))]);
    const w = world(side, [target, watch, observe, starter], { back: [target.id, watch.id, observe.id, starter.id] });
    const out = activate(w, w.ids[side].back[3]!);
    const child = step(w, out.state, { kind: "resolveTrigger" });
    expect(queued(child.events).map(event => [event.source, event.ability])).toEqual([[w.ids[side].back[0], 0], [w.ids[side].back[0], 1], [w.ids[side].back[2], 0], [w.ids[side].back[2], 0]]);
    expect(drain(w, child.state).sides[side]).toMatchObject({ currentEnergy: 11, score: 4 });
  });

  it.each(SIDES.flatMap(side => [false, true].map(reclaimed => ({ side, reclaimed }))))("requires $side actual ordinary Dissolved admission; reclaimed=$reclaimed", ({ side, reclaimed }) => {
    const target = card(6, () => [triggered(onDissolved(), p.gainPoints(2))], "Mage");
    const watch = reader(7, named("dissolved"));
    const w = world(side, [target, watch, starter], { back: [target.id, watch.id, watch.id, starter.id] });
    // Declared replacement-status fixture, exercised through actual abandonment.
    w.state.instances[w.ids[side].back[0]!].status.reclaimed = reclaimed;
    const out = activate(w, w.ids[side].back[3]!);
    const done = drain(w, out.state);
    expect(done.sides[side].score).toBe(reclaimed ? 0 : 6);
    expect(done.instances[w.ids[side].back[0]!].zone).toBe(reclaimed ? "banished" : "void");
    const raw = queued(out.events)[0].abandonedNamed!;
    expect(raw.entries.every(entry => entry.confirmed === undefined)).toBe(true);
  });

  it.each(SIDES.flatMap(side => [false, true].map(gained => ({ side, gained }))))("shares $side combined-name once spending across ordinary admission and held readers; gained=$gained", ({ side, gained }) => {
    const donor = card(8, () => [triggered(either(onMaterialized(), onDawn(), onDissolved()), p.gainPoints(2), { oncePerTurn: true })]);
    const target = card(9, () => gained ? [activated([], p.sequence(p.gainAbilities(p.banishCards([everyIn("void")])), p.abandon("you", { subtype: "Mage" })))] : donor.abilities({ amplified: false }), "Mage");
    const watch = reader(10, p.sequence(named("materialized"), named("dawn")));
    const w = world(side, [target, donor, watch, starter], { back: [target.id, watch.id, watch.id, starter.id], void: gained ? [donor.id] : [] });
    const out = activate(w, w.ids[side].back[gained ? 0 : 3]!);
    expect(drain(w, out.state).sides[side].score).toBe(2);
  });

  it.each(SIDES)("keeps %s popped-reader sequential and held-copy once receipts after gained records end", side => {
    const donor = card(11, () => [triggered(either(onMaterialized(), onDawn()), p.gainPoints(3), { oncePerTurn: true })]);
    const target = card(12, () => [activated([], p.sequence(p.gainAbilities(p.banishCards([everyIn("void")])), p.abandon("you", { subtype: "Mage" })))], "Mage");
    const watch = reader(13, p.sequence(named("materialized"), named("materialized"), named("dawn")));
    const w = world(side, [target, donor, watch], { back: [target.id, watch.id, watch.id], void: [donor.id] });
    expect(drain(w, activate(w, w.ids[side].back[0]!).state).sides[side].score).toBe(3);
  });

  it.each(SIDES)("keeps %s actual source spark and subject cost distinct from its reader", side => {
    const target = { ...card(14, () => [triggered(onMaterialized(), p.gainEnergy(thisCharacterSpark())), triggered(onDawn(), p.gainPoints(triggerSubjectCost()))], "Mage"), spark: 7, costs: [energy(4)] };
    const watch = { ...reader(15), spark: 19 };
    const w = world(side, [target, watch, starter], { back: [target.id, watch.id, starter.id] });
    const done = drain(w, activate(w, w.ids[side].back[2]!).state);
    expect(done.sides[side]).toMatchObject({ currentEnergy: 17, score: 4 });
  });

  it.each(SIDES.flatMap(side => ["disabled", "condition", "once"].map(block => ({ side, block }))))("respects $side departure/ordinary eligibility $block", ({ side, block }) => {
    const target = card(16, () => [triggered(onDissolved(), p.gainPoints(2), { oncePerTurn: block === "once", ...(block === "condition" ? { condition: { cond: "energyAtLeast", amount: 20 } as const } : {}) })], "Mage");
    const watch = reader(17, named("dissolved"));
    const start = card(18, () => [activated([], p.sequence(...(block === "disabled" ? [p.disableTriggers(mages, "untilEndOfTurn")] : []), p.abandon("you", { subtype: "Mage" })))]);
    const w = world(side, [target, watch, start], { back: [target.id, watch.id, start.id] });
    expect(drain(w, activate(w, w.ids[side].back[2]!).state).sides[side].score).toBe(block === "once" ? 2 : 0);
  });

  it.each(SIDES)("rechecks %s request and resolution conditions without undoing committed abandonment", side => {
    const target = card(19, () => [triggered(onMaterialized(), p.gainPoints(2), { condition: { cond: "energyAtLeast", amount: 5 } })], "Mage");
    for (const request of [true, false]) {
      const watch = reader(20, request ? p.sequence(p.loseEnergy(8), named("materialized")) : p.sequence(named("materialized"), p.loseEnergy(8)));
      const w = world(side, [target, watch, starter], { back: [target.id, watch.id, starter.id] });
      const done = drain(w, activate(w, w.ids[side].back[2]!).state);
      expect(done.sides[side].score).toBe(0);
      expect(done.instances[w.ids[side].back[0]!].zone).toBe("void");
    }
  });

  it.each(SIDES)("saves %s bounded binding, clones independently and rejects malformed saved receipts", side => {
    const target = card(21, () => [triggered(onDawn(), p.gainPoints(2))], "Mage");
    const watch = reader(22, named("dawn"));
    const w = world(side, [target, watch, starter], { back: [target.id, watch.id, starter.id] });
    const out = activate(w, w.ids[side].back[2]!), before = stateHash(out.state);
    expect(stateHash(deserializeState(serializeState(out.state)))).toBe(before);
    const loaded = saved(slice(out.state));
    expect(loaded).not.toBeNull();
    expect(stateHash(loaded!.committed)).toBe(before);
    const copy = cloneState(out.state);
    copy.triggerQueue[0].abandonedNamed!.entries[0].used = true;
    expect(stateHash(copy)).not.toBe(before);
    expect(stateHash(out.state)).toBe(before);
    for (const patch of [{ named: "night" }, { ability: -1 }, { used: "false" }, { arbitrary: true }, { confirmed: true }]) {
      const bad = JSON.parse(JSON.stringify(slice(out.state))) as BattleSlice;
      Object.assign(bad.committed.triggerQueue[0].abandonedNamed!.entries[0], patch);
      expect(saved(bad)).toBeNull();
    }
    expect(drain(w, loaded!.committed).sides[side].score).toBe(2);
  });

  it.each(SIDES.flatMap(side => SIDES.map(viewer => ({ side, viewer }))))("reconstructs $side/$viewer ceased linked obligations and executes actual paired return", ({ side, viewer }) => {
    const target = card(23, () => [triggered(onMaterialized(), p.lookAtTopBanish(1)), triggered(onDawn(), p.putLinkedBanishedInHand())], "Mage");
    const watch = reader(24, named("dawn"));
    const start = card(25, () => [activated([], p.sequence(p.triggerAbility(mages, "materialized")))]);
    const w = world(side, [target, watch, start, starter], { back: [watch.id, start.id, starter.id] });
    const id = placeFigment(w.state, side, { rank: "back", index: 3 }, { kind: "figmentCopy", cardId: target.id, spark: null });
    const materialized = activate(w, w.ids[side].back[1]!);
    const held = drain(w, materialized.state);
    const before = activate(w, w.ids[side].back[2]!, 0, held).state;
    expect(before.instances[id]).toBeUndefined();
    const shown = JSON.parse(JSON.stringify(w.engine.view(before, viewer))) as ReturnType<typeof w.engine.view>;
    const actual = drain(w, before);
    expect(actual.sides[side].hand).toEqual([w.ids[side].deck[0]]);
    const sampled = w.engine.determinize(shown, lists(w), () => .3);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    const done = drain(w, saved(slice(sampled))!.committed);
    expect(done.sides[side].hand).toHaveLength(1);
    expect(done.turnLog.drawn[side]).toBe(0);
  });

  it.each(SIDES)("separates %s lost acquired once receipt from an independent reacquisition at the same index", side => {
    const donor = card(26, () => [triggered(onDawn(), p.gainPoints(3), { oncePerTurn: true })], "Explorer");
    const target = card(27, () => [activated([], p.sequence(
      p.gainAbilities(p.banishCards([randomIn("void", 1, { subtype: "Explorer" })])),
      p.abandon("you", { subtype: "Mage" }), p.materialize(everyIn("void", { subtype: "Mage" })),
      p.gainAbilities(p.banishCards([randomIn("void", 1, { subtype: "Explorer" })])), p.triggerAbility(self(), "dawn"),
    ))], "Mage");
    const watch = reader(28, p.sequence(named("dawn"), named("dawn")));
    const w = world(side, [target, donor, watch], { back: [target.id, watch.id], void: [donor.id, donor.id] });
    const out = activate(w, w.ids[side].back[0]!);
    const done = drain(w, out.state);
    expect(done.sides[side].score).toBe(6);
    expect(done.instances[w.ids[side].back[0]!].zone).toBe("play");
  });

  it.each(SIDES)("uses %s actual captured controller after a public ownership-independent control change", side => {
    const target = card(29, () => [triggered(onDawn(), p.gainPoints(4))], "Mage");
    const watch = reader(30, named("dawn"));
    const taker = card(31, () => [activated([], p.sequence(p.gainControl(all({ controller: "opponent", subtype: "Mage" })), p.abandon("you", { subtype: "Mage" })))]);
    const w = world(side, [target, watch, taker], { back: [watch.id, taker.id] }, { back: [target.id] });
    const out = activate(w, w.ids[side].back[1]!);
    const done = drain(w, out.state);
    expect(done.sides[side].score).toBe(4);
    expect(done.sides[opponent(side)].score).toBe(0);
    expect(done.instances[w.ids[opponent(side)].back[0]!].owner).toBe(opponent(side));
  });

  it.each(SIDES)("excludes %s lost names and rechecks a later live disable", side => {
    const target = card(32, () => [triggered(onDawn(), p.gainPoints(4))], "Mage");
    for (const lost of [false, true]) {
      const watch = reader(33, lost ? named("dawn") : p.sequence(p.materialize(everyIn("void", { subtype: "Mage" })), p.disableTriggers(mages, "untilEndOfTurn"), named("dawn")));
      const start = card(34, () => [activated([], p.sequence(...(lost ? [p.loseAllAbilities(mages)] : []), p.abandon("you", { subtype: "Mage" })))]);
      const w = world(side, [target, watch, start], { back: [target.id, watch.id, start.id] });
      expect(drain(w, activate(w, w.ids[side].back[2]!).state).sides[side].score).toBe(0);
    }
  });

  it.each(SIDES)("omits %s new-form metadata for entirely blind readers without revealing their classification", side => {
    const target = card(35, () => [triggered(onDawn(), p.gainPoints(2))], "Mage");
    const snapshots = [false, true].map(reads => {
      const hidden = card(36, () => [triggered(whenAbandon("you", { subtype: "Mage" }), reads ? named("dawn") : p.gainEnergy(1), { zone: "hand" })]);
      const w = world(side, [target, hidden, starter], { back: [target.id, starter.id], hand: [hidden.id] });
      const out = activate(w, w.ids[side].back[1]!);
      const shown = w.engine.view(out.state, opponent(side));
      expect(shown.triggerQueue[0]).toMatchObject({ source: null, origin: null });
      expect(shown.triggerQueue[0]).not.toHaveProperty("abandonedNamed");
      if (reads) expect(w.engine.view(out.state, side).triggerQueue[0]).toHaveProperty("abandonedNamed");
      return shown.triggerQueue;
    });
    expect(snapshots[1]).toEqual(snapshots[0]);
  });

  it.each(SIDES)("replays %s pending named child, refusing stale, concurrent, foreign and cancellation intents", side => {
    const target = card(37, () => [triggered(onDawn(), p.optional(p.gainPoints(2)))], "Mage");
    const watch = reader(38, named("dawn"));
    const w = world(side, [target, watch, starter], { back: [target.id, watch.id, starter.id] });
    const fold = createFoldAdapter(w.engine);
    let opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    while (opened.slice.inFlight === null) {
      const decision = w.engine.decision(opened.slice.committed);
      if (decision === null) throw new Error("Missing public decision");
      opened = applied(fold.reduce(opened.slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    const prompt = fold.pending(opened.slice)!.prompt;
    expect(prompt.kind).toBe("confirm");
    const loaded = saved(opened.slice)!;
    expect(fold.pending(loaded)!.prompt).toEqual(prompt);
    expect(fold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "cancel", side, promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(fold.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    for (const value of [false, true]) {
      const intent = { kind: "answer", side, promptId: prompt.id, value } as const;
      const direct = applied(fold.reduce(opened.slice, intent)), restored = applied(createFoldAdapter(w.engine).reduce(loaded, intent));
      expect(stateHash(restored.slice.committed)).toBe(stateHash(direct.slice.committed));
      expect(restored.published).toEqual(direct.published);
      expect(restored.slice.committed.sides[side].score).toBe(value ? 2 : 0);
      expect(restored.slice.committed.instances[w.ids[side].back[0]!].zone).toBe("void");
      expect(fold.reduce(restored.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    }
  });

  it.each(SIDES)("cancels %s paid-action planning before abandonment and named admissions", side => {
    const start = card(39, () => [activated([discardCost(1)], p.abandon("you", { subtype: "Mage" }))]);
    const target = card(40, () => [triggered(onDawn(), p.gainPoints(2))], "Mage"), watch = reader(41, named("dawn"));
    const w = world(side, [start, target, watch], { back: [target.id, watch.id, start.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const fold = createFoldAdapter(w.engine), before = stateHash(w.state);
    const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    const prompt = fold.pending(opened.slice)!.prompt;
    const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(before);
    expect(cancelled.published).toEqual([]);
  });

  it.each(SIDES)("rolls back %s actual resolution prefix on error while committed abandonment remains paid", side => {
    const target = card(42, () => [triggered(onDawn(), p.gainPoints(2))], "Mage");
    const missing = parseFigmentId("5e5e5e5e-0000-4000-8000-000000616999");
    for (const fail of [false, true]) {
      const watch = reader(43, p.sequence(named("dawn"), p.gainEnergy(3), ...(fail ? [p.materializeFigments(missing)] : [])));
      const w = world(side, [target, watch, starter], { back: [target.id, watch.id, starter.id] });
      const committed = activate(w, w.ids[side].back[2]!).state, before = stateHash(committed);
      const observed: EngineEvent[] = [];
      const run = () => runStep(committed, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog, { observeEvent: event => observed.push(event) });
      if (fail) expect(run).toThrow();
      else expect(drain(w, (run() as Extract<ReturnType<typeof runStep>, { kind: "done" }>).state).sides[side].score).toBe(2);
      expect(queued(observed)).toHaveLength(1);
      expect(observed).toContainEqual(expect.objectContaining({ kind: "energyChanged", change: 3 }));
      expect(stateHash(committed)).toBe(before);
      expect(committed.instances[w.ids[side].back[0]!].zone).toBe("void");
    }
  });

  it.each(SIDES)("privately restores %s sampled formerly blind reader only after its actual body needs this form", side => {
    const target = card(44, () => [triggered(onDawn(), p.gainPoints(2))], "Mage");
    const hidden = card(45, () => [triggered(whenAbandon("you", { subtype: "Mage" }), named("dawn"), { zone: "any" })], "Explorer");
    const start = card(46, () => [activated([], p.sequence(p.abandon("you", { subtype: "Mage" }), p.materialize(everyIn("hand", { subtype: "Explorer" }))))]);
    const w = world(side, [target, hidden, start], { back: [target.id, start.id], hand: [hidden.id] });
    const out = activate(w, w.ids[side].back[1]!).state;
    const shown = w.engine.view(out, opponent(side));
    expect(shown.triggerQueue[0]).toMatchObject({ source: w.ids[side].hand[0], origin: null });
    expect(shown.triggerQueue[0]).not.toHaveProperty("abandonedNamed");
    const sampled = w.engine.determinize(shown, lists(w), () => .2);
    expect(comparableView(w.engine.view(sampled, opponent(side)))).toEqual(comparableView(shown));
    expect(drain(w, sampled).sides[side].score).toBe(2);
    expect(drain(w, out).sides[side].score).toBe(2);
  });

  it.each(SIDES.flatMap(side => SIDES.map(viewer => ({ side, viewer }))))("executes $side/$viewer known reader with an unidentified current referent through a coherent member", ({ side, viewer }) => {
    const target = card(47, () => [triggered(onDawn(), p.gainPoints(4))], "Mage"), watch = reader(48, named("dawn"));
    const start = card(49, () => [activated([], p.sequence(p.abandon("you", { subtype: "Mage" }), p.shuffleInto([everyIn("void", { subtype: "Mage" })])))]);
    const w = world(side, [target, watch, start], { back: [target.id, watch.id, start.id] });
    const out = activate(w, w.ids[side].back[2]!).state;
    const shown = w.engine.view(out, viewer), binding = shown.triggerQueue[0].abandonedNamed;
    expect(binding).toMatchObject({ source: null, origin: { cardId: target.id }, anonymousSource: { owner: side } });
    expect(JSON.stringify(binding)).not.toContain(`"source":"${w.ids[side].back[0]}"`);
    const sampled = w.engine.determinize(shown, lists(w), () => .4);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    expect(drain(w, saved(slice(sampled))!.committed).sides[side].score).toBe(4);
    expect(drain(w, out).sides[side].score).toBe(4);
  });

  it.each(SIDES)("reconstructs %s opponent-held hidden reader against its actual public subject/controller", side => {
    const target = card(50, () => [triggered(onDawn(), p.gainPoints(2))], "Mage");
    const hidden = card(51, () => [triggered(whenAbandon("opponent", { subtype: "Mage" }), named("dawn"), { zone: "hand" })]);
    const start = card(52, () => [activated([], p.sequence(p.abandon("you", { subtype: "Mage" }), p.reveal("opponent")))]);
    const w = world(side, [target, hidden, start], { back: [target.id, start.id] }, { hand: [hidden.id] });
    const out = activate(w, w.ids[side].back[1]!).state, shown = w.engine.view(out, side);
    expect(shown.triggerQueue[0]).toMatchObject({ source: w.ids[opponent(side)].hand[0], origin: null, subject: w.ids[side].back[0] });
    const sampled = w.engine.determinize(shown, lists(w), () => .1);
    expect(saved(slice(sampled))).not.toBeNull();
    const done = drain(w, sampled);
    expect(done.sides[side].score).toBe(2);
    expect(done.sides[opponent(side)].score).toBe(0);
  });

  it.each(SIDES.flatMap(side => [false, true].map(limited => ({ side, limited }))))("detaches $side raw nested cause and confirms exact same-departure extra; limited=$limited", ({ side, limited }) => {
    const target = card(53, () => [triggered(either(onMaterialized(), onDissolved()), p.gainPoints(2), { oncePerTurn: limited })], "Mage");
    const watch = card(54, () => [triggered(either(whenAbandon("you", { subtype: "Mage" }), onDawn()), named(limited ? "materialized" : "dissolved"))]);
    const observe = card(55, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const w = world(side, [target, watch, observe, starter], { back: [target.id, watch.id, observe.id, starter.id] });
    const paid = step(w, w.state, { kind: "activate", source: w.ids[side].back[3]!, ability: 0 });
    const emitted: string[] = [];
    const out = runStep(paid.state, { kind: "resolveTop" }, NO_PROMPTS, w.engine.catalog, { observeEvent: event => { emitted.push(JSON.stringify(event)); } });
    if (out.kind !== "done") throw new Error("Unexpected suspension");
    expect(out.events.map(event => JSON.stringify(event))).toEqual(emitted);
    expect(drain(w, out.state).sides[side].score).toBe(limited ? 2 : 6);
  });
});


describe("716 regression", () => {
  it.each(SIDES.flatMap(side => SIDES.flatMap(viewer => [false, true].map(ceased => ({ side, viewer, ceased })))))("F1 same physical self reader $side/$viewer ceased=$ceased", ({ side, viewer, ceased }) => {
    const target = card(100, () => [activated([], p.sequence(p.abandon("you", { subtype: "Mage" }),
      ...(ceased ? [] : [p.shuffleInto([everyIn("void", { subtype: "Mage" })])]))),
      triggered(whenAbandon("you", { subtype: "Mage" }), named("dawn")), triggered(onDawn(), p.gainPoints(3))], "Mage");
    const w = world(side, [target], { back: ceased ? [] : [target.id] });
    const id = ceased ? placeFigment(w.state, side, { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: target.id, spark: null }) : w.ids[side].back[0]!;
    const out = activate(w, id).state, shown = w.engine.view(out, viewer);
    expect(out.triggerQueue[0].source).toBe(out.triggerQueue[0].abandonedNamed!.source);
    const sampled = w.engine.determinize(shown, lists(w), () => .2);
    expect(sampled.triggerQueue[0].source).toBe(sampled.triggerQueue[0].abandonedNamed!.source);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    const loaded = saved(slice(sampled));
    expect(loaded).not.toBeNull();
    expect(drain(w, loaded!.committed).sides[side].score).toBe(3);
    expect(drain(w, out).sides[side].score).toBe(3);
  });

  it.each(SIDES)("F2 %s ordinary abandoned branch spends an expired gained once occurrence", side => {
    const donor = card(101, () => [triggered(either(onDawn(), whenAbandon("you", { subtype: "Mage" })), p.gainPoints(3), { oncePerTurn: true })], "Explorer");
    const target = card(102, () => [activated([], p.sequence(p.gainAbilities(p.banishCards([everyIn("void")])), p.abandon("you", { subtype: "Mage" })))], "Mage");
    const watch = reader(103, p.sequence(named("dawn"), named("dawn")));
    const w = world(side, [donor, target, watch], { back: [target.id, watch.id, watch.id], void: [donor.id] });
    const out = activate(w, w.ids[side].back[0]!);
    expect(queued(out.events).filter(event => event.source === w.ids[side].back[0])).toHaveLength(1);
    expect(drain(w, out.state).sides[side].score).toBe(3);
  });

  it.each(SIDES.flatMap(side => SIDES.map(viewer => ({ side, viewer }))))("F3 only nested acquired paired obligation $side/$viewer", ({ side, viewer }) => {
    const donor = card(104, () => [triggered(onMaterialized(), p.lookAtTopBanish(1)), triggered(onDawn(), p.putLinkedBanishedInHand())], "Explorer");
    const target = card(105, () => [activated([], p.sequence(p.gainAbilities(p.banishCards([everyIn("void")])), p.triggerAbility(self(), "materialized")))], "Mage");
    const watch = card(106, () => [triggered(either(whenAbandon("you", { subtype: "Mage" }), onDawn()), p.optional(named("dawn")))]);
    const observe = card(107, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const w = world(side, [donor, target, watch, observe, starter], { back: [watch.id, observe.id, starter.id], void: [donor.id] });
    const id = placeFigment(w.state, side, { rank: "back", index: 3 }, { kind: "figmentCopy", cardId: target.id, spark: null });
    const held = drain(w, activate(w, id).state);
    const abandoned = activate(w, w.ids[side].back[2]!, 0, held).state;
    const onlyNested = step(w, abandoned, { kind: "resolveTrigger" }, [false]).state;
    expect(onlyNested.triggerQueue).toHaveLength(1);
    expect(onlyNested.triggerQueue[0].abandonedNamed).toBeUndefined();
    const renamed = cloneState(onlyNested), binding = renamed.triggerQueue[0].triggeringAbility!.occurrence.abandonedNamed!;
    for (const entry of binding.entries) for (const context of [entry.occurrence, ...(entry.linkedSource === undefined ? [] : [entry.linkedSource])]) {
      Object.assign(context, { enteredPlayAt: context.enteredPlayAt + 17, gainedFrom: `e${Number(context.gainedFrom!.slice(1)) + 17}` });
    }
    renamed.linkedBanished = renamed.linkedBanished!.map((record): LinkedBanishedCards => ({ ...record, enteredPlayAt: record.enteredPlayAt + 17, gainedFrom: `e${Number(record.gainedFrom!.slice(1)) + 17}` }));
    expect.soft(cycleHash(renamed)).toBe(cycleHash(onlyNested));
    const shown = w.engine.view(onlyNested, viewer), sampled = w.engine.determinize(shown, lists(w), () => .3);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    for (const state of [onlyNested, saved(slice(sampled))!.committed]) {
      const repeat = step(w, state, { kind: "resolveTrigger" }).state;
      const accepted = step(w, repeat, { kind: "resolveTrigger" }, [true]).state;
      const done = drain(w, accepted);
      expect(done.sides[side].hand).toHaveLength(1);
      expect(done.instances[done.sides[side].hand[0]].printing).toEqual(w.state.instances[w.ids[side].deck[0]].printing);
      expect(done.turnLog.drawn[side]).toBe(0);
    }
  });

  it.each(SIDES.flatMap(side => SIDES.map(viewer => ({ side, viewer }))))("F4 empty named set with late-public reader $side/$viewer", ({ side, viewer }) => {
    const target = card(108, () => [], "Mage");
    const hidden = card(109, () => [triggered(whenAbandon("you", { subtype: "Mage" }), named("dawn"), { zone: "any" })], "Explorer");
    const start = card(110, () => [activated([], p.sequence(p.abandon("you", { subtype: "Mage" }), p.materialize(everyIn("hand", { subtype: "Explorer" }))))]);
    const w = world(side, [target, hidden, start], { back: [target.id, start.id], hand: [hidden.id, v.event0.id] });
    const out = activate(w, w.ids[side].back[1]!).state, shown = w.engine.view(out, viewer);
    const sampled = w.engine.determinize(shown, lists(w), () => .2);
    expect(sampled.triggerQueue[0].abandonedNamed!.source).toBe(w.ids[side].back[0]);
    expect(sampled.triggerQueue[0].abandonedNamed!.entries).toEqual([]);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    const result = step(w, saved(slice(sampled))!.committed, { kind: "resolveTrigger" });
    expect(queued(result.events)).toEqual([]);
    expect(result.state.sides[side].score).toBe(0);
    expect(drain(w, out).sides[side].score).toBe(0);
  });
});


describe("717 regression", () => {
  it.each(SIDES.flatMap(side => SIDES.flatMap(viewer => (["allTypes", "spark"] as const).map(mode => ({ side, viewer, mode })))))("historical effective eligibility $side/$viewer $mode", ({ side, viewer, mode }) => {
    const filter = mode === "allTypes" ? { subtype: "Mage" as const } : { sparkAtLeast: 5 };
    const change = mode === "allTypes" ? p.giveAllTypes(self(), "whileSourceInPlay") : p.gainSpark(self(), 4, "whileSourceInPlay");
    const sourceCard = { ...card(111, () => [activated([], p.sequence(change, p.abandon("you", filter),
      p.materialize(everyIn("hand", { subtype: "Explorer" })))), triggered(onDawn(), p.gainPoints(3))]), spark: 1 };
    const hidden = card(112, () => [triggered(whenAbandon("you", filter), named("dawn"), { zone: "any" })], "Explorer");
    const w = world(side, [sourceCard, hidden], { back: [sourceCard.id], hand: [hidden.id, v.event0.id] });
    const source = w.ids[side].back[0]!, out = activate(w, source).state;
    expect(out.instances[source].zone).toBe("void");
    expect(out.triggerQueue).toHaveLength(1);
    const shown = w.engine.view(out, viewer);
    expect(shown.triggerQueue[0].subject).toBe(source);
    const sampled = w.engine.determinize(shown, lists(w), () => .2);
    expect(sampled.triggerQueue[0].abandonedNamed!.source).toBe(source);
    expect(sampled.triggerQueue[0].abandonedNamed!.controller).toBe(side);
    expect(sampled.instances[source].printing).toEqual({ kind: "card", cardId: sourceCard.id });
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    const child = step(w, saved(slice(sampled))!.committed, { kind: "resolveTrigger" });
    expect(queued(child.events).map(event => event.source)).toEqual([source]);
    expect(drain(w, child.state).sides[side].score).toBe(3);
    expect(drain(w, out).sides[side].score).toBe(3);
  });
});
