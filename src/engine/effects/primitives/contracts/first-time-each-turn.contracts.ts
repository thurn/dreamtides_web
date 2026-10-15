/** Whole-turn first occasions, exact named siblings, recovery and fair knowledge. */
import { describe, expect, it } from "vitest";
import { activated, all, characterYouControl, everyIn, topOfDeck } from "../../../dsl/builders";
import { either, firstTimeEachTurn, onDawn, onMaterialized, triggered, whenHandBecomesEmpty, whenNamedAbilityTriggered } from "../../../dsl/triggers";
import { createFoldAdapter } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { discardCards } from "../../../rules/resources";
import { opponent, SIDES } from "../../../state/ids";
import { at, passUntil } from "../../../testing/trigger-harness";
import { comparableView } from "../../../testing/determinization-fidelity";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { applied, activate, card, decklists, drain, parseSaved, queued, sliceOf, step, v, world } from "./first-time-each-turn-support";
import * as p from "../index";
const mages = all(characterYouControl({ subtype: "Mage" }));
const emptyWatch = (n: number, ref: "you" | "opponent" = "you") => card(n, () => [triggered(firstTimeEachTurn(whenHandBecomesEmpty(ref)), p.gainPoints(1))]);
const namedWatch = (n: number) => card(n, () => [triggered(firstTimeEachTurn(whenNamedAbilityTriggered("materialized")), p.repeatTriggeringAbility())]);
const force = card(0, () => [activated([], p.triggerAbility(mages, "materialized"))]);
const root = card(1, () => [triggered(onMaterialized(), p.gainEnergy(1)), triggered(onMaterialized(), p.gainEnergy(3))], "Mage");
const refill = card(2, () => [activated([], p.sequence(p.discard(9), p.draw(1)))]);

