/** Optional event replacement route, composed payments, and atomic public fold recovery. */
import { describe, expect, it } from "vitest";
import { additionalCost, discardCost, energy, energyX, event, keyword, optionalCost, reclaim, staticAbility, x } from "../../../dsl/builders";
import { createFoldAdapter } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { isWellFormedPrompt } from "../../../prompts/structure";
import { stateHash } from "../../../state/hash";
import { SIDES, opponent, parseFigmentId } from "../../../state/ids";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { revealToBoth } from "../../../view/knowledge";
import { materializeFigments } from "../materialize-figments";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { playFromZone } from "../play-from-zone";
import { sequence } from "../sequence";
import { SIGN, applied, card, deck, restored, sliceOf, step, world } from "./rule-modifier-support";

const spell = card(0, draw(1));

describe("ruleModifier optional event route", () => {
  it.each(SIDES.flatMap(side => (["fast", "interrupt", "standard"] as const).map(speed => ({ side, speed }))))("offers the fixed base only for $side $speed events", ({ side, speed }) => {
    const subject = { ...spell, speed };
    const w = world(side, [subject], { [side]: { hand: [subject.id], dreamsigns: [SIGN.apple], energy: 1, deck } });
    const available = w.engine.legalActions(w.state, side).some(action => action.kind === "play" && action.card === w.ids[side].hand[0]);
    expect(available).toBe(speed !== "standard");
    if (available) {
      const result = step(w.engine, w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, [1]);
      expect(result.state.sides[side].currentEnergy).toBe(0);
      expect(result.state.instances[w.ids[side].hand[0]].status).toMatchObject({ offering: false, playedViaReclaim: false });
    }
  });
  it.each(SIDES)("keeps a cheaper normal route and idempotent copies for %s", side => {
    const subject = { ...spell, costs: [energy(0)] };
    const w = world(side, [subject], { [side]: { hand: [subject.id], dreamsigns: [SIGN.apple, SIGN.apple], energy: 3, deck } });
    const fold = createFoldAdapter(w.engine);
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(opened.slice)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseMode", options: [{ mode: 0, legal: true, route: "normal" }, { mode: 1, legal: true, route: "eventAlternative" }] });
    expect(isWellFormedPrompt(prompt)).toBe(true);
    const finished = applied(fold.reduce(opened.slice, { kind: "answer", side, promptId: prompt.id, value: 0 }));
    expect(finished.slice.committed.sides[side].currentEnergy).toBe(3);
    if (prompt.kind !== "chooseMode") throw new Error("Expected route choice");
    expect(promptFingerprint({ ...prompt, options: prompt.options.map(option => ({ ...option, route: "offering" })) })).not.toBe(promptFingerprint(prompt));
  });
  it.each(SIDES)("keeps Offering and the event alternative distinct for %s", side => {
    const subject = { ...spell, abilities: () => [keyword("offering"), event(draw(1))] };
    const w = world(side, [subject], { [side]: { hand: [subject.id, v.vanilla1.id], dreamsigns: [SIGN.apple], energy: 10, deck } });
    const result = step(w.engine, w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, [2]);
    expect(result.state.sides[side].currentEnergy).toBe(9);
    expect(result.state.sides[side].hand).toEqual([w.ids[side].hand[1]]);
    expect(result.state.instances[w.ids[side].hand[0]].status.offering).toBe(false);
  });
  it.each(SIDES.flatMap(side => (["void", "deck"] as const).map(from => ({ side, from }))))("uses independent $from access and consumes its allowance for $side", ({ side, from }) => {
    const permit = { ...v.vanilla1, id: syntheticId(0x236110), abilities: () => [staticAbility(playFromZone(from, { cardType: "event" }, { oncePerTurn: true }))] };
    const subject = { ...spell, abilities: () => [reclaim(energy(7)), event(draw(1))] };
    const w = world(side, [subject, permit], { [side]: { hand: [], void: from === "void" ? [subject.id] : [], deck: from === "deck" ? [subject.id, ...deck] : deck, back: [permit.id], dreamsigns: [SIGN.apple], energy: 10 } });
    const id = from === "void" ? w.ids[side].void[0] : w.ids[side].deck[0];
    if (from === "deck") revealToBoth(w.state, [id]);
    const result = step(w.engine, w.state, { kind: "play", card: id, from }, [from === "void" ? 2 : 1]);
    expect(result.state.sides[side].currentEnergy).toBe(9);
    expect(result.state.instances[id].status.playedViaReclaim).toBe(false);
    expect(result.state.oncePerTurn).toHaveLength(1);
  });
  it.each([false, true])("does not combine a Reclaim-only route with the rule (explicit=%s)", explicit => {
    const subject = { ...spell, abilities: () => [explicit ? reclaim(energy(7)) : keyword("reclaim"), event(draw(1))] };
    const w = world("player", [subject], { player: { void: [subject.id], dreamsigns: [SIGN.apple], energy: 1, deck } });
    expect(w.engine.legalActions(w.state, "player").some(action => action.kind === "play")).toBe(false);
  });
  it.each(SIDES)("fixes replaced energy-X to zero while retaining additional payments for %s", side => {
    const subject = { ...spell, costs: [energyX(0)], abilities: () => [additionalCost(energy(2), optionalCost(energy(3))), event(gainPoints(x()))] };
    const w = world(side, [subject]);
    const result = step(w.engine, w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, [1, true]);
    expect(result.state.sides[side].currentEnergy).toBe(14);
    const item = result.state.stack[0];
    expect(item).toMatchObject({ kind: "card", x: 0, optionalPaid: [true] });
  });
  it("leaves a separate additional count-X binding available", () => {
    const subject = { ...spell, abilities: () => [additionalCost({ cost: "discard", count: "x", filter: {}, min: 1 }), event(draw(x()))] };
    const w = world("player", [subject], { player: { hand: [subject.id, v.vanilla1.id, v.vanilla2.id], dreamsigns: [SIGN.apple], energy: 10, deck } });
    const result = step(w.engine, w.state, { kind: "play", card: w.ids.player.hand[0], from: "hand" }, [1, w.ids.player.hand.slice(1)]);
    expect(result.state.sides.player.currentEnergy).toBe(9);
    expect(result.state.stack[0]).toMatchObject({ x: 2 });
  });
  it("does not discount a Fast character or override a timing restriction", () => {
    const subject = { ...v.vanilla5, speed: "fast" as const };
    const w = world("player", [], { phase: "night", player: { hand: [subject.id], dreamsigns: [SIGN.apple], energy: 1, deck } });
    expect(w.engine.legalActions(w.state, "player").some(action => action.kind === "play")).toBe(false);
    const wrongWindow = world("player", [spell], { phase: "dusk" });
    expect(wrongWindow.engine.legalActions(wrongWindow.state, "player").some(action => action.kind === "play")).toBe(false);
  });
});

