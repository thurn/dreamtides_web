/** Exact named-occurrence core contracts, through real engine and fold consumers. */
import { describe, expect, it } from "vitest";
import { activated, characterYouControl, discardCost, everyIn, self, staticAbility, energy, triggerSubjectCost, triggerSubjectSpark } from "../../../dsl/builders";
import { either, onDawn, onMaterialized, triggered, whenMaterialize, whenNamedAbilityTriggered, onDissolved, triggeringCard, whenCopyTrigger, whenDissolved } from "../../../dsl/triggers";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter } from "../../../fold/slice";
import { eventLogRecords } from "../../../log";
import { stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES } from "../../../state/ids";
import { thisCharacterSpark } from "../../../dsl/values";
import * as p from "../index";
import { card, world, step, activate, drain, decklists, sliceOf, applied, reload, queued, mages, force, observer, v } from "./repeat-triggering-ability-fixtures";

describe("repeatTriggeringAbility core", () => {
  it.each(SIDES)("repeats exactly the first %s admitted body and preserves batch FIFO and raw causal logs", side => {
    const source = card(2, () => [triggered(onMaterialized(), p.gainEnergy(1)), triggered(onMaterialized(), p.gainPoints(2))], "Mage");
    const w = world(side, [source, observer, force], { back: [source.id, observer.id, force.id] });
    const out = activate(w, w.ids[side].back[2]!);
    expect(queued(out.events).map(e => e.source)).toEqual([w.ids[side].back[0], w.ids[side].back[0], w.ids[side].back[1]]);
    const cause = queued(out.events)[2];
    expect(cause.subject).toBeNull();
    const logs = eventLogRecords(out.events, out.state.version).filter(r => r.event === "engine.trigger");
    expect(logs[2]).toMatchObject({ detail: { triggeringAbility: { named: "materialized", occurrence: { source: w.ids[side].back[0], ability: 0 } } } });
    for (const viewer of SIDES) expect(eventSeenBy(cause, viewer, out.state)).not.toHaveProperty("triggeringAbility");
    const done = drain(w, reload(sliceOf(out.state)).committed);
    expect(done.sides[side].currentEnergy).toBe(10);
    expect(done.sides[side].score).toBe(2);
  });

  it.each(SIDES)("retains %s original controller when the other side repeats it", side => {
    const source = card(3, () => [triggered(onMaterialized(), p.gainPoints(2))], "Mage");
    const opposite = card(4, () => [triggered(whenNamedAbilityTriggered("materialized", "opponent"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const w = world(side, [source, opposite, force], { back: [source.id, force.id] }, { back: [opposite.id] });
    const done = drain(w, activate(w, w.ids[side].back[1]!).state);
    expect(done.sides[side].score).toBe(4);
    expect(done.sides[opponent(side)].score).toBe(0);
  });

  it.each(SIDES)("keeps %s initial variant and definition through ordinary ability loss", side => {
    const source = card(5, variant => [triggered(onMaterialized(), p.sequence(p.loseAllAbilities(self()), p.gainEnergy(variant.amplified ? 4 : 1)))], "Mage");
    const w = world(side, [source, observer, force], { back: [source.id, observer.id, force.id] });
    w.state.instances[w.ids[side].back[0]!] = { ...w.state.instances[w.ids[side].back[0]!], variant: { amplified: true } };
    expect(drain(w, activate(w, w.ids[side].back[2]!).state).sides[side].currentEnergy).toBe(16);
  });

  it.each(SIDES)("keeps %s gained definition and its spent once limit through record cleanup", side => {
    for (const limited of [false, true]) {
    const donor = card(6, () => [triggered(onMaterialized(), p.sequence(p.loseAllAbilities(self()), p.gainEnergy(3)), { oncePerTurn: limited })]);
    const source = card(7, () => [activated([], p.sequence(p.gainAbilities(p.banishCards([everyIn("void")])), p.triggerAbility(self(), "materialized")))], "Mage");
    const w = world(side, [donor, source, observer], { back: [source.id, observer.id], void: [donor.id] });
    const out = activate(w, w.ids[side].back[0]!);
    expect(drain(w, out.state).sides[side].currentEnergy).toBe(limited ? 11 : 14);
    }
  });

  it.each(SIDES)("refuses %s fresh ordinary admission while its source is disabled", side => {
    const source = card(8, () => [triggered(onMaterialized(), p.sequence(p.disableTriggers(self(), "untilEndOfTurn"), p.gainEnergy(1)))], "Mage");
    const w = world(side, [source, observer, force], { back: [source.id, observer.id, force.id] });
    expect(drain(w, activate(w, w.ids[side].back[2]!).state).sides[side].currentEnergy).toBe(9);
  });

  it.each(SIDES)("checks %s captured intervening condition at repeat admission and resolution", side => {
    for (const atResolution of [false, true, "disabled"] as const) {
      const source = card(9, () => [triggered(onMaterialized(), atResolution ? p.gainPoints(1) : p.loseEnergy(2), { condition: { cond: "energyAtLeast", amount: 7 } })], "Mage");
      const watch = card(10, () => [triggered(whenNamedAbilityTriggered("materialized"), atResolution
        ? p.sequence(p.repeatTriggeringAbility(), atResolution === "disabled" ? p.disableTriggers(mages, "untilEndOfTurn") : p.loseEnergy(2)) : p.repeatTriggeringAbility(), { oncePerTurn: true })]);
      const w = world(side, [source, watch, force], { back: [source.id, watch.id, force.id] });
      const out = activate(w, w.ids[side].back[2]!);
      const original = step(w, out.state, { kind: "resolveTrigger" });
      const reaction = step(w, original.state, { kind: "resolveTrigger" });
      expect(queued(reaction.events)).toHaveLength(atResolution ? 1 : 0);
      const done = drain(w, reaction.state);
      expect(done.sides[side].currentEnergy).toBe(atResolution === "disabled" ? 8 : 6);
      expect(done.sides[side].score).toBe(atResolution === "disabled" ? 2 : atResolution ? 1 : 0);
    }
  });

  it.each(SIDES.flatMap(side => [false, true].map(inObserver => ({ side, inObserver }))))("propagates captured $side departure spark with insideObserver=$inObserver", ({ side, inObserver }) => {
      const source = { ...card(11, () => [triggered(onMaterialized(), p.gainEnergy(thisCharacterSpark()))], "Mage"), spark: 5 };
      const leave = card(12, () => [triggered(whenNamedAbilityTriggered("materialized"), p.dissolve(mages), { oncePerTurn: true })]);
      const watch = card(13, () => [triggered(whenNamedAbilityTriggered("materialized"), inObserver
        ? p.sequence(p.dissolve(mages), p.repeatTriggeringAbility()) : p.repeatTriggeringAbility(), { oncePerTurn: true })]);
      const starter = card(61, () => [activated([], p.sequence(p.gainSpark(mages, 4), p.triggerAbility(mages, "materialized")))]);
      const w = world(side, [source, leave, watch, starter], { back: [source.id, ...(inObserver ? [] : [leave.id]), watch.id, starter.id] });
      const out = activate(w, w.ids[side].back[inObserver ? 2 : 3]!);
      const done = drain(w, out.state);
      expect(done.instances[w.ids[side].back[0]!]?.zone).toBe("void");
      expect(done.sides[side].currentEnergy).toBe(26);
  });

  it.each(SIDES.flatMap(side => [false, true].map(once => ({ side, once }))))("repeats exact floating node for $side and refuses consumed one-shot=$once", ({ side, once }) => {
    const watch = card(14, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const source = card(15, () => [activated([], p.sequence(p.floating(either(onDawn(), whenMaterialize()), p.gainEnergy(1)),
      (once ? p.delayed : p.floating)(either(onDawn(), whenMaterialize()), p.gainEnergy(3)), p.rematerialize(mages)))]);
    const plain = card(16, () => [], "Mage");
    const w = world(side, [watch, source, plain], { back: [plain.id, watch.id, source.id] });
    expect(drain(w, activate(w, w.ids[side].back[2]!).state).sides[side].currentEnergy).toBe(13);
    // One observer per instruction selected the first floating occurrence, not every matching node.
    const only = card(17, () => [activated([], p.sequence((once ? p.delayed : p.floating)(either(onDawn(), whenMaterialize()), p.gainEnergy(3)), p.rematerialize(mages)))]);
    const w2 = world(side, [watch, only, plain], { back: [plain.id, watch.id, only.id] });
    const fired = activate(w2, w2.ids[side].back[2]!).state;
    expect(drain(w2, fired).sides[side].currentEnergy).toBe(once ? 11 : 14);
    if (once) {
      const fake = { ...fired, triggerQueue: [{ ...fired.triggerQueue[0], repeated: { named: "dawn" as const, observedBy: SIDES, visibleTo: SIDES } }] };
      expect(() => step(w2, reload(sliceOf(fake)).committed, { kind: "resolveTrigger" })).toThrow("spent its immutable allowance");
      const projected = w2.engine.view(fake, side);
      expect(() => w2.engine.determinize(projected, decklists(w2), () => .2)).toThrow("impossible repeated allowance");
    }
  });

  it.each(SIDES)("ends %s admission-only growing causal cycles with a mandatory draw", side => {
    const cycle = card(25, () => [triggered(either(onMaterialized(), whenNamedAbilityTriggered("materialized")), p.optional(p.repeatTriggeringAbility()))], "Mage");
    const w = world(side, [cycle, force], { back: [cycle.id, force.id] });
    const out = activate(w, w.ids[side].back[1]!);
    expect(out.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(out.state.sides[side].currentEnergy).toBe(8);
    expect(out.events[out.events.length - 1]?.kind).toBe("battleEnded");
  });

  it.each(SIDES)("has no reader outside an actual %s named occurrence and leaves ordinary observers uncaptured", side => {
    const source = card(26, () => [activated([], p.sequence(p.repeatTriggeringAbility(), p.triggerAbility(mages, "materialized"))), triggered(onMaterialized(), p.repeatTriggeringAbility())], "Mage");
    const ordinary = card(27, () => [triggered(whenNamedAbilityTriggered("materialized"), p.gainPoints(1))]);
    const w = world(side, [source, ordinary], { back: [source.id, ordinary.id] });
    const out = activate(w, w.ids[side].back[0]!);
    expect(queued(out.events).every(e => e.triggeringAbility === undefined)).toBe(true);
    expect(drain(w, out.state).sides[side].score).toBe(1);
  });

  it.each(SIDES)("counts %s successful repeats in Dawn and observes each new admission", side => {
    const source = card(28, () => [triggered(onDawn(), p.gainEnergy(1))]);
    const repeat = card(29, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const threshold = card(30, () => [staticAbility(p.ruleModifier({ rule: "dawnThreshold", count: 3, effect: p.draw(1) }))]);
    const count = card(31, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const w = world(side, [source, repeat, threshold, count], { back: [source.id, source.id, repeat.id, threshold.id, count.id] });
    const out = step(w, { ...w.state, turn: { ...w.state.turn, phase: "draw" } }, { kind: "advancePhase" });
    const done = drain(w, out.state);
    expect(done.sides[side].currentEnergy).toBe(11);
    expect(done.sides[side].hand).toHaveLength(1);
    expect(done.sides[side].score).toBe(3);
  });

  it.each(SIDES)("keeps %s independent named roots that converge on a finite repeating bridge", side => {
    const root = card(32, () => [triggered(onMaterialized(), p.gainEnergy(1)), triggered(onMaterialized(), p.gainEnergy(2))], "Mage");
    const bridge = card(33, () => [triggered(either(onDawn(), whenNamedAbilityTriggered("materialized")), p.sequence(p.loseAllAbilities(self()), p.repeatTriggeringAbility()))]);
    const observe = card(34, () => [triggered(whenNamedAbilityTriggered("dawn"), p.gainPoints(1))]);
    const w = world(side, [root, bridge, observe, force], { back: [root.id, bridge.id, observe.id, force.id] });
    const out = activate(w, w.ids[side].back[3]!);
    expect(out.state.result).toBeNull();
    // The bridges are different real occasions even when their outer definitions agree.
    expect(queued(out.events)).toHaveLength(6);
    const done = drain(w, out.state);
    expect(done.result).toBeNull();
    expect(done.sides[side].currentEnergy).toBe(14);
    expect(done.sides[side].score).toBe(2);
  });

  it.each(SIDES)("reloads %s optional observer and refuses wrong-side, stale and duplicate continuations", side => {
    const source = card(35, () => [triggered(onMaterialized(), p.gainEnergy(2))], "Mage");
    const watch = card(36, () => [triggered(whenNamedAbilityTriggered("materialized"), p.optional(p.repeatTriggeringAbility()), { oncePerTurn: true })]);
    const w = world(side, [source, watch, force], { back: [source.id, watch.id, force.id] });
    const fold = createFoldAdapter(w.engine);
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    const pending = fold.pending(opened.slice);
    if (pending?.prompt.kind !== "confirm") throw new Error("Missing actual repeat prompt");
    const loaded = reload(opened.slice), before = stateHash(loaded.committed);
    expect(fold.pending(loaded)?.prompt).toEqual(pending.prompt);
    expect(fold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    for (const value of [false, true]) {
      const intent = { kind: "answer", side, promptId: pending.prompt.id, value } as const;
      const direct = applied(fold.reduce(opened.slice, intent)), restored = applied(createFoldAdapter(w.engine).reduce(loaded, intent));
      expect(stateHash(restored.slice.committed)).toBe(stateHash(direct.slice.committed));
      expect(restored.published).toEqual(direct.published);
      expect(restored.slice.committed.sides[side].currentEnergy).toBe(value ? 12 : 10);
      expect(fold.reduce(restored.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    }
    expect(stateHash(loaded.committed)).toBe(before);
  });

  it.each(SIDES)("rolls back %s genuine repeated mutation prefix on the exact later primitive error", side => {
    const source = card(37, () => [triggered(onMaterialized(), p.gainEnergy(2))], "Mage");
    const missing = parseFigmentId("00000000-0000-4000-8000-000000712999");
    for (const fail of [false, true]) {
      const watch = card(38, () => [triggered(whenNamedAbilityTriggered("materialized"), p.sequence(p.repeatTriggeringAbility(), p.gainEnergy(3),
        ...(fail ? [p.materializeFigments(missing)] : [])), { oncePerTurn: true })]);
      const w = world(side, [source, watch, force], { back: [source.id, watch.id, force.id] });
      const out = activate(w, w.ids[side].back[2]!);
      const original = step(w, out.state, { kind: "resolveTrigger" });
      if (!fail) {
        const control = step(w, original.state, { kind: "resolveTrigger" });
        expect(queued(control.events)).toHaveLength(1);
        expect(control.state.sides[side].currentEnergy).toBe(13);
        expect(drain(w, control.state).sides[side].currentEnergy).toBe(15);
      } else {
        const before = stateHash(original.state), fold = createFoldAdapter(w.engine);
        const loaded = reload({ ...sliceOf(original.state), inFlight: { step: { kind: "resolveTrigger" }, automatic: true, answers: [] } });
        const failed = fold.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } });
        if (failed.kind !== "applied") throw new Error("No actual recovered error");
        expect(failed.error).toMatchObject({ kind: "engine_error", message: `Unknown figment ${missing}` });
        expect(stateHash(failed.slice.committed)).toBe(before);
        expect(failed.slice.inFlight).toBeNull();
        expect(failed.published).toEqual([]);
        expect(stateHash(original.state)).toBe(before);
      }
    }
  });

  it.each(SIDES)("cancels %s original planning before any actual admission", side => {
    const source = card(39, () => [triggered(onMaterialized(), p.gainEnergy(1))], "Mage");
    const starter = card(40, () => [activated([discardCost(1)], p.triggerAbility(mages, "materialized"))]);
    const w = world(side, [source, observer, starter], { back: [source.id, observer.id, starter.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const fold = createFoldAdapter(w.engine), before = stateHash(w.state);
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    const pending = fold.pending(opened.slice);
    if (pending === null) throw new Error("No real planning prompt");
    const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(before);
    expect(cancelled.published).toEqual([]);
  });

  it.each(SIDES)("keeps %s copiable subject cost and predeparture spark for the actual repeated reader", side => {
    const subject = { ...card(42, () => [], "Mage"), costs: [energy(2)], spark: 5 };
    const source = card(43, () => [triggered(either(onDawn(), whenDissolved(characterYouControl({ subtype: "Mage" }))),
      p.sequence(p.gainEnergy(triggerSubjectCost()), p.gainPoints(triggerSubjectSpark())))]);
    const watch = card(44, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const starter = card(45, () => [activated([], p.sequence(p.gainSpark(mages, 4), p.dissolve(mages)))]);
    const w = world(side, [subject, source, watch, starter], { back: [subject.id, source.id, watch.id, starter.id] });
    const out = activate(w, w.ids[side].back[3]!);
    const done = drain(w, reload(sliceOf(out.state)).committed);
    expect(done.sides[side].currentEnergy).toBe(12);
    expect(done.sides[side].score).toBe(18);
  });

  it.each(SIDES)("keeps %s captured hand-copy action after its original watcher loses abilities", side => {
    const hand = { ...card(46, () => []), cardType: "event" as const };
    const source = card(47, () => [triggered(either(onDawn(), whenCopyTrigger("you", { cardType: "event" })),
      p.sequence(p.loseAllAbilities(self()), p.copyCard(triggeringCard())))]);
    const watch = card(48, () => [triggered(whenNamedAbilityTriggered("dawn"), p.repeatTriggeringAbility(), { oncePerTurn: true })]);
    const starter = card(49, () => [activated([], p.createCopyInHand(everyIn("hand", { cardType: "event" }), { ephemeral: true }))]);
    const w = world(side, [hand, source, watch, starter], { back: [source.id, watch.id, starter.id], hand: [hand.id] });
    const out = activate(w, w.ids[side].back[2]!);
    const done = drain(w, reload(sliceOf(out.state)).committed);
    expect(done.sides[side].hand).toHaveLength(4);
    const copies = done.sides[side].hand.map(id => done.instances[id]).filter(card => card.status.created);
    expect(copies).toHaveLength(3);
    expect(copies.every(copy => copy.printing.kind === "card" && copy.printing.cardId === hand.id && copy.status.ephemeral)).toBe(true);
  });

  it.each(SIDES)("keeps %s exact linked stay after departure before the repeat producer resolves", side => {
    const source = card(50, () => [triggered(onMaterialized(), p.lookAtTopBanish(1)), triggered(onDissolved(), p.putLinkedBanishedInHand())], "Mage");
    const leave = card(51, () => [triggered(whenNamedAbilityTriggered("materialized"), p.dissolve(mages), { oncePerTurn: true })]);
    const w = world(side, [source, leave, observer, force], { back: [source.id, leave.id, observer.id, force.id] });
    const out = activate(w, w.ids[side].back[3]!);
    const done = drain(w, reload(sliceOf(out.state)).committed);
    expect(done.sides[side].hand).toEqual(w.ids[side].deck.slice(0, 1));
    expect(done.sides[side].banished).toEqual(w.ids[side].deck.slice(1, 2));
    expect(done.turnLog.drawn[side]).toBe(0);
  });

});
