/** First-played physical membership, live static lifetime and existing atomic fold controls. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { activated, all, anyCharacter, characterYouControl, controls, enemyCharacter, energy, event, everyIn, optionalCost, additionalCost, self, stackItem, staticAbility, target } from "../../../dsl/builders";
import { triggered, triggeringCard, whenGainsSpark, whenMaterialize, whenCopyTrigger, whenYouPlay } from "../../../dsl/triggers";
import { createFoldAdapter } from "../../../fold/slice";
import { SIDES, opponent } from "../../../state/ids";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { NO_PROMPTS } from "../../../steps/sources";
import { randomLegalAnswer } from "../../../prompts/answers";
import type { AnswerSource } from "../../../steps/types";
import { runStep } from "../../../steps/runner";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";
import { activate, applied, card, cast, extra, hiddenWorld, publications, put, revive, setting, signId, slice, spark, subject, world } from "./first-played-spark-setter-support";

for (const side of SIDES) describe(`${side} firstPlayedSparkSetter`, () => {
  it("an emblem changes its actual first physical entry before watchers, with separate first-play payment", () => {
    const abilities = [...setting, triggered(whenMaterialize({ controller: "you", sparkAtMost: 0 }), p.gainPoints(1)), triggered(whenGainsSpark(), p.gainPoints(10))];
    const f = world(side, {}, {}, abilities), [first, second] = f.ids[side].hand;
    const hash = stateHash(f.state);
    expect(spark(f.engine, f.state, first)?.spark).toBe(5);
    for (let n = 0; n < 2; n++) expect(f.engine.legalActions(f.state, side)).toContainEqual({ kind: "play", card: first, from: "hand" });
    const stacked = f.engine.apply(f.state, side, { kind: "play", card: first, from: "hand" }, NO_PROMPTS);
    expect(stacked.state.instances[first].zone).toBe("stack");
    expect(spark(f.engine, stacked.state, first)).toMatchObject({ baseSpark: 5, spark: 5 });
    expect(stacked.state.sides[side].currentEnergy).toBe(29);
    const entered = cast(f.engine, f.state, side, first);
    expect(spark(f.engine, entered.state, first)).toMatchObject({ baseSpark: 0, spark: 0 });
    expect(entered.state.sides[side].score).toBe(1);
    expect(publications(entered.events)).toEqual([]);
    const later = cast(f.engine, entered.state, side, second);
    expect(later.state.sides[side].currentEnergy).toBe(26);
    expect(spark(f.engine, later.state, second)).toMatchObject({ baseSpark: 5, spark: 5 });
    expect(later.state.sides[side].score).toBe(1);
    expect(stateHash(f.state)).toBe(hash);
    expect(invariantViolations(later.state, f.engine.catalog)).toEqual([]);
  });

  it("preserves real gains and static additions above zero and normal newer base settings", () => {
    const anthem = card(10, [staticAbility(p.sparkModifier(all(characterYouControl()), 4))]);
    const laterBase = card(11, [staticAbility(p.setBaseSpark(all(characterYouControl()), 7))], { costs: [energy(0)] });
    const f = world(side, { back: [anthem.id], hand: [subject.id, laterBase.id] }, {}, [...setting,
      triggered(whenYouPlay({ cardType: "character" }), p.gainTriggeringCardSpark(triggeringCard(), 3))], [anthem, laterBase]);
    let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(spark(f.engine, state, f.ids[side].hand[0])).toMatchObject({ baseSpark: 0, spark: 7 });
    state = cast(f.engine, state, side, f.ids[side].hand[1]).state;
    expect(spark(f.engine, state, f.ids[side].hand[0])).toMatchObject({ baseSpark: 7, spark: 14 });
  });

  it("nonplayed materialization and an event do not select the first played character", () => {
    const f = world(side, { hand: [put.id, subject.id, subject.id] });
    // The actual event puts both hand characters into play without playing either.
    const made = cast(f.engine, f.state, side, f.ids[side].hand[0]);
    expect(made.events.filter(e => e.kind === "materialized")).toHaveLength(2);
    for (const id of f.ids[side].hand.slice(1)) expect(spark(f.engine, made.state, id)?.spark).toBe(5);
    const returned = activate(f.engine, made.state, side, f.ids[side].hand[1]);
    const played = cast(f.engine, returned, side, f.ids[side].hand[1]);
    expect(spark(f.engine, played.state, f.ids[side].hand[1])?.spark).toBe(0);
    expect(spark(f.engine, played.state, f.ids[side].hand[2])?.spark).toBe(5);
  });

  it("combines the settled original-entry gain with live base zero before watchers and through same-turn replay", () => {
    const f = world(side, {}, {}, [...setting, staticAbility(p.firstPlayedCharacterEntrySpark(1)),
      triggered(whenGainsSpark(), p.gainPoints(10)),
      triggered(whenMaterialize({ controller: "you", sparkAtLeast: 1, sparkAtMost: 1 }), p.gainPoints(1))]);
    const first = f.ids[side].hand[0], entered = cast(f.engine, f.state, side, first);
    expect(spark(f.engine, entered.state, first)).toMatchObject({ baseSpark: 0, spark: 1 });
    expect(entered.state.sides[side].score).toBe(11);
    expect(publications(entered.events)).toMatchObject([{ instance: first, amount: 1, entrySpark: { controller: side } }]);
    expect(entered.events.findIndex(e => e.kind === "sparkGained")).toBeLessThan(entered.events.findIndex(e => e.kind === "materialized"));
    const returned = activate(f.engine, entered.state, side, first);
    expect(spark(f.engine, returned, first)).toMatchObject({ baseSpark: 5, spark: 6 });
    const replayed = cast(f.engine, returned, side, first);
    expect(spark(f.engine, replayed.state, first)).toMatchObject({ baseSpark: 0, spark: 1 });
    expect(publications(replayed.events)).toEqual([]);
    expect(replayed.state.sides[side].score).toBe(12);
  });

  it("a real stack copy resolves first with ordinary spark and cannot occupy the played cohort", () => {
    const f = world(side, {}, {}, [...setting, triggered(whenYouPlay({ cardType: "character" }), p.copyCard(triggeringCard()))]);
    const first = f.ids[side].hand[0];
    const result = cast(f.engine, f.state, side, first);
    const copied = result.events.find(e => e.kind === "cardCopied");
    if (copied?.kind !== "cardCopied") throw new Error("Expected actual stack copy");
    expect(copied.copy).not.toBe(first);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([copied.copy, first]);
    expect(spark(f.engine, result.state, copied.copy)?.spark).toBe(5);
    expect(spark(f.engine, result.state, first)?.spark).toBe(0);
    expect(result.state.turnLog.played[side].map(e => e.instance)).toEqual([first]);
  });

  it("a Prevented first play stays first; later ordinary materialization finds that same physical card", () => {
    const prevent = card(12, [event(p.prevent(stackItem({ cardType: "character", controller: "opponent" })))], { cardType: "event", spark: null, speed: "interrupt", costs: [energy(0)] });
    const f = world(side, { hand: [subject.id, subject.id, revive.id] }, { hand: [prevent.id] }, setting, [prevent]);
    const [first, second, returner] = f.ids[side].hand;
    let state = f.engine.apply(f.state, side, { kind: "play", card: first, from: "hand" }, NO_PROMPTS).state;
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[0]).state;
    expect(state.instances[first].zone).toBe("void");
    expect(spark(f.engine, state, first)?.spark).toBe(5);
    state = cast(f.engine, state, side, second).state;
    expect(spark(f.engine, state, second)?.spark).toBe(5);
    state = cast(f.engine, state, side, returner).state;
    expect(spark(f.engine, state, first)?.spark).toBe(0);
  });

  it("same-turn departure/replay requalifies physically and source removal/restoration stays live", () => {
    const provider = v.firstPlayedSparkSetter;
    const f = world(side, { dreamsigns: [], back: [provider.id], hand: [subject.id, subject.id] });
    const source = f.ids[side].back[0]!, first = f.ids[side].hand[0];
    let state = cast(f.engine, f.state, side, first).state;
    state = activate(f.engine, state, side, first);
    expect(spark(f.engine, state, first)?.spark).toBe(5);
    state = cast(f.engine, state, side, first).state;
    expect(spark(f.engine, state, first)?.spark).toBe(0);
    state = activate(f.engine, state, side, source, 2);
    expect(spark(f.engine, state, first)?.spark).toBe(5);
    state = cast(f.engine, state, side, source).state;
    expect(spark(f.engine, state, first)?.spark).toBe(0);
    expect(spark(f.engine, state, source)?.spark).toBe(1);
    expect(spark(f.engine, state, f.ids[side].hand[1])?.cost).toBe(3);
  });

  it("a source arriving late selects the earlier first play and a live condition can stop and restore it", () => {
    const provider = card(13, [staticAbility(p.firstPlayedSparkSetter(0), { while: controls(characterYouControl(), 3) }), activated([], p.returnToHand(self()))], { costs: [energy(0)] });
    const f = world(side, { dreamsigns: [], back: [subject.id], hand: [subject.id, provider.id] }, {}, setting, [provider]);
    const first = f.ids[side].hand[0], source = f.ids[side].hand[1];
    let state = cast(f.engine, f.state, side, first).state;
    expect(spark(f.engine, state, first)?.spark).toBe(5);
    state = cast(f.engine, state, side, source).state;
    expect(spark(f.engine, state, first)?.spark).toBe(0);
    state = activate(f.engine, state, side, f.ids[side].back[0]!);
    expect(state.instances[source].zone).toBe("play");
    expect(spark(f.engine, state, first)?.spark).toBe(5);
    state = cast(f.engine, state, side, f.ids[side].back[0]!).state;
    expect(spark(f.engine, state, first)?.spark).toBe(0);
  });

  it("a ceased first physical card never promotes the second actual play", () => {
    const maker = card(18, [event(p.createCard(subject.id))], { cardType: "event", spark: null, costs: [energy(0)] });
    const prevent = card(19, [event(p.prevent(stackItem({ cardType: "character", controller: "opponent" })))], { cardType: "event", spark: null, speed: "interrupt", costs: [energy(0)] });
    const f = world(side, { hand: [maker.id, subject.id] }, { hand: [prevent.id] }, setting, [maker, prevent]);
    let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    const created = state.sides[side].hand.find(id => !f.ids[side].hand.includes(id));
    if (created === undefined) throw new Error("Expected actual created hand card");
    state = f.engine.apply(state, side, { kind: "play", card: created, from: "hand" }, NO_PROMPTS).state;
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[0]).state;
    expect(state.instances[created]).toBeUndefined();
    for (const viewer of SIDES) expect(f.engine.view(state, viewer).turnLog.played[side].find(r => r.cardType === "character")?.firstCharacterMember).toBeNull();
    state = cast(f.engine, state, side, f.ids[side].hand[1]).state;
    expect(state.turnLog.played[side].filter(r => r.cardType === "character").map(r => r.instance)).toEqual([created, f.ids[side].hand[1]]);
    expect(spark(f.engine, state, f.ids[side].hand[1])?.spark).toBe(5);
  });

  it("losing the source ability ends the setting without changing the first-play history", () => {
    const lose = card(20, [event(p.loseAllAbilities(target(anyCharacter())))], { cardType: "event", spark: null, costs: [energy(0)] });
    const f = world(side, { dreamsigns: [], back: [v.firstPlayedSparkSetter.id], hand: [subject.id, lose.id] }, {}, setting, [lose]);
    let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(spark(f.engine, state, f.ids[side].hand[0])?.spark).toBe(0);
    state = cast(f.engine, state, side, f.ids[side].hand[1], { answer: () => [f.ids[side].back[0]!] }).state;
    expect(spark(f.engine, state, f.ids[side].hand[0])?.spark).toBe(5);
    expect(state.turnLog.played[side].find(r => r.cardType === "character")?.instance).toBe(f.ids[side].hand[0]);
  });

  it("a source control change selects its new controller's first play in the same turn", () => {
    const fast = card(21, [], { speed: "fast" });
    const steal = card(22, [event(p.gainControl(target(enemyCharacter())))], { cardType: "event", spark: null, speed: "fast", costs: [energy(0)] });
    const f = world(side, { dreamsigns: [], back: [v.firstPlayedSparkSetter.id], hand: [subject.id] }, { hand: [fast.id, steal.id] }, setting, [fast, steal]);
    const source = f.ids[side].back[0]!, first = f.ids[side].hand[0];
    let state = cast(f.engine, f.state, side, first).state;
    state = passUntil(f.engine, state, at(f.engine, side, "dusk")).state;
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[0]).state;
    expect(spark(f.engine, state, f.ids[opponent(side)].hand[0])?.spark).toBe(5);
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[1], { answer: () => [source] }).state;
    expect(spark(f.engine, state, first)?.spark).toBe(5);
    expect(spark(f.engine, state, f.ids[opponent(side)].hand[0])?.spark).toBe(0);
  });

  it("two held sources set zero idempotently and independently reduce only the first payment", () => {
    const f = world(side, { dreamsigns: [signId, signId] });
    let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(state.sides[side].currentEnergy).toBe(30);
    expect(spark(f.engine, state, f.ids[side].hand[0])).toMatchObject({ baseSpark: 0, spark: 0 });
    state = cast(f.engine, state, side, f.ids[side].hand[1]).state;
    expect(state.sides[side].currentEnergy).toBe(27);
    expect(spark(f.engine, state, f.ids[side].hand[1])?.spark).toBe(5);
  });

  it("each ordinary and extra global turn resets both controllers, including opponent-turn plays", () => {
    const fast = card(14, [], { speed: "fast" });
    const f = world(side, { hand: [subject.id, extra.id, subject.id] }, { dreamsigns: [signId], hand: [fast.id, fast.id] }, setting, [fast]);
    let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    state = passUntil(f.engine, state, at(f.engine, side, "dusk")).state;
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[0]).state;
    expect(spark(f.engine, state, f.ids[opponent(side)].hand[0])?.spark).toBe(0);
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[1]).state;
    expect(spark(f.engine, state, f.ids[opponent(side)].hand[1])?.spark).toBe(5);
    const turn = state.turn.turnNumber;
    state = passUntil(f.engine, state, s => s.turn.turnNumber > turn && s.turn.phase === "day").state;
    for (const id of [f.ids[side].hand[0], ...f.ids[opponent(side)].hand]) expect(spark(f.engine, state, id)?.spark).toBe(5);
    state = passUntil(f.engine, state, at(f.engine, side, "day")).state;
    state = cast(f.engine, state, side, f.ids[side].hand[1]).state;
    const beforeExtra = state.turn.turnNumber;
    state = passUntil(f.engine, state, s => s.turn.turnNumber > beforeExtra && s.turn.active === side && s.turn.phase === "day").state;
    expect(state.turn.turnNumber).toBe(beforeExtra + 1);
    state = cast(f.engine, state, side, f.ids[side].hand[2]).state;
    expect(spark(f.engine, state, f.ids[side].hand[2])?.spark).toBe(0);
  });

  it("a changed subject controller does not erase who actually played it", () => {
    const steal = card(15, [event(p.gainControl(target(enemyCharacter())))], { cardType: "event", spark: null, speed: "interrupt", costs: [energy(0)] });
    const f = world(side, {}, { hand: [steal.id] }, setting, [steal]);
    let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    state = passUntil(f.engine, state, at(f.engine, side, "dusk")).state;
    state = cast(f.engine, state, opponent(side), f.ids[opponent(side)].hand[0], { answer: () => [f.ids[side].hand[0]] }).state;
    expect(state.instances[f.ids[side].hand[0]].controller).toBe(opponent(side));
    expect(spark(f.engine, state, f.ids[side].hand[0])?.spark).toBe(0);
  });

  it("reload and both observer reconstructions preserve the actual first physical member", () => {
    const f = world(side), id = f.ids[side].hand[0];
    const state = cast(f.engine, f.state, side, id).state;
    const loaded = deserializeState(serializeState(state));
    expect(stateHash(loaded)).toBe(stateHash(state));
    for (const viewer of SIDES) {
      const shown = f.engine.view(loaded, viewer);
      const cards = (owner: typeof side) => Object.values(loaded.instances).filter(i => i.owner === owner && i.printing.kind === "card").map(i => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : subject.id, ...i.variant }));
      const lists = { player: cards("player"), enemy: cards("enemy") };
      const restored = f.engine.determinize(shown, lists, () => 0.5);
      expect(f.engine.view(restored, viewer).instances[id]?.characteristics.spark).toBe(0);
      expect(f.engine.view(restored, viewer).turnLog.played[side][0]?.instance).toBe(id);
    }
    expect(spark(f.engine, cast(f.engine, loaded, side, f.ids[side].hand[1]).state, f.ids[side].hand[1])?.spark).toBe(5);
  });

  it.each(["saved", "player", "enemy"] as const)("hidden singleton first-card continuation retains physical membership after %s reconstruction", viewer => {
    const shuffle = card(23, [event(p.shuffleInto([everyIn("hand", { cardType: "character" })]))], { cardType: "event", spark: null, costs: [energy(0)] });
    const draw = card(24, [event(p.draw(1))], { cardType: "event", spark: null, costs: [energy(0)] });
    const reveal = card(25, [event(p.reveal("you"))], { cardType: "event", spark: null, costs: [energy(0)] });
    const f = world(side, { hand: [reveal.id, subject.id, shuffle.id, draw.id], deck: [] }, {}, setting, [shuffle, draw, reveal]);
    let hidden = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    hidden = cast(f.engine, hidden, side, f.ids[side].hand[1]).state;
    hidden = activate(f.engine, hidden, side, f.ids[side].hand[1]);
    hidden = cast(f.engine, hidden, side, f.ids[side].hand[2]).state;
    expect(hidden.sides[side].deck).toEqual([f.ids[side].hand[1]]);
    const cards = (owner: typeof side) => Object.values(hidden.instances).filter(i => i.owner === owner && i.printing.kind === "card").map(i => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : subject.id, ...i.variant }));
    const lists = { player: cards("player"), enemy: cards("enemy") };
    const state = viewer === "saved" ? deserializeState(serializeState(hidden)) : f.engine.determinize(f.engine.view(hidden, viewer), lists, () => 0.5);
    const first = state.sides[side].deck[0];
    const drawId = state.sides[side].hand.find(id => { const printing = state.instances[id].printing; return printing.kind === "card" && printing.cardId === draw.id; });
    if (drawId === undefined) throw new Error("Missing publicly revealed actual draw card");
    const drawn = cast(f.engine, state, side, drawId).state;
    const replayed = cast(f.engine, drawn, side, first).state;
    expect(spark(f.engine, replayed, first)?.spark).toBe(0);
  });

  it.each(SIDES)("anonymous first-member aliases distinguish equal-printing physical decoys for viewer %s", viewer => {
    const f = hiddenWorld(side, 1), shown = f.engine.view(f.state, viewer);
    const first = shown.turnLog.played[side].find(r => r.cardType === "character");
    expect(first?.instance).toBeNull();
    expect(typeof first?.firstCharacterMember).toBe("number");
    expect(JSON.stringify(shown).includes(JSON.stringify(f.first))).toBe(false);
    const restored = f.engine.determinize(shown, f.lists, () => 0.5);
    expect(f.engine.view(restored, viewer)).toEqual(shown);
    const selected = restored.turnLog.played[side].find(r => r.cardType === "character")!.instance;
    expect(restored.sides[side].deck).toContain(selected);
    const drawId = restored.sides[side].hand.find(id => { const printing = restored.instances[id].printing; return printing.kind === "card" && printing.cardId === f.draw.id; })!;
    let state = cast(f.engine, restored, side, drawId).state;
    const characters = [...state.sides[side].hand];
    expect(characters).toHaveLength(2);
    for (const id of characters) state = cast(f.engine, state, side, id).state;
    for (const id of characters) expect(spark(f.engine, state, id)?.spark).toBe(id === selected ? 0 : 5);
  });

  it.each(SIDES)("malformed first-member references reject and legacy absence stays unbound for viewer %s", viewer => {
    const f = hiddenWorld(side), shown = f.engine.view(f.state, viewer);
    const first = shown.turnLog.played[side].findIndex(r => r.cardType === "character");
    const member = shown.turnLog.played[side][first].firstCharacterMember;
    if (typeof member !== "number") throw new Error("Expected public anonymous relation");
    const modified = (index: number, change: Partial<typeof shown.turnLog.played.player[number]>) => ({ ...shown,
      turnLog: { ...shown.turnLog, played: { ...shown.turnLog.played, [side]: shown.turnLog.played[side].map((record, i) => i === index ? { ...record, ...change } : record) } } });
    for (const bad of [-1, 0.5, 100000]) expect(() => f.engine.determinize(modified(first, { firstCharacterMember: bad }), f.lists, () => 0.5)).toThrow();
    expect(() => f.engine.determinize(modified(0, { firstCharacterMember: member }), f.lists, () => 0.5)).toThrow();
    expect(() => f.engine.determinize(modified(first, { instance: f.first }), f.lists, () => 0.5)).toThrow();
    expect(() => f.engine.determinize(modified(first, { copiable: { printing: { kind: "card", cardId: f.draw.id }, variant: { amplified: false } } }), f.lists, () => 0.5)).toThrow();
    const descriptor = shown.hiddenCards?.[side]?.find(d => d.member === member);
    if (descriptor === undefined) throw new Error("Expected existing remembered descriptor");
    const duplicate = { ...shown, hiddenCards: { player: shown.hiddenCards?.player ?? [], enemy: shown.hiddenCards?.enemy ?? [], [side]: [...shown.hiddenCards![side], descriptor] } };
    expect(() => f.engine.determinize(duplicate, f.lists, () => 0.5)).toThrow();
    const legacy = { ...shown, turnLog: { ...shown.turnLog, played: { ...shown.turnLog.played,
      [side]: shown.turnLog.played[side].map(({ firstCharacterMember: _member, ...record }) => record) } } };
    const restored = f.engine.determinize(legacy, f.lists, () => 0.5);
    expect(f.engine.view(restored, viewer).turnLog.played[side].filter(r => r.cardType === "character")).toHaveLength(1);
    expect(f.engine.view(restored, viewer).turnLog.played[side].find(r => r.cardType === "character")?.firstCharacterMember).toBeNull();
  });

  it.each(SIDES)("keeps hidden first-character membership distinct from the current first-event occurrence for viewer %s", viewer => {
    const reveal = card(42, [event(p.reveal("you"))], { cardType: "event", spark: null, costs: [energy(0)] });
    const conceal = card(43, [event(p.shuffleInto([everyIn("hand", { cardType: "character" }), everyIn("void")]))], { cardType: "event", spark: null, costs: [energy(0)] });
    const draw = card(44, [event(p.draw(2))], { cardType: "event", spark: null, costs: [energy(0)] });
    const f = world(side, { hand: [reveal.id, subject.id, conceal.id, draw.id], deck: [] }, {}, setting, [reveal, conceal, draw]);
    let hidden = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    hidden = cast(f.engine, hidden, side, f.ids[side].hand[1]).state;
    hidden = activate(f.engine, hidden, side, f.ids[side].hand[1]);
    hidden = cast(f.engine, hidden, side, f.ids[side].hand[2]).state;
    const cards = (owner: typeof side) => Object.values(hidden.instances).filter(i => i.owner === owner && i.printing.kind === "card").map(i => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : subject.id, ...i.variant }));
    const lists = { player: cards("player"), enemy: cards("enemy") }, seen = f.engine.view(hidden, viewer);
    expect(seen.firstEventHistory!.current![side]!.instance).toBeNull();
    const sampled = f.engine.determinize(seen, lists, () => 0.5);
    expect(f.engine.view(sampled, viewer)).toEqual(seen);
    const eventId = sampled.turnLog.played[side].find(r => r.cardType === "event")!.instance;
    const characterId = sampled.turnLog.played[side].find(r => r.cardType === "character")!.instance;
    expect(sampled.firstEventHistory!.current![side]!.instance).toBe(eventId);
    expect(sampled.instances[eventId]).toBeUndefined();
    expect(sampled.sides[side].deck).toContain(characterId);
    expect(characterId).not.toBe(eventId);
    const loaded = deserializeState(serializeState(sampled));
    expect(parseEngineBattleFold({ init: { seed: loaded.seed, scoreToWin: 100, decks: lists, dreamwell: [],
      dreamsigns: { player: loaded.sides.player.dreamsigns.map(s => s.id), enemy: loaded.sides.enemy.dreamsigns.map(s => s.id) } }, slice: slice(loaded) }, f.engine.catalog)).not.toBeNull();
    const drawId = loaded.sides[side].hand.find(id => { const printing = loaded.instances[id].printing; return printing.kind === "card" && printing.cardId === draw.id; })!;
    const drawn = cast(f.engine, loaded, side, drawId).state;
    const replayed = cast(f.engine, drawn, side, characterId).state;
    expect(spark(f.engine, replayed, characterId).spark).toBe(0);
    expect(replayed.firstEventHistory!.current![side]!.instance).toBe(eventId);
  });

  it.each([false, true])("keeps mandatory modal event-copy renewal with the static held=%s", held => {
    const modal = card(40, [event(p.chooseOne(p.gainPoints(0), p.gainEnergy(0)))], { cardType: "event", spark: null, costs: [energy(0)] });
    const abilities = [triggered(whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard())),
      triggered(whenCopyTrigger("you", { cardType: "event" }), p.copyCard(triggeringCard())), ...(held ? setting : [])];
    const f = world(side, { hand: [subject.id, modal.id] }, {}, abilities, [modal]);
    const first = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    expect(spark(f.engine, first, f.ids[side].hand[0]).spark).toBe(held ? 0 : 5);
    const initial = { ...first, config: { ...first.config, mandatoryLoopCheckFrom: 8, mandatoryLoopWindow: 16, resolutionCap: 32 } };
    let answers = 0;
    const source: AnswerSource = { answer(prompt) {
      if (++answers > 64) throw new Error("Public modal-copy witness exceeded its finite answer budget");
      return randomLegalAnswer(prompt, () => 0.25);
    } };
    const result = f.engine.apply(initial, side, { kind: "play", card: f.ids[side].hand[1], from: "hand" }, source);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.answers.some(answer => answer.auto !== true)).toBe(true);
    expect(result.state.turn).toEqual(initial.turn);
    expect(result.state.turnLog.played[side].map(record => record.instance)).toEqual(f.ids[side].hand);
    expect(spark(f.engine, result.state, f.ids[side].hand[0]).spark).toBe(held ? 0 : 5);
    expect(result.events.some(e => e.kind === "resolved" || e.kind === "materialized")).toBe(false);
  });

  it("keeps an optional copy renewal as a genuine stopping choice with the static", () => {
    const modal = card(41, [event(p.chooseOne(p.gainPoints(0), p.gainEnergy(0)))], { cardType: "event", spark: null, costs: [energy(0)] });
    const f = world(side, { hand: [subject.id, modal.id] }, {}, [...setting,
      triggered(whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard())),
      triggered(whenCopyTrigger("you", { cardType: "event" }), p.optional(p.copyCard(triggeringCard())))], [modal]);
    const first = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
    const initial = { ...first, config: { ...first.config, mandatoryLoopCheckFrom: 1, resolutionCap: 32 } };
    const result = f.engine.apply(initial, side, { kind: "play", card: f.ids[side].hand[1], from: "hand" }, {
      answer: prompt => prompt.kind === "confirm" ? false : randomLegalAnswer(prompt, () => 0.25),
    });
    expect(result.state.result).toBeNull();
    expect(result.state.triggerQueue).toEqual([]);
    expect(result.events.filter(e => e.kind === "cardCopied")).toHaveLength(1);
    expect(result.answers.some(answer => answer.value === false && answer.auto !== true)).toBe(true);
    expect(spark(f.engine, result.state, f.ids[side].hand[0]).spark).toBe(0);
  });

  it("cancel, reload, stale and competing answers preserve the untouched first-play boundary", () => {
    const chosen = card(16, [additionalCost(optionalCost(energy(1)))], { costs: [energy(3)] });
    const f = world(side, { hand: [chosen.id, subject.id] }, {}, setting, [chosen]);
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true }), before = slice(f.state), hash = stateHash(f.state);
    const intent = { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } } as const;
    expect(fold.reduce(before, { ...intent, side: opponent(side) }).kind).toBe("bounced");
    const pending = applied(fold.reduce(before, intent)), prompt = fold.pending(pending)?.prompt;
    if (prompt === undefined) throw new Error("Expected optional-payment prompt");
    expect(stateHash(pending.committed)).toBe(hash);
    const reloaded = JSON.parse(JSON.stringify(pending)) as typeof pending;
    expect(createFoldAdapter(f.engine).pending(reloaded)?.prompt.id).toBe(prompt.id);
    expect(fold.reduce(reloaded, { kind: "answer", side: opponent(side), promptId: prompt.id, value: true }).kind).toBe("bounced");
    const cancelled = applied(fold.reduce(reloaded, { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(hash);
    const retried = applied(fold.reduce(cancelled, intent)), current = fold.pending(retried)?.prompt;
    if (current === undefined) throw new Error("Expected fresh payment prompt");
    expect(fold.reduce(retried, { kind: "answer", side, promptId: prompt.id, value: true }).kind).toBe("bounced");
    const accepted = applied(fold.reduce(retried, { kind: "answer", side, promptId: current.id, value: false }));
    expect(fold.reduce(accepted, { kind: "answer", side, promptId: current.id, value: true }).kind).toBe("bounced");
    expect(accepted.committed.turnLog.played[side].map(r => r.instance)).toEqual([f.ids[side].hand[0]]);
    expect(stateHash(f.state)).toBe(hash);
  });

  it("unaffordable and full-capacity failures consume no first play or spark change", () => {
    for (const mine of [{ energy: 0 }, { back: Array.from({ length: 10 }, () => v.vanilla0.id) }]) {
      const f = world(side, mine), before = stateHash(f.state);
      const action = { kind: "play", card: f.ids[side].hand[0], from: "hand" } as const;
      expect(f.engine.legalActions(f.state, side)).not.toContainEqual(action);
      expect(createFoldAdapter(f.engine).reduce(slice(f.state), { kind: "battleAction", side, action }).kind).toBe("bounced");
      expect(stateHash(f.state)).toBe(before);
      expect(f.state.turnLog.played[side]).toEqual([]);
      expect(spark(f.engine, f.state, f.ids[side].hand[0])?.spark).toBe(5);
    }
  });

  it("failed partial resolution publishes no derived setting and leaves the real play intact", () => {
    const failure = card(17, [], { synthetic: { resolve() { throw new Error("Synthetic entry failure"); } } });
    const f = world(side, { hand: [failure.id, subject.id] }, {}, setting, [failure]);
    const played = runStep(f.state, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS, f.engine.catalog);
    if (played.kind !== "done") throw new Error("Unexpected prompt");
    const fold = createFoldAdapter(f.engine), before = stateHash(played.state);
    const outcome = fold.reduce(slice(played.state), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("Expected actual resolution error");
    expect(stateHash(outcome.slice.committed)).toBe(before);
    expect(outcome.published.filter(e => e.kind === "materialized")).toEqual([]);
    expect(spark(f.engine, outcome.slice.committed, f.ids[side].hand[0])?.spark).toBe(5);
    expect(outcome.slice.committed.turnLog.played[side]).toHaveLength(1);
  });
});