describe("ruleModifier transactional recovery", () => {
  function pending() {
    const subject = { ...spell, abilities: () => [additionalCost(discardCost()), event(draw(1))] };
    const w = world("player", [subject], { player: { hand: [subject.id, v.vanilla1.id, v.vanilla2.id], dreamsigns: [SIGN.apple], energy: 10, deck } });
    const fold = createFoldAdapter(w.engine);
    const opened = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side: "player", action: { kind: "play", card: w.ids.player.hand[0], from: "hand" } }));
    return { ...w, fold, opened };
  }
  it("persists route and cost prefixes, rejects stale/competing answers, and commits one payment", () => {
    const w = pending(), first = w.fold.pending(w.opened.slice)!.prompt;
    const before = stateHash(w.state);
    expect(stateHash(w.opened.slice.committed)).toBe(before);
    expect(w.fold.reduce(w.opened.slice, { kind: "answer", side: "enemy", promptId: first.id, value: 1 })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    expect(w.fold.reduce(w.opened.slice, { kind: "answer", side: "player", promptId: first.id, value: 99 })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
    expect(w.fold.reduce(w.opened.slice, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced", reason: "stepInFlight" });
    const selected = applied(w.fold.reduce(restored(w.opened.slice), { kind: "answer", side: "player", promptId: first.id, value: 1 }));
    expect(stateHash(selected.slice.committed)).toBe(before);
    const cost = w.fold.pending(selected.slice)!.prompt;
    expect(cost.kind).toBe("chooseCards");
    expect(w.fold.reduce(selected.slice, { kind: "answer", side: "player", promptId: first.id, value: 1 })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    const intent = { kind: "answer", side: "player", promptId: cost.id, value: [w.ids.player.hand[1]] } as const;
    const normal = applied(w.fold.reduce(selected.slice, intent));
    const resumed = applied(createFoldAdapter(w.engine).reduce(restored(selected.slice), intent));
    expect(stateHash(resumed.slice.committed)).toBe(stateHash(normal.slice.committed));
    expect(normal.slice.committed.sides.player.currentEnergy).toBe(9);
    expect(normal.published.filter(e => e.kind === "discarded")).toHaveLength(1);
    expect(w.fold.reduce(normal.slice, intent)).toMatchObject({ kind: "bounced" });
  });
  it("cancels either precommit route or additional-cost prompt without paying", () => {
    for (const afterRoute of [false, true]) {
      const w = pending();
      let slice = w.opened.slice;
      if (afterRoute) slice = applied(w.fold.reduce(slice, { kind: "answer", side: "player", promptId: w.fold.pending(slice)!.prompt.id, value: 1 })).slice;
      const cancelled = applied(w.fold.reduce(slice, { kind: "cancel", side: "player", promptId: w.fold.pending(slice)!.prompt.id }));
      expect(stateHash(cancelled.slice.committed)).toBe(stateHash(w.state));
      expect(cancelled.slice.inFlight).toBeNull();
    }
  });
  it("rolls back a real partial resolving write when a later instruction throws", () => {
    const bad = card(2, sequence(gainPoints(2), materializeFigments(parseFigmentId("00000000-0000-4000-8000-000000236999"))));
    const response = card(3, gainPoints(0), { speed: "interrupt", costs: [energy(0)] });
    const w = world("player", [bad, response], { player: { hand: [bad.id], dreamsigns: [SIGN.apple], energy: 20, deck }, enemy: { hand: [response.id], energy: 20, deck } });
    const cast = step(w.engine, w.state, { kind: "play", card: w.ids.player.hand[0], from: "hand" }, [1]);
    const fold = createFoldAdapter(w.engine), committed = sliceOf(cast.state), before = stateHash(cast.state);
    const result = fold.reduce(committed, { kind: "battleAction", side: opponent("player"), action: { kind: "pass" } });
    expect(result).toMatchObject({ kind: "applied", error: { kind: "engine_error" } });
    if (result.kind !== "applied") throw new Error("Expected handled engine error");
    expect(stateHash(result.slice.committed)).toBe(before);
    expect(result.slice.committed.sides.player.score).toBe(cast.state.sides.player.score);
  });
});