describe("firstTimeEachTurn", () => {
  it("guards its two subjectless descriptor families and keeps flagged branches composable", () => {
    for (const trigger of [whenHandBecomesEmpty(), whenNamedAbilityTriggered("dawn", "opponent")]) {
      expect(firstTimeEachTurn(firstTimeEachTurn(trigger))).toEqual(firstTimeEachTurn(trigger));
    }
    for (const trigger of [onMaterialized(), either(whenHandBecomesEmpty(), onDawn())]) expect(() => firstTimeEachTurn(trigger)).toThrow();
  });

  it.each(SIDES)("shares the first %s hand occasion among copies and relative observers, then resets every turn", side => {
    const a = emptyWatch(3), b = emptyWatch(4), other = emptyWatch(5, "opponent");
    const w = world(side, [a, b, other, refill], { back: [a.id, b.id, refill.id], hand: [v.event0.id] }, { back: [other.id] });
    let state = drain(w, activate(w, w.state, w.ids[side].back[2]!).state);
    expect(state.sides[side].score).toBe(2);
    expect(state.sides[opponent(side)].score).toBe(1);
    state = drain(w, activate(w, state, w.ids[side].back[2]!).state);
    expect(state.sides[side].score).toBe(2);
    state = passUntil(w.engine, state, at(w.engine, opponent(side), "day"), NO_PROMPTS).state;
    state = passUntil(w.engine, state, at(w.engine, side, "day"), NO_PROMPTS).state;
    expect(drain(w, activate(w, state, w.ids[side].back[2]!).state).sides[side].score).toBe(4);
  });

  it.each(SIDES)("counts %s empty occasions before acquisition and while observers are ineligible", side => {
    for (const mode of ["absent", "condition", "disabled", "regain"] as const) {
      const watcher = card(6, () => [triggered(firstTimeEachTurn(whenHandBecomesEmpty()), p.gainPoints(1), mode === "condition" ? { condition: { cond: "energyAtLeast", amount: 9 } } : {})]);
      const changer = card(7, () => [activated([], p.sequence(
        ...(mode === "disabled" ? [p.disableTriggers(all(characterYouControl({ subtype: "Mage" })), "untilEndOfTurn")] : []),
        p.discard(9), p.draw(1),
        ...(mode === "absent" ? [p.materialize(everyIn("void", { subtype: "Mage" }))] : []),
        ...(mode === "condition" ? [p.gainEnergy(2)] : []),
        ...(mode === "regain" ? [p.returnToHand(mages), p.materialize(everyIn("hand", { subtype: "Mage" }))] : []),
      ))]);
      const mageWatch = { ...watcher, subtype: "Mage" as const };
      const w = world(side, [mageWatch, changer], { back: [...(mode === "absent" ? [] : [mageWatch.id]), changer.id], void: mode === "absent" ? [mageWatch.id] : [], hand: [v.vanilla1.id] });
      const first = activate(w, w.state, w.ids[side].back[mode === "absent" ? 0 : 1]!);
      expect(drain(w, first.state).sides[side].score).toBe(mode === "regain" ? 1 : 0);
      const second = activate(w, drain(w, first.state), w.ids[side].back[mode === "absent" ? 0 : 1]!);
      expect(drain(w, second.state).sides[side].score).toBe(mode === "regain" ? 1 : 0);
    }
  });

  it.each(SIDES)("repeats precisely the first admitted %s named sibling after the entire batch", side => {
    const watcher = namedWatch(8), w = world(side, [root, watcher, force], { back: [root.id, watcher.id, force.id] });
    const out = activate(w, w.state, w.ids[side].back[2]!);
    expect(queued(out.events).map(e => [e.source, e.ability])).toEqual([[w.ids[side].back[0], 0], [w.ids[side].back[0], 1], [w.ids[side].back[1], 0]]);
    const done = drain(w, out.state);
    expect(done.sides[side].currentEnergy).toBe(13);
    expect(drain(w, activate(w, done, w.ids[side].back[2]!).state).sides[side].currentEnergy).toBe(17);
  });

  it.each(SIDES)("records %s named admissions with no observer, independent of physical materialization", side => {
    const watcher = namedWatch(9), acquire = card(10, () => [activated([], p.materialize(everyIn("void", { subtype: "Explorer" })))]);
    const explorer = { ...watcher, subtype: "Explorer" as const };
    const w = world(side, [root, explorer, force, acquire], { back: [root.id, force.id, acquire.id], void: [explorer.id] });
    const first = drain(w, activate(w, w.state, w.ids[side].back[1]!).state);
    const gained = drain(w, activate(w, first, w.ids[side].back[2]!).state);
    expect(drain(w, activate(w, gained, w.ids[side].back[1]!).state).sides[side].currentEnergy).toBe(16);
    const vanilla = card(11, () => []), enter = card(12, () => [activated([], p.materialize(topOfDeck()))]);
    const control = world(side, [vanilla, root, watcher, force, enter], { back: [root.id, watcher.id, force.id, enter.id], deck: [vanilla.id, v.vanilla1.id] });
    const entered = drain(control, activate(control, control.state, control.ids[side].back[3]!).state);
    expect(drain(control, activate(control, entered, control.ids[side].back[2]!).state).sides[side].currentEnergy).toBe(13);
  });

  it("retains source-local oncePerTurn behavior as a distinct counterfactual", () => {
    for (const flagged of [true, false]) {
      const watch = card(13, () => [triggered(flagged ? firstTimeEachTurn(whenHandBecomesEmpty()) : whenHandBecomesEmpty(), p.gainPoints(1), { oncePerTurn: true, condition: { cond: "energyAtLeast", amount: 9 } })]);
      const changer = card(14, () => [activated([], p.sequence(p.discard(9), p.draw(1), p.gainEnergy(2)))]);
      const w = world("player", [watch, changer], { back: [watch.id, changer.id], hand: [v.vanilla1.id] });
      const first = drain(w, activate(w, w.state, w.ids.player.back[1]!).state);
      expect(drain(w, activate(w, first, w.ids.player.back[1]!).state).sides.player.score).toBe(flagged ? 0 : 1);
    }
  });

  it("lets an unrelated either branch trigger after the first branch is spent", () => {
    const watch = card(15, () => [triggered(either(firstTimeEachTurn(whenHandBecomesEmpty()), onDawn()), p.gainPoints(1))]);
    const w = world("player", [watch, refill], { back: [watch.id, refill.id], hand: [v.vanilla1.id] });
    const first = drain(w, activate(w, w.state, w.ids.player.back[1]!).state);
    const next = passUntil(w.engine, first, at(w.engine, "enemy", "day"), NO_PROMPTS).state;
    expect(passUntil(w.engine, next, at(w.engine, "player", "day"), NO_PROMPTS).state.sides.player.score).toBe(2);
  });

  it.each(SIDES)("consumes %s named first once across combined, floating, delayed and recursive admissions", side => {
    for (const mode of ["combined", "floating", "delayed", "recursive"] as const) {
      const watcher = namedWatch(16);
      const source = card(17, () => mode === "combined" ? [triggered(either(onMaterialized(), onDawn()), p.gainEnergy(1))]
        : mode === "recursive" ? [triggered(onMaterialized(), p.gainEnergy(1)), triggered(firstTimeEachTurn(whenNamedAbilityTriggered("materialized")), p.repeatTriggeringAbility())]
        : [activated([], mode === "floating" ? p.floating(onMaterialized(), p.gainEnergy(1)) : p.delayed(onMaterialized(), p.gainEnergy(1)))]);
      const enter = card(18, () => [activated([], p.rematerialize(all(characterYouControl({ subtype: "Warrior" }))))]);
      const w = world(side, [source, watcher, enter], { back: [source.id, watcher.id, enter.id] });
      const start = mode === "floating" || mode === "delayed" ? activate(w, w.state, w.ids[side].back[0]!).state : w.state;
      const out = activate(w, start, w.ids[side].back[2]!);
      const done = drain(w, out.state);
      expect(done.result).toBeNull();
      expect(done.sides[side].currentEnergy).toBe(8 + (mode === "delayed" ? 1 : mode === "recursive" ? 3 : 2));
    }
  });

  it.each(SIDES)("finishes a finite %s combined Dawn first-observer admission chain", side => {
    const source = card(33, () => [triggered(either(onDawn(), firstTimeEachTurn(whenNamedAbilityTriggered("dawn"))), p.gainEnergy(1))]);
    const w = world(side, [source], { back: [source.id] });
    const dawn = step(w, { ...w.state, turn: { ...w.state.turn, phase: "draw" } }, { kind: "advancePhase" });
    expect(dawn.state.result).toBeNull();
    expect(drain(w, dawn.state).sides[side].currentEnergy).toBe(10);
  });

  it.each(SIDES)("keeps the original %s once allowance and captured departed definition", side => {
    for (const once of [true, false]) {
      const source = card(19, () => [triggered(onMaterialized(), p.gainEnergy(1), { oncePerTurn: once })], "Mage");
      const leave = card(20, () => [triggered(whenNamedAbilityTriggered("materialized"), p.dissolve(mages), { oncePerTurn: true })]);
      const watch = namedWatch(21), w = world(side, [source, leave, watch, force], { back: [source.id, leave.id, watch.id, force.id] });
      const done = drain(w, activate(w, w.state, w.ids[side].back[3]!).state);
      expect(done.instances[w.ids[side].back[0]!].zone).toBe("void");
      expect(done.sides[side].currentEnergy).toBe(once ? 9 : 10);
    }
  });
});

