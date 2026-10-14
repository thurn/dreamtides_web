/** Exact named-occurrence privacy contracts, through real engine and fold consumers. */
import { describe, expect, it } from "vitest";
import { activated, all, characterYouControl, everyIn, self, staticAbility, energy, triggerSubjectCost, topOfDeck, costOf } from "../../../dsl/builders";
import { either, onDawn, onMaterialized, triggered, whenMaterialize, whenNamedAbilityTriggered, whenDraw } from "../../../dsl/triggers";
import type { EngineFigmentDefinition } from "../../../catalog";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { comparableView } from "../../../testing/determinization-fidelity";
import { syntheticId } from "../../../testing/synthetic-cards";
import { thisCharacterSpark } from "../../../dsl/values";
import * as p from "../index";
import { card, world, step, activate, drain, decklists, sliceOf, parseSaved, reload, queued, mages, deck, force, observer } from "./repeat-triggering-ability-fixtures";

describe("repeatTriggeringAbility privacy", () => {
  it.each(SIDES)("preserves %s actual captured cohort after its copied floating creator ceases", side => {
    for (const concealed of [false, true]) {
    const watch = card(18, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const plain = card(19, () => [], "Mage");
    const source = card(20, () => {
      const moved = p.abandonCards([p.capturedCards()]);
      return [triggered(onMaterialized(), p.sequence(p.withMaterialized(p.materialize(everyIn("void", { subtype: "Mage" })),
        p.floating(either(onDawn(), whenMaterialize(characterYouControl({ subtype: "Mage" }), 2)),
          p.sequence(moved, p.gainEnergy(costOf({ kind: "movedCards", node: moved })), p.materialize(everyIn("void", { subtype: "Mage" }))))), p.rematerialize(mages)))];
    }, "Explorer");
    const leave = card(67, () => [triggered(whenNamedAbilityTriggered("dawn"), p.sequence(p.dissolve(all(characterYouControl({ subtype: "Explorer" }))), ...(concealed ? [p.returnToHand(mages), p.shuffleInto([everyIn("hand", { subtype: "Mage" })])] : [])), { oncePerTurn: true })]);
    const starter = card(68, () => [activated([], p.materializeFigmentCopy(everyIn("void", { subtype: "Explorer" })))]);
    const w = world(side, [watch, plain, source, leave, starter], { back: [leave.id, watch.id, starter.id], void: [plain.id, source.id] });
    let state = activate(w, w.ids[side].back[2]!).state;
    for (let n = 0; n < 3; n++) state = step(w, state, { kind: "resolveTrigger" }).state;
    expect(drain(w, reload(sliceOf(state)).committed).sides[side].currentEnergy).toBe(concealed ? 9 : 10);
    for (const afterObserver of [false, true]) {
      const pending = afterObserver ? step(w, state, { kind: "resolveTrigger" }).state : state;
      for (const viewer of SIDES) {
        const shown = w.engine.view(pending, viewer), sampled = w.engine.determinize(shown, decklists(w), () => .2);
        expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
        expect(drain(w, sampled).sides[side].currentEnergy).toBe(concealed ? 9 : 10);
        if (concealed) {
          const reader = afterObserver ? shown.triggerQueue[0] : shown.triggerQueue[0].triggeringAbility!.occurrence;
          expect(reader.captured?.[0]).toMatchObject({ owner: side });
          expect(reader.captured?.[0]).not.toHaveProperty("printing");
          const changed = JSON.parse(JSON.stringify(pending)) as BattleState, member = w.ids[side].void[0];
          changed.instances[member] = { ...changed.instances[member], variant: { amplified: true } };
          expect(w.engine.view(changed, viewer).triggerQueue).toEqual(shown.triggerQueue);
        }
      }
    }
    }
  });

  it.each(SIDES.flatMap(side => (["hand", "deck"] as const).map(zone => ({ side, zone }))))("keeps private cause aliases absent for $side/$zone and restores a sampled real reader", ({ side, zone }) => {
    const secret = card(21, () => [triggered(either(onDawn(), whenMaterialize()), p.gainEnergy(2), { zone: "any" })]);
    const watch = card(22, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const plain = card(23, () => [], "Mage");
    const starter = card(24, () => [activated([], p.rematerialize(mages))]);
    const w = world(side, [secret, watch, plain, starter], { back: [plain.id, watch.id, starter.id],
      ...(zone === "hand" ? { hand: [secret.id] } : { deck: [secret.id, ...deck] }) });
    const out = activate(w, w.ids[side].back[2]!), id = w.ids[side][zone][0];
    for (const viewer of zone === "deck" ? SIDES : [opponent(side)]) {
    const shown = w.engine.view(out.state, viewer);
    const publicData = JSON.stringify([shown, out.events.map(e => eventSeenBy(e, viewer, out.state))]);
    expect(publicData.includes(`"${id}"`)).toBe(false);
    expect(publicData.includes(secret.id)).toBe(false);
    const lists = decklists(w);
    const sampled = w.engine.determinize(shown, lists, () => .2);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    expect(drain(w, sampled).sides[side].currentEnergy).toBe(10);
    expect(drain(w, out.state).sides[side].currentEnergy).toBe(12);
    }
  });

  it.each(SIDES)("rejects malformed %s saved causal records and atomically recovers catalog mismatches", side => {
    const source = card(41, () => [triggered(onMaterialized(), p.gainEnergy(1))], "Mage");
    const w = world(side, [source, observer, force], { back: [source.id, observer.id, force.id] });
    const original = step(w, activate(w, w.ids[side].back[2]!).state, { kind: "resolveTrigger" });
    for (const malformed of [null, { named: "unknown", occurrence: original.state.triggerQueue[0] },
      { named: "materialized", occurrence: { ...original.state.triggerQueue[0], kind: "dreamwellBonus" } },
      { ...original.state.triggerQueue[0].triggeringAbility, extra: true },
      { ...original.state.triggerQueue[0].triggeringAbility, observedBy: [side, side] },
      { ...original.state.triggerQueue[0].triggeringAbility, occurrence: { ...original.state.triggerQueue[0].triggeringAbility!.occurrence, discardedCount: -1 } }]) {
      const slice = JSON.parse(JSON.stringify(sliceOf(original.state))) as { committed: { triggerQueue: Record<string, unknown>[] } };
      slice.committed.triggerQueue[0].triggeringAbility = malformed;
      expect(parseSaved(slice)).toBeNull();
    }
    const bad = JSON.parse(JSON.stringify(sliceOf(original.state))) as BattleSlice;
    const watch = bad.committed.triggerQueue[0];
    bad.committed.triggerQueue[0] = { ...watch, triggeringAbility: { ...watch.triggeringAbility!, occurrence: { ...watch.triggeringAbility!.occurrence, ability: 99 } } };
    const loaded = reload({ ...bad, inFlight: { step: { kind: "resolveTrigger" }, automatic: true, answers: [] } }), before = stateHash(loaded.committed);
    const failed = createFoldAdapter(w.engine).reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } });
    if (failed.kind !== "applied") throw new Error("No catalog reader recovery");
    expect(failed.error).toMatchObject({ kind: "engine_error", message: "Ability 99 of its origin has no effect" });
    expect(stateHash(failed.slice.committed)).toBe(before);
    expect(failed.published).toEqual([]);
  });

  it.each(SIDES)("retains %s publicly observed ceased copy or figment origin and departure spark for both sampled readers", side => {
    for (const figment of [false, true]) {
    const source = { ...card(52, () => [triggered(onMaterialized(), p.sequence(p.dissolve(self()), p.gainEnergy(thisCharacterSpark())))], "Mage"), spark: 5 };
    const token: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(0x712060)), status: "authored", subtype: "Mage", spark: 5,
      abilities: () => [triggered(onMaterialized(), p.sequence(p.dissolve(self()), p.gainEnergy(thisCharacterSpark())))] };
    const starter = card(53, () => [activated([], figment ? p.materializeFigments(token.id) : p.materializeFigmentCopy(everyIn("void", { subtype: "Mage" })))]);
    const w = world(side, [...(figment ? [] : [source]), observer, starter], { back: [observer.id, starter.id], void: figment ? [] : [source.id] }, {}, {}, figment ? [token] : []);
    const out = activate(w, w.ids[side].back[1]!);
    const copy = queued(out.events).find(e => e.source !== w.ids[side].back[0])?.source;
    if (typeof copy !== "string") throw new Error("No genuine copied printing admission");
    const original = step(w, out.state, { kind: "resolveTrigger" });
    expect(original.state.instances[copy]).toBeUndefined();
    expect(original.state.sides[side].currentEnergy).toBe(13);
    for (const viewer of SIDES) {
      const shown = w.engine.view(original.state, viewer);
      expect(JSON.stringify(shown).includes(`"${copy}"`)).toBe(false);
      const cause = shown.triggerQueue[0].triggeringAbility?.occurrence;
      expect(cause).toMatchObject({ source: null, origin: figment ? { kind: "figment", id: token.id } : { kind: "card", cardId: source.id }, anonymousSource: { ceased: true }, lastKnownSourceSpark: 5 });
    const lists = decklists(w);
      const sampled = w.engine.determinize(shown, lists, () => .2);
      expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
      expect(drain(w, sampled).sides[side].currentEnergy).toBe(18);
      const repeated = step(w, original.state, { kind: "resolveTrigger" }).state;
      expect(repeated.triggerQueue).toHaveLength(1);
      const pendingView = w.engine.view(repeated, viewer);
      const pendingSample = w.engine.determinize(pendingView, lists, () => .2);
      expect(comparableView(w.engine.view(pendingSample, viewer))).toEqual(comparableView(pendingView));
      expect(drain(w, reload(sliceOf(repeated)).committed).sides[side].currentEnergy).toBe(18);
      expect(drain(w, pendingSample).sides[side].currentEnergy).toBe(18);
    }
    expect(drain(w, reload(sliceOf(original.state)).committed).sides[side].currentEnergy).toBe(18);
    }
  });

  it.each(SIDES)("discloses %s observed historical origin without current hidden variant or physical alias", side => {
    const source = card(54, () => [triggered(onMaterialized(), p.gainEnergy(1))], "Mage");
    const leave = card(55, () => [triggered(whenNamedAbilityTriggered("materialized"), p.sequence(p.returnToHand(mages), p.shuffleInto([everyIn("hand", { subtype: "Mage" })])), { oncePerTurn: true })]);
    const w = world(side, [source, leave, observer, force], { back: [source.id, leave.id, observer.id, force.id] });
    let state = activate(w, w.ids[side].back[3]!).state;
    state = step(w, step(w, state, { kind: "resolveTrigger" }).state, { kind: "resolveTrigger" }).state;
    const id = w.ids[side].back[0]!, viewer = opponent(side), shown = w.engine.view(state, viewer);
    expect(JSON.stringify(shown).includes(`"${id}"`)).toBe(false);
    const cause = shown.triggerQueue[0].triggeringAbility!.occurrence;
    expect(cause.origin).toMatchObject({ kind: "card", cardId: source.id, variant: { amplified: false } });
    expect(cause.anonymousSource).toMatchObject({ owner: side });
    // Privacy is a contract for synthetic input states too: changing a concealed
    // current variant cannot disclose it through a previously observed origin.
    const changed = JSON.parse(JSON.stringify(state)) as BattleState;
    changed.instances[id] = { ...changed.instances[id], variant: { amplified: true } };
    expect(w.engine.view(changed, viewer).triggerQueue).toEqual(shown.triggerQueue);
    const lists = decklists(w);
    const sampled = w.engine.determinize(shown, lists, () => .2);
    expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
    expect(drain(w, sampled).sides[side].currentEnergy).toBe(10);
  });

  it.each(SIDES)("keeps %s originally unobserved history private after its source becomes public", side => {
    const secret = card(56, () => [triggered(either(onDawn(), whenMaterialize()), p.gainEnergy(2), { zone: "any" })]);
    const reveal = card(57, () => [triggered(whenNamedAbilityTriggered("dawn"), p.materialize(topOfDeck()), { oncePerTurn: true })]);
    const repeat = card(58, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const plain = card(59, () => [], "Mage");
    const starter = card(60, () => [activated([], p.rematerialize(mages))]);
    const w = world(side, [secret, reveal, repeat, plain, starter], { back: [plain.id, reveal.id, repeat.id, starter.id], deck: [secret.id, ...deck] });
    const queuedState = activate(w, w.ids[side].back[3]!).state;
    const state = step(w, step(w, queuedState, { kind: "resolveTrigger" }).state, { kind: "resolveTrigger" }).state;
    const id = w.ids[side].deck[0];
    expect(state.instances[id].zone).toBe("play");
    for (const viewer of SIDES) {
      const shown = w.engine.view(state, viewer);
      expect(shown.triggerQueue[0].triggeringAbility?.occurrence).toMatchObject({ source: id, origin: null });
      const sampled = w.engine.determinize(shown, decklists(w), () => .2);
      expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
      expect(drain(w, sampled).sides[side].currentEnergy).toBe(14);
    }
  });

  it.each(SIDES)("samples %s hidden subject cost after a known copied source ceases, before and after repetition", side => {
    const drawn = { ...card(62, () => []), cardType: "event" as const, costs: [energy(3)] };
    const source = card(63, () => [triggered(either(onDawn(), whenDraw("you", undefined, { cardType: "event" })), p.gainEnergy(triggerSubjectCost()))], "Mage");
    const leave = card(64, () => [triggered(whenNamedAbilityTriggered("dawn"), p.dissolve(mages), { oncePerTurn: true })]);
    const repeat = card(65, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const starter = card(66, () => [activated([], p.sequence(p.materializeFigmentCopy(everyIn("void", { subtype: "Mage" })), p.draw(1)))]);
    const w = world(side, [drawn, source, leave, repeat, starter], { back: [leave.id, repeat.id, starter.id], void: [source.id], deck: [drawn.id, drawn.id, drawn.id] });
    let state = activate(w, w.ids[side].back[2]!).state;
    state = step(w, step(w, state, { kind: "resolveTrigger" }).state, { kind: "resolveTrigger" }).state;
    for (const afterObserver of [false, true]) {
      const pending = afterObserver ? step(w, state, { kind: "resolveTrigger" }).state : state;
      for (const viewer of SIDES) {
        const shown = w.engine.view(pending, viewer);
        const reader = afterObserver ? shown.triggerQueue[0] : shown.triggerQueue[0].triggeringAbility!.occurrence;
        if (viewer !== side) expect(reader).toMatchObject({ source: null, subject: null, subjectCostHidden: true });
        const sampled = w.engine.determinize(shown, decklists(w), () => .2);
        expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
        expect(drain(w, sampled).sides[side].currentEnergy).toBe(14);
      }
      expect(drain(w, reload(sliceOf(pending)).committed).sides[side].currentEnergy).toBe(14);
    }
  });

  it.each(SIDES.flatMap(side => (["hand", "deck"] as const).map(zone => ({ side, zone }))))("keeps entirely private $side/$zone repetition unclassified to blind viewers", ({ side, zone }) => {
    const original = card(69, () => [triggered(onDawn(), p.gainEnergy(2), { zone: "any" })]);
    const watch = card(70, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { zone: "any", oncePerTurn: true })]);
    const w = world(side, [original, watch], { ...(zone === "hand" ? { hand: [original.id, watch.id] } : { deck: [original.id, watch.id, ...deck] }) });
    const fired = step(w, { ...w.state, turn: { ...w.state.turn, phase: "draw" } }, { kind: "advancePhase" });
    const first = step(w, fired.state, { kind: "resolveTrigger" });
    const repeated = step(w, first.state, { kind: "resolveTrigger" });
    expect(repeated.state.triggerQueue).toHaveLength(1);
    for (const viewer of zone === "deck" ? SIDES : [opponent(side)]) {
      const shown = w.engine.view(repeated.state, viewer), row = shown.triggerQueue[0];
      expect(row).not.toHaveProperty("repeated");
      expect(row).toMatchObject({ source: null, origin: null });
      expect(shown.turnLog.dawnProgress?.knownCount).toBe(0);
      expect(JSON.stringify(shown).includes(original.id)).toBe(false);
      expect(JSON.stringify(shown).includes(watch.id)).toBe(false);
      const visible = repeated.events.map(e => eventSeenBy(e, viewer, repeated.state)).filter(Boolean);
      for (const event of visible) expect(event).not.toHaveProperty("triggeringAbility");
      expect(JSON.stringify(visible).includes(original.id)).toBe(false);
      expect(JSON.stringify(visible).includes(watch.id)).toBe(false);
    }
    expect(drain(w, repeated.state).sides[side].currentEnergy).toBe(12);
  });

  it.each(SIDES)("retains %s observed pending observing copy after an earlier sibling makes it cease", side => {
    const root = card(71, () => [triggered(onMaterialized(), p.gainEnergy(2))], "Mage");
    const watch = card(72, () => [triggered(whenNamedAbilityTriggered("materialized"), p.repeatTriggeringAbility(), { oncePerTurn: true })], "Explorer");
    const leave = card(73, () => [triggered(whenNamedAbilityTriggered("materialized"), p.dissolve(all(characterYouControl({ subtype: "Explorer" }))), { oncePerTurn: true })]);
    const starter = card(74, () => [activated([], p.materializeFigmentCopy(everyIn("void", { subtype: "Explorer" }))), activated([], p.triggerAbility(mages, "materialized"))]);
    const w = world(side, [root, watch, leave, starter], { back: [root.id, leave.id, starter.id], void: [watch.id] });
    const prepared = activate(w, w.ids[side].back[2]!);
    const cast = step(w, prepared.state, { kind: "activate", source: w.ids[side].back[2]!, ability: 1 });
    let state = step(w, cast.state, { kind: "resolveTop" }).state;
    state = step(w, step(w, state, { kind: "resolveTrigger" }).state, { kind: "resolveTrigger" }).state;
    for (const viewer of SIDES) {
      const shown = w.engine.view(state, viewer), sampled = w.engine.determinize(shown, decklists(w), () => .2);
      expect(shown.triggerQueue[0]).toMatchObject({ source: null, origin: { kind: "card", cardId: watch.id }, anonymousSource: { ceased: true } });
      expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(shown));
      expect(drain(w, sampled).sides[side].currentEnergy).toBe(12);
    }
    expect(drain(w, reload(sliceOf(state)).committed).sides[side].currentEnergy).toBe(12);
  });

  it.each(SIDES.flatMap(side => [false, true].map(thresholdPresent => [side, thresholdPresent] as const)))("keeps %s known Dawn repeat count with threshold=%s after its observed copied original ceases", (side, thresholdPresent) => {
    const source = card(75, () => [triggered(onDawn(), p.sequence(p.dissolve(self()), p.gainEnergy(1)))], "Mage");
    const other = card(76, () => [triggered(onDawn(), p.sequence())]);
    const watch = card(77, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const threshold = card(78, () => [staticAbility(p.ruleModifier({ rule: "dawnThreshold", count: 3, effect: p.draw(1) }))]);
    const starter = card(79, () => [activated([], p.materializeFigmentCopy(everyIn("void", { subtype: "Mage" })))]);
    const w = world(side, [source, other, watch, threshold, starter], { front: [other.id], back: [watch.id, ...(thresholdPresent ? [threshold.id] : []), starter.id], void: [source.id] });
    const prepared = activate(w, w.ids[side].back[w.ids[side].back.length - 1]!);
    let state = step(w, { ...prepared.state, turn: { ...prepared.state.turn, phase: "draw" } }, { kind: "advancePhase" }).state;
    for (let n = 0; n < 3; n++) state = step(w, state, { kind: "resolveTrigger" }).state;
    expect(state.turnLog.dawnProgress?.total).toBe(3);
    for (const viewer of SIDES) expect(w.engine.view(state, viewer).turnLog.dawnProgress?.knownCount).toBe(3);
    const done = drain(w, state);
    expect(done.sides[side].hand).toHaveLength(thresholdPresent ? 1 : 0);
    expect(done.sides[side].currentEnergy).toBe(10);
  });
});
