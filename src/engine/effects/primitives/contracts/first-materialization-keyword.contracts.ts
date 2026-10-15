/** First actual materialization has its keyword before public entry observers run. */
import { describe, expect, it } from "vitest";
import { eventLogRecords } from "../../../log";
import { parseDreamsignId } from "../../../../types/identifiers";
import { energy, event, staticAbility } from "../../../dsl/builders";
import { triggered, triggeringCard, whenYouPlay, whenCopyTrigger } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { nextAutomaticStep } from "../../../steps/driver";
import { runStep } from "../../../steps/runner";
import { boardState } from "../../../testing/board";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { firstMaterializationKeyword } from "../first-materialization-keyword";
import { copyCard } from "../copy-card";
import { gainPoints } from "../gain-points";
import { ruleModifier } from "../rule-modifier";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES } from "../../../state/ids";
import { materializedThisTurn } from "../../../rules/turn-log";
import { createFoldAdapter } from "../../../fold/slice";
import { NO_PROMPTS } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { passUntil } from "../../../testing/trigger-harness";
import { cards, engine, fast, grants, keyword, play, provider, signId, v, watcher, world } from "./first-materialization-keyword-support";

for (const side of SIDES) describe(`${side} first materialization`, () => {
  it("grants before readiness watchers, counts actual entry rather than setup or event plays, and leaves second exhausted", () => {
    const b = world(side, [cards.draw.id, v.vanilla0.id, v.vanilla0.id], { back: [watcher.id] });
    const before = stateHash(b.state);
    const empty = play(b.state, side, b.ids[side].hand[0]);
    expect(grants(empty.state)).toEqual([]);
    const first = play(empty.state, side, b.ids[side].hand[1]);
    const second = play(first.state, side, b.ids[side].hand[2]);
    expect(stateHash(b.state)).toBe(before);
    expect(materializedThisTurn(second.state, side).map(record => record.instance)).toEqual(b.ids[side].hand.slice(1));
    expect(first.state.instances[b.ids[side].hand[1]].status.exhausted).toBe(false);
    expect(second.state.instances[b.ids[side].hand[2]].status.exhausted).toBe(true);
    expect(keyword(second.state, b.ids[side].hand[1])).toBe(true);
    expect(keyword(second.state, b.ids[side].hand[2])).toBe(false);
    expect(second.state.sides[side].score).toBe(11);
    const announced = first.events.findIndex(e => e.kind === "materialized");
    const started = first.events.findIndex(e => e.kind === "effectStarted" && e.change.kind === "firstMaterializationKeyword");
    expect(started).toBeGreaterThanOrEqual(0);
    expect(started).toBeLessThan(announced);
    expect(first.events[started]).toMatchObject({ source: { kind: "dreamsign", side, index: 0 }, expiry: { at: "never" },
      change: { player: side, instance: b.ids[side].hand[1], keyword: "awakened" } });
    expect(invariantViolations(second.state, engine.catalog)).toEqual([]);
  });

  it("persists the actual first physical grant and its source, never a second grant", () => {
    const b = world(side, [v.vanilla0.id, v.vanilla0.id]);
    const first = play(b.state, side, b.ids[side].hand[0]);
    const second = play(first.state, side, b.ids[side].hand[1]);
    const records = eventLogRecords(first.events, b.state.version).filter(record => record.event === "engine.firstMaterializationKeyword");
    expect(records).toHaveLength(1);
    const actual = first.events.find(e => e.kind === "effectStarted" && e.change.kind === "firstMaterializationKeyword");
    expect(records[0]).toEqual({ event: "engine.firstMaterializationKeyword", version: b.state.version, detail: actual });
    expect(records[0].detail).toMatchObject({ controller: side, source: { kind: "dreamsign", side, index: 0 }, expiry: { at: "never" },
      change: { player: side, instance: b.ids[side].hand[0], keyword: "awakened" } });
    expect(JSON.parse(JSON.stringify(records))).toEqual(records);
    expect(eventLogRecords(second.events, first.state.version).filter(record => record.event === "engine.firstMaterializationKeyword")).toEqual([]);
  });

  it("an already Awakened first character consumes the first occasion", () => {
    const b = world(side, [v.awakened2.id, v.vanilla0.id]);
    const first = play(b.state, side, b.ids[side].hand[0]);
    const second = play(first.state, side, b.ids[side].hand[1]);
    expect(second.state.instances[b.ids[side].hand[1]].status.exhausted).toBe(true);
    expect(grants(second.state).map(e => e.change.instance)).toEqual([b.ids[side].hand[0]]);
  });

  it.each(["hand", "deck", "void", "figments", "copy", "create"] as const)("covers the actual %s route and ordered batched entries", route => {
    const b = world(side, [cards[route].id, ...(route === "hand" ? [v.vanilla0.id, v.vanilla0.id] : [])], {
      back: route === "copy" ? [v.vanilla0.id] : [], void: route === "void" ? [v.vanilla0.id, v.vanilla0.id] : [],
    });
    const out = play(b.state, side, b.ids[side].hand[0]);
    const entered = out.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
    expect(entered.length).toBeGreaterThan(0);
    expect(grants(out.state).map(e => e.change.instance)).toEqual([entered[0]]);
    expect(out.state.instances[entered[0]].status.exhausted).toBe(false);
    for (const id of entered.slice(1)) {
      expect(out.state.instances[id].status.exhausted).toBe(true);
      expect(keyword(out.state, id)).toBe(false);
    }
    expect(materializedThisTurn(out.state, side).map(e => e.instance)).toEqual(entered);
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
  });

  it("a first rematerialization gains the keyword without awakening and excludes the later true entry", () => {
    const b = world(side, [cards.sleep.id, cards.again.id, v.vanilla0.id], { back: [v.vanilla0.id] });
    const asleep = play(b.state, side, b.ids[side].hand[0]);
    const again = play(asleep.state, side, b.ids[side].hand[1]);
    expect(keyword(again.state, b.ids[side].back[0]!)).toBe(true);
    expect(again.state.instances[b.ids[side].back[0]!].status.exhausted).toBe(true);
    const second = play(again.state, side, b.ids[side].hand[2]);
    expect(second.state.instances[b.ids[side].hand[2]].status.exhausted).toBe(true);
  });

  it("counts each side separately on an opponent's turn and resets on actual extra turns", () => {
    const b = world(side, [fast.id, cards.extra.id, v.vanilla0.id], {}, { dreamsigns: [signId], hand: [fast.id, fast.id] });
    const first = play(b.state, side, b.ids[side].hand[0]);
    const dusk = passUntil(engine, first.state, s => s.turn.active === side && s.turn.phase === "dusk").state;
    const theirs = play(dusk, opponent(side), b.ids[opponent(side)].hand[0]);
    expect(keyword(theirs.state, b.ids[opponent(side)].hand[0])).toBe(true);
    const second = play(theirs.state, opponent(side), b.ids[opponent(side)].hand[1]);
    expect(second.state.instances[b.ids[opponent(side)].hand[1]].status.exhausted).toBe(true);
    const nextDay = passUntil(engine, second.state, s => s.turn.active === side && s.turn.phase === "day").state;
    const scheduled = play(nextDay, side, b.ids[side].hand[1]);
    const turn = scheduled.state.turn.turnNumber;
    const extra = passUntil(engine, scheduled.state, s => s.turn.turnNumber > turn && s.turn.active === side && s.turn.phase === "day").state;
    expect(extra.turn.turnNumber).toBe(turn + 1);
    expect(materializedThisTurn(extra, side)).toEqual([]);
    expect(keyword(play(extra, side, b.ids[side].hand[2]).state, b.ids[side].hand[2])).toBe(true);
  });

  it("retains permanent physical grants across Ending and return/reentry, independently of its source", () => {
    const b = world(side, [v.vanilla0.id, cards.leave.id, v.vanilla0.id], { dreamsigns: [], back: [provider.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(state.instances[b.ids[side].back[0]!].zone).toBe("hand");
    expect(keyword(state, b.ids[side].hand[0])).toBe(true);
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, s => s.turn.turnNumber > turn && s.turn.active === side && s.turn.phase === "day").state;
    expect(keyword(state, b.ids[side].hand[0])).toBe(true);
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(keyword(state, b.ids[side].hand[2])).toBe(false);
    state = play(state, side, b.ids[side].hand[0]).state;
    expect(state.instances[b.ids[side].hand[0]].status.exhausted).toBe(false);
    expect(grants(state)).toHaveLength(1);
  });

  it("a source entering after an earlier occasion grants neither retroactively nor to a later character", () => {
    const b = world(side, [v.vanilla0.id, provider.id, v.vanilla0.id], { dreamsigns: [] });
    let state = b.state;
    for (const id of b.ids[side].hand) state = play(state, side, id).state;
    expect(grants(state)).toEqual([]);
    for (const id of b.ids[side].hand) expect(keyword(state, id)).toBe(false);
  });

  it("duplicates select the same first and coexist with existing Bezoar windows", () => {
    const b = world(side, [cards.enable.id, v.vanilla0.id, v.vanilla0.id], { dreamsigns: [signId, signId] });
    let state = b.state;
    for (const id of b.ids[side].hand) state = play(state, side, id).state;
    expect(grants(state).map(e => e.change.instance)).toEqual([b.ids[side].hand[1], b.ids[side].hand[1]]);
    expect(state.floating.filter(e => e.change.kind === "materializeKeyword" && e.change.instance !== null)).toHaveLength(2);
    expect(state.instances[b.ids[side].hand[2]].status.exhausted).toBe(false);
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, s => s.turn.turnNumber > turn).state;
    expect(keyword(state, b.ids[side].hand[1])).toBe(true);
    expect(keyword(state, b.ids[side].hand[2])).toBe(false);
  });

  it("partial capacity selects the first actual entrant; a rejected full play preserves input", () => {
    const b = world(side, [cards.figments.id, v.vanilla0.id], { back: Array.from({ length: 9 }, () => v.vanilla1.id) });
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(out.events.filter(e => e.kind === "materialized")).toHaveLength(1);
    expect(grants(out.state)).toHaveLength(1);
    const before = stateHash(out.state);
    expect(() => engine.apply(out.state, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, NO_PROMPTS)).toThrow();
    expect(stateHash(out.state)).toBe(before);
  });

  it("a full failed attempt does not consume the next successful first occasion", () => {
    const b = world(side, [cards.kill.id, v.vanilla0.id], { back: Array.from({ length: 10 }, () => v.vanilla1.id) });
    const before = stateHash(b.state);
    expect(() => engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, NO_PROMPTS)).toThrow();
    expect(stateHash(b.state)).toBe(before);
    const cleared = play(b.state, side, b.ids[side].hand[0]);
    expect(grants(cleared.state)).toEqual([]);
    const first = play(cleared.state, side, b.ids[side].hand[1]);
    expect(first.state.instances[b.ids[side].hand[1]].status.exhausted).toBe(false);
    expect(grants(first.state)).toHaveLength(1);
  });

  it("a permanent grant follows a later controller and obeys later loss/new gain ordering", () => {
    const b = world(side, [v.vanilla0.id, cards.loss.id, cards.again.id], {}, { hand: [cards.gain.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(keyword(state, b.ids[side].hand[0])).toBe(false);
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, s => s.turn.turnNumber > turn && s.turn.active === side && s.turn.phase === "day").state;
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(keyword(state, b.ids[side].hand[0])).toBe(true);
    state = passUntil(engine, state, s => s.turn.active === opponent(side) && s.turn.phase === "day").state;
    state = play(state, opponent(side), b.ids[opponent(side)].hand[0]).state;
    expect(state.instances[b.ids[side].hand[0]].controller).toBe(opponent(side));
    expect(keyword(state, b.ids[side].hand[0])).toBe(true);
  });

  it("created cessation retires its permanent grant and a legacy absent count begins at zero", () => {
    const b = world(side, [cards.figments.id, cards.kill.id]);
    const made = play(b.state, side, b.ids[side].hand[0]);
    expect(grants(made.state)).toHaveLength(1);
    const member = grants(made.state)[0].change.instance;
    if (member === null) throw new Error("Missing created physical member");
    expect(made.state.instances[member].status.created).toBe(true);
    const killed = play(made.state, side, b.ids[side].hand[1]);
    expect(killed.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: member }));
    expect(killed.state.instances[member]).toBeUndefined();
    expect(grants(killed.state)).toEqual([]);
    const later = world(side, [v.vanilla0.id]);
    const legacy = cloneState(later.state);
    delete legacy.turnLog.materialized;
    const out = play(legacy, side, later.ids[side].hand[0]);
    expect(keyword(out.state, later.ids[side].hand[0])).toBe(true);
    expect(stateHash(deserializeState(serializeState(out.state)))).toBe(stateHash(out.state));
  });

  it.each([false, true])("proves the real first-materialization copy FIFO with unsupported-static guard=%s", unreviewed => {
    const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000059090");
    const subject = { ...v.event0, id: syntheticId(0x59090), status: "authored" as const,
      costs: [energy(0)], abilities: () => [event(gainPoints(0))] };
    const copyEngine = createEngine(testCatalog([subject], { dreamsigns: [{ id: sign, status: "authored", abilities: () => [
      staticAbility(firstMaterializationKeyword()),
      triggered(whenYouPlay({ cardType: "event" }), copyCard(triggeringCard())),
      triggered(whenCopyTrigger("you", { cardType: "event" }), copyCard(triggeringCard())),
      ...(unreviewed ? [staticAbility(ruleModifier({ rule: "carryEnergy" }))] : []),
    ] }] }));
    const b = boardState(copyEngine.catalog, { active: side, phase: "day", [side]: { hand: [subject.id], dreamsigns: [sign] } });
    const initial = { ...b.state, config: { ...b.state.config, mandatoryLoopCheckFrom: 8, mandatoryLoopWindow: 16, resolutionCap: 128 } };
    const played = runStep(initial, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, NO_PROMPTS, copyEngine.catalog);
    if (played.kind !== "done") throw new Error("Synthetic copy play suspended");
    let state = played.state, copies = 0;
    for (let i = 0; i < 24 && state.result === null; i++) {
      const step = nextAutomaticStep(state, copyEngine.catalog, copyEngine.memo);
      if (step === null) throw new Error("Expected real copy FIFO");
      const input = serializeState(state), loaded = deserializeState(input);
      const next = runStep(loaded, step, NO_PROMPTS, copyEngine.catalog, { automatic: true });
      expect(serializeState(loaded)).toBe(input);
      if (next.kind !== "done") throw new Error("Synthetic copy step suspended");
      copies += next.events.filter(e => e.kind === "cardCopied").length;
      state = next.state;
    }
    expect(copies).toBeGreaterThan(1);
    expect(state.result).toEqual(unreviewed ? null : { kind: "draw", reason: "mandatoryLoop" });
    expect(state.turn).toEqual(initial.turn);
    expect(state.turnLog.played[side]).toHaveLength(1);
    expect(grants(state)).toEqual([]);
  });

  it("does not commit the grant when a later instruction fails", () => {
    const b = world(side, [cards.fail.id], { void: [v.vanilla0.id] });
    const before = stateHash(b.state);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const out = fold.reduce({ committed: b.state, inFlight: null, publishedEvents: 0, attempt: 0 },
      { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } });
    expect(out.kind).toBe("applied");
    if (out.kind !== "applied") throw new Error("Unexpected failed-step bounce");
    expect(out.error).not.toBeNull();
    expect(grants(out.slice.committed)).toEqual([]);
    expect(out.published.some(e => e.kind === "effectStarted")).toBe(false);
    expect(stateHash(b.state)).toBe(before);
  });
});