describe("firstTimeEachTurn knowledge and continuation", () => {
  it.each(SIDES)("withholds wholly unseen %s named history and samples only proved facts", side => {
    const hidden = card(22, () => [triggered(onDawn(), p.gainEnergy(1), { zone: "any" })]);
    const w = world(side, [hidden], { deck: [v.vanilla1.id, hidden.id, v.vanilla2.id, v.vanilla3.id] });
    let state = passUntil(w.engine, w.state, at(w.engine, opponent(side), "day"), NO_PROMPTS).state;
    state = passUntil(w.engine, state, at(w.engine, side, "day"), NO_PROMPTS).state;
    const shown = w.engine.view(state, opponent(side));
    expect(shown.turnLog.firstOccurrences?.named[side]).toEqual([]);
    expect(w.engine.view(state, side).turnLog.firstOccurrences?.named[side]).toEqual([]);
    expect(JSON.stringify(shown)).not.toContain(hidden.id);
    const sampled = w.engine.determinize(shown, decklists(w), () => .2);
    expect(comparableView(w.engine.view(sampled, opponent(side)))).toEqual(comparableView(shown));
    // The sample can conservatively omit an admission nobody identified.
    expect(sampled.turnLog.firstOccurrences?.named[side]).toEqual([]);
  });

  it.each(SIDES)("learns a later public %s first observer, keeps the fact after hiding, and reloads its continuation", side => {
    const explorers = all(characterYouControl({ subtype: "Explorer" }));
    const hidden = card(23, () => [triggered(either(onMaterialized(), firstTimeEachTurn(whenHandBecomesEmpty())), p.sequence(p.materialize(topOfDeck()), p.returnToHand(explorers), p.shuffleInto([everyIn("hand", { subtype: "Explorer" })])), { zone: "any" })]);
    const watch = card(24, () => [triggered(firstTimeEachTurn(whenNamedAbilityTriggered("materialized")), p.optional(p.gainPoints(1)), { zone: "any" })], "Explorer");
    const w = world(side, [hidden, watch], { deck: [watch.id, hidden.id, v.vanilla2.id, v.vanilla3.id], hand: [v.event0.id] });
    const opened = step(w, w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }).state;
    expect(w.engine.view(opened, opponent(side)).turnLog.firstOccurrences?.named[side]).toEqual([]);
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const out = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const state = out.slice.committed;
    const shown = w.engine.view(state, opponent(side));
    expect(shown.turnLog.firstOccurrences?.named[side]).toContain("materialized");
    expect(shown.instances[w.ids[side].deck[0]]).toBeUndefined();
    expect(state.turnLog.dawnProgress).toBeUndefined();
    const pending = fold.pending(out.slice);
    expect(pending?.prompt.kind).toBe("confirm");
    const loaded = parseSaved(out.slice)!;
    const fresh = createFoldAdapter(w.engine, { checkEventPrefix: true });
    expect(fresh.pending(loaded)?.prompt).toEqual(pending?.prompt);
    const before = stateHash(loaded.committed);
    const done = applied(fresh.reduce(loaded, { kind: "answer", side, promptId: pending!.prompt.id, value: false }));
    expect(w.engine.view(done.slice.committed, opponent(side)).turnLog.firstOccurrences?.named[side]).toContain("materialized");
    expect(stateHash(loaded.committed)).toBe(before);
  });

  it.each(SIDES)("reloads %s first-only repeats, rejects foreign/stale/concurrent inputs and answers once", side => {
    const watch = card(25, () => [triggered(firstTimeEachTurn(whenNamedAbilityTriggered("materialized")), p.optional(p.repeatTriggeringAbility()))]);
    const w = world(side, [root, watch, force], { back: [root.id, watch.id, force.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "activate", source: w.ids[side].back[2]!, ability: 0 } }));
    const pending = fold.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("confirm");
    const loaded = parseSaved(opened.slice)!;
    const fresh = createFoldAdapter(w.engine, { checkEventPrefix: true });
    expect(fresh.pending(loaded)?.prompt).toEqual(pending.prompt);
    const before = stateHash(loaded.committed), accept = { kind: "answer", side, promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce(loaded, { ...accept, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...loaded, attempt: loaded.attempt + 1 }, accept)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const done = applied(fresh.reduce(loaded, accept));
    expect(done.slice.committed.sides[side].currentEnergy).toBe(13);
    expect(fresh.reduce(done.slice, accept)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(loaded.committed)).toBe(before);
    expect(w.engine.view(done.slice.committed, opponent(side)).turnLog.firstOccurrences?.named[side]).toContain("materialized");
  });

  it("replays a partially written first occasion once without mutating the input", () => {
    const watcher = emptyWatch(26);
    const missing = card(28, () => [activated([], p.sequence(p.discard(9), p.optional(p.draw(1))))]);
    const w = world("player", [watcher, missing], { back: [watcher.id, missing.id], hand: [v.vanilla1.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side: "player", action: { kind: "activate", source: w.ids.player.back[1]!, ability: 0 } }));
    const pending = fold.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(opened.slice.committed.turnLog.firstOccurrences).toBeUndefined();
    expect(pending.display.turnLog.firstOccurrences?.handEmptied.player).toBe(true);
    const loaded = parseSaved(opened.slice)!;
    const before = stateHash(loaded.committed);
    const stale = fold.reduce({ ...loaded, attempt: loaded.attempt + 1 }, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    expect(stale).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(stateHash(loaded.committed)).toBe(before);
    const done = applied(fold.reduce(loaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true }));
    expect(done.slice.committed.sides.player.score).toBe(1);
    expect(done.slice.committed.sides.player.hand).toHaveLength(1);
  });

  it.each(SIDES)("discards a genuine %s first-occasion mutation prefix on a late authored error", side => {
    const watcher = emptyWatch(27);
    const failing = { ...card(28, () => []), cardType: "event" as const, spark: null,
      synthetic: { resolve(ctx: import("../../../steps/types").StepContext) {
        discardCards(ctx, side, [...ctx.state.sides[side].hand]);
        throw new Error("after first occasion");
      } } };
    const w = world(side, [watcher, failing], { back: [watcher.id], hand: [failing.id, v.vanilla1.id] }, { hand: [v.interruptEvent.id] });
    const cast = w.engine.apply(w.state, side, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const before = stateHash(cast.state), events: import("../../../events").EngineEvent[] = [];
    expect(() => runStep(cast.state, { kind: "resolveTop" }, NO_PROMPTS, w.engine.catalog, { observeEvent: event => events.push(event) })).toThrow("after first occasion");
    expect(events.filter(event => event.kind === "handEmptied")).toHaveLength(1);
    expect(stateHash(cast.state)).toBe(before);
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const out = fold.reduce(sliceOf(cast.state), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } });
    if (out.kind !== "applied") throw new Error("Expected handled resolution failure");
    expect(out.error).not.toBeNull();
    expect(out.slice.committed.turnLog.firstOccurrences).toBeUndefined();
    expect(stateHash(out.slice.committed)).toBe(before);
  });

  it.each(SIDES)("cancels a real %s precommit prompt without consuming an empty occasion", side => {
    const watcher = emptyWatch(29);
    const cancel = { ...card(30, () => []), cardType: "event" as const, spark: null,
      synthetic: { play(ctx: import("../../../steps/types").StepContext, source: import("../../../state/ids").InstanceId) {
        ctx.choose({ kind: "confirm", side, purpose: { source, cardId: cancel.id, ability: 0, role: "youMay" } });
        return {};
      } } };
    const w = world(side, [watcher, cancel], { back: [watcher.id], hand: [cancel.id] });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const pending = fold.pending(opened.slice)!;
    expect(pending.prompt.cancellable).toBe(true);
    const loaded = parseSaved(opened.slice)!;
    const before = stateHash(loaded.committed);
    const done = applied(fold.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(done.slice.committed)).toBe(before);
    expect(done.slice.committed.turnLog.firstOccurrences).toBeUndefined();
    expect(done.slice.committed.triggerQueue).toEqual([]);
    expect(stateHash(loaded.committed)).toBe(before);
  });

  it.each(SIDES)("resets first occasions for an actual %s extra turn", side => {
    const watch = emptyWatch(31), extra = card(32, () => [activated([], p.takeExtraTurn())]);
    const w = world(side, [watch, refill, extra], { back: [watch.id, refill.id, extra.id], hand: [v.vanilla1.id] });
    let state = drain(w, activate(w, w.state, w.ids[side].back[1]!).state);
    expect(state.sides[side].score).toBe(1);
    state = drain(w, activate(w, state, w.ids[side].back[2]!).state);
    const turn = state.turn.turnNumber;
    state = passUntil(w.engine, state, next => next.turn.turnNumber > turn && at(w.engine, side, "day")(next), NO_PROMPTS).state;
    expect(state.turn.extra).toBe(true);
    expect(drain(w, activate(w, state, w.ids[side].back[1]!).state).sides[side].score).toBe(2);
  });

  it("validates bounded saved facts, accepts legacy absence and rejects duplicate/foreign knowledge", () => {
    const w = world("player", [root, force], { back: [root.id, force.id] });
    const state = drain(w, activate(w, w.state, w.ids.player.back[1]!).state);
    expect(parseSaved(sliceOf(state))).not.toBeNull();
    const legacy = JSON.parse(JSON.stringify(state)) as typeof state;
    delete legacy.turnLog.firstOccurrences;
    expect(parseSaved(sliceOf(legacy))).not.toBeNull();
    for (const corrupt of [
      { ...state.turnLog.firstOccurrences!, named: { player: ["materialized", "materialized"], enemy: [] } },
      { ...state.turnLog.firstOccurrences!, handEmptied: { player: false, enemy: false, foreign: true } },
      { ...state.turnLog.firstOccurrences!, known: { player: { player: ["night"], enemy: [] }, enemy: { player: [], enemy: [] } } },
    ]) {
      const bad = { ...state, turnLog: { ...state.turnLog, firstOccurrences: corrupt } };
      expect(parseSaved(sliceOf(bad as typeof state))).toBeNull();
    }
  });
});
