/** Strict resolving random bounds, retained subjects and public transaction boundaries. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { characterYouControl, countCards, energy, energyX, event, everyIn, randomIn, staticAbility, triggerSubjectCost, x } from "../../../dsl/builders";
import { fixedEnergy } from "../../../dsl/energy";
import { NO_DECK_MODS, type CardFilter, type ValueExpr } from "../../../dsl/types";
import { triggered, whenDissolved } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES, type CardId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";
import { mill } from "./random-selection-support";

const candidates = [v.vanilla0, v.vanilla1, v.vanilla3, v.vanilla5];
const ids = candidates.map(card => card.id);
const less = (value: ValueExpr, zone: "deck" | "hand" | "void" = "void", count = 1) => randomIn(zone, count, { cardType: "character" }, { costLessThan: value });
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome) {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result;
}
function card(body: ResolvingEffect, index = 0x585001): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(index), status: "authored", abilities: () => [event(body)] };
}
function resolve(engine: Engine, board: ReturnType<typeof boardState>, side: Side, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const played = engine.apply(board.state, side, { kind: "play", card: board.ids[side].hand[0], from: "hand" }, source);
  if (source instanceof ScriptedSource) source.assertExhausted();
  const done = passUntil(engine, played.state, state => state.stack.length === 0 && state.triggerQueue.length === 0);
  const result = { state: done.state, events: [...played.events, ...done.events] };
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(eventRedactionViolations(result.events, board.state, result.state)).toEqual([]);
  return result;
}
function subjectWorld(side: Side, copied: boolean, cost: number, body: ResolvingEffect, modified = false) {
  const watcher = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000058501"), status: "authored" as const,
    abilities: () => [triggered(whenDissolved(characterYouControl({ subtype: "Warrior" })), body)] };
  const subject: EngineCardDefinition = { ...v.vanilla3, id: syntheticId(0x585002), costs: [energy(cost), energyX(0)] };
  const engine = createEngine(testCatalog([subject], { dreamsigns: [watcher] }));
  const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { dreamsigns: [watcher.id], back: [subject.id],
    hand: [copied ? v.dissolveFigmentCopy.id : v.dissolveVictim.id], void: modified ? [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] : ids, energy: 8 } });
  f.state = { ...f.state, config: { ...f.state.config, autoAnswerForcedPrompts: false } };
  const departed = f.ids[side].back[0]!;
  f.state.instances[departed].status.x = 7;
  if (modified) f.state.instances[departed] = { ...f.state.instances[departed], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1 } } };
  return { engine, f, departed };
}

describe("random strict lower copiable cost", () => {
  it.each(SIDES)("%s excludes equal and higher costs including a zero bound", side => {
    for (const limit of [0, 3]) for (const candidate of candidates) {
      const def = card(p.materialize(less(limit, "deck")));
      const engine = createEngine(testCatalog([def]));
      const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [def.id], deck: [candidate.id] } });
      const result = resolve(engine, f, side);
      const qualifies = fixedEnergy(candidate.costs) < limit;
      expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(qualifies ? f.ids[side].deck : []);
      expect(result.state.rng["random:selection"] ?? 0).toBe(qualifies ? 1 : 0);
      expect(result.events.filter(e => e.kind === "noLegalTarget")).toEqual([]);
    }
  });

  it.each(SIDES)("%s reads a dissolved subject independently of the emblem and subject X", side => {
    for (const copied of [false, true]) for (const cost of [0, 3]) {
      const body = p.sequence(p.gainPoints(triggerSubjectCost()), p.returnFromVoid(less(triggerSubjectCost(), "void", 10)));
      const { engine, f, departed } = subjectWorld(side, copied, cost, body);
      const result = resolve(engine, f, side, [[departed]]);
      const queued = result.events.find(e => e.kind === "triggerQueued");
      expect(queued).toMatchObject({ source: { kind: "dreamsign" }, lastKnownSubjectCost: cost });
      if (queued?.kind !== "triggerQueued" || queued.subject === null) throw new Error("Missing dissolved subject");
      if (copied) expect(result.state.instances[queued.subject]).toBeUndefined();
      expect(result.state.sides[side].score).toBe(cost);
      expect(f.ids[side].void.filter(id => result.state.instances[id].zone === "hand")).toEqual(cost === 0 ? [] : f.ids[side].void.slice(0, 2));
      expect(result.state.rng["random:selection"] ?? 0).toBe(cost === 0 ? 0 : 2);
    }
    const { engine, f, departed } = subjectWorld(side, true, 3, p.returnFromVoid(less(triggerSubjectCost(), "void", 10)), true);
    const result = resolve(engine, f, side, [[departed]]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", lastKnownSubjectCost: 2 }));
    expect(result.state.instances[f.ids[side].void[2]].zone).toBe("void");
    expect(f.ids[side].void.filter(id => result.state.instances[id].zone === "hand")).toEqual(f.ids[side].void.slice(0, 2));
  });

  it("excludes even zero-cost candidates for a ceased ordinary figment subject", () => {
    const figment = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000058598"), subtype: "Warrior" as const, spark: 1, status: "vanilla" as const, abilities: () => [] };
    const watcher = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000058597"), status: "authored" as const,
      abilities: () => [triggered(whenDissolved(characterYouControl({ figment: true })), p.returnFromVoid(less(triggerSubjectCost())))] };
    const engine = createEngine(testCatalog([], { dreamsigns: [watcher] }, [figment]));
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { dreamsigns: [watcher.id], hand: [v.dissolveVictim.id], void: [v.vanilla0.id],
      figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }] } });
    const result = resolve(engine, f, "player");
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", lastKnownSubjectCost: 0 }));
    expect(result.state.instances[f.ids.player.back[0]!]).toBeUndefined();
    expect(result.state.instances[f.ids.player.void[0]].zone).toBe("void");
    expect(result.state.rng["random:selection"] ?? 0).toBe(0);
  });

  it("takes a partial count without replacement from distinct matching instances", () => {
    const def = card(p.returnFromVoid(less(3, "void", 2)));
    const engine = createEngine(testCatalog([def]));
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], void: [v.vanilla0.id, v.vanilla1.id, v.vanilla1.id, v.vanilla3.id] } });
    const result = resolve(engine, f, "player");
    const selected = result.state.sides.player.hand;
    expect(selected).toHaveLength(2);
    expect(new Set(selected).size).toBe(2);
    for (const id of selected) expect(f.ids.player.void.slice(0, 3)).toContain(id);
    expect(result.state.instances[f.ids.player.void[3]].zone).toBe("void");
    expect(result.state.rng["random:selection"]).toBe(2);
  });

  it("conjoins type, constant bounds, equality, greater and strict lower bounds", () => {
    const other: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x585003), subtype: "Explorer" };
    for (const below of [2, 3]) {
      const filter: CardFilter = { cardType: "character", subtype: "Warrior", costAtLeast: 1, costAtMost: 3 };
      const def = card(p.returnFromVoid(randomIn("void", 10, filter, { costExactly: 1, costGreaterThan: 0, costLessThan: below })));
      const engine = createEngine(testCatalog([def, other]));
      const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], void: [...ids, other.id, v.event1.id] } });
      const result = resolve(engine, f, "player");
      expect(f.ids.player.void.filter(id => result.state.instances[id].zone === "hand")).toEqual([f.ids.player.void[1]]);
    }
    for (const options of [{ costExactly: 3, costLessThan: 3 }, { costGreaterThan: 3, costLessThan: 3 }]) {
      const def = card(p.returnFromVoid(randomIn("void", 10, {}, options)));
      const engine = createEngine(testCatalog([def]));
      const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], void: ids } });
      const result = resolve(engine, f, "player");
      expect(result.state.sides.player.void.filter(id => id !== f.ids.player.hand[0])).toEqual(f.ids.player.void);
      expect(result.state.rng["random:selection"] ?? 0).toBe(0);
    }
  });

  it("preserves unbounded and existing greater/equal forms", () => {
    for (const options of [{}, { costGreaterThan: 0 }, { costExactly: 1 }]) {
      const def = card(p.returnFromVoid(randomIn("void", 10, { cardType: "character" }, options)));
      const engine = createEngine(testCatalog([def]));
      const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], void: ids } });
      const result = resolve(engine, f, "player");
      const expected = "costExactly" in options ? f.ids.player.void.slice(1, 2) : "costGreaterThan" in options ? f.ids.player.void.slice(1) : f.ids.player.void;
      expect(f.ids.player.void.filter(id => result.state.instances[id].zone === "hand")).toEqual(expected);
    }
  });

  it("fixes the resolving zone-count bound before distinct removals and uses only matching RNG draws", () => {
    for (const cards of [[v.vanilla3.id, v.vanilla3.id, v.vanilla3.id, v.event1.id], []] as readonly CardId[][]) {
      const def = card(p.returnFromVoid(less(countCards("void"), "void", 10)));
      const engine = createEngine(testCatalog([def]));
      const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], void: cards } });
      const result = resolve(engine, f, "player");
      const selected = f.ids.player.void.slice(0, cards.length === 0 ? 0 : 3);
      expect(new Set(result.state.sides.player.hand)).toEqual(new Set(selected));
      expect(result.state.sides.player.hand).toHaveLength(selected.length);
      expect(result.state.rng["random:selection"] ?? 0).toBe(selected.length);
    }
  });

  it("uses candidate variants, copied values and X zero while payment taxes do not alter eligibility", () => {
    const variable: EngineCardDefinition = { ...v.vanilla5, id: syntheticId(0x585004), costs: [energyX()] };
    const tax: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x585005), abilities: () => [staticAbility(p.costModifier("you", {}, 5))] };
    const def = card(p.materialize(less(2, "hand", 10)));
    const prepare = card(p.createCopyInHand(everyIn("hand", { cardType: "character" })), 0x585006);
    const engine = createEngine(testCatalog([variable, tax, def, prepare]));
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [tax.id], energy: 20,
      hand: [prepare.id, def.id, { cardId: v.vanilla3.id, deckMods: { ...NO_DECK_MODS, costReduction: 2 } },
        { cardId: v.event1.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } }, variable.id, v.vanilla3.id] } });
    const made = resolve(engine, f, "player");
    const next = { ...f, state: made.state, ids: { ...f.ids, player: { ...f.ids.player, hand: [f.ids.player.hand[1]] } } };
    const result = resolve(engine, next, "player");
    const selected = result.events.filter(e => e.kind === "materialized").map(e => e.instance);
    expect(selected).toHaveLength(6); // The three eligible originals and their copies enter.
    for (const id of f.ids.player.hand.slice(2, 5)) expect(selected).toContain(id);
    expect(selected).not.toContain(f.ids.player.hand[5]);
    expect(result.state.instances[f.ids.player.hand[5]].zone).toBe("hand");
  });

  it.each(SIDES)("%s selects from an opponent hand and hides nonselected deck cards", side => {
    for (const zone of ["hand", "deck"] as const) {
      const def = card(p.materialize(randomIn(zone, 1, { cardType: "character" }, { player: "opponent", costLessThan: 2 })));
      const engine = createEngine(testCatalog([def]));
      const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [def.id] }, [opponent(side)]: { [zone]: [v.vanilla1.id, v.vanilla3.id, v.vanilla5.id] } });
      const result = resolve(engine, f, side);
      const selected = f.ids[opponent(side)][zone][0];
      expect(result.state.instances[selected]).toMatchObject({ zone: "play", owner: opponent(side), controller: side });
      expect(result.state.sides[opponent(side)][zone]).toEqual(f.ids[opponent(side)][zone].slice(1));
      if (zone === "deck") for (const viewer of SIDES) for (const id of f.ids[opponent(side)].deck.slice(1)) expect(engine.view(result.state, viewer).instances[id]).toBeUndefined();
      expect(result.state.rng[`shuffle:${opponent(side)}`]).toBe(f.state.rng[`shuffle:${opponent(side)}`]);
    }
  });

  it("uses current eligibility after an interrupt and reloads a paid X stack bound", () => {
    const def = { ...card(p.materialize(less(x(), "deck"))), costs: [energyX()] };
    const engine = createEngine(testCatalog([def, mill]));
    const f = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [def.id], deck: ids, energy: 5 }, enemy: { hand: [mill.id], energy: 1 } });
    const played = engine.apply(f.state, "player", { kind: "play", card: f.ids.player.hand[0], from: "hand" }, new ScriptedSource([2]));
    expect(played.state.stack).toHaveLength(1);
    const loaded = deserializeState(serializeState(played.state));
    const direct = passUntil(engine, played.state, state => state.stack.length === 0);
    const reloaded = passUntil(createEngine(engine.catalog), loaded, state => state.stack.length === 0);
    expect(stateHash(reloaded.state)).toBe(stateHash(direct.state));
    for (const result of [direct, reloaded]) {
      expect(result.events.filter(e => e.kind === "materialized")).toHaveLength(1);
      expect(result.state.rng["random:selection"]).toBe(1);
    }
    expect(direct.events.filter(e => e.kind === "materialized").map(e => e.instance).every(id => f.ids.player.deck.slice(0, 2).includes(id))).toBe(true);
    const response = engine.apply(played.state, "enemy", { kind: "play", card: f.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    const emptied = passUntil(engine, response.state, state => state.stack.length === 0);
    expect(emptied.state.rng["random:selection"] ?? 0).toBe(0);
    expect(emptied.events.filter(e => e.kind === "materialized")).toEqual([]);
  });

  it.each(SIDES)("%s executes a delayed dissolved-subject random bound after serialization", side => {
    const install = card(p.delayed(whenDissolved(characterYouControl()), p.returnFromVoid(less(triggerSubjectCost(), "void", 10))));
    const engine = createEngine(testCatalog([install]));
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [install.id, v.dissolveVictim.id], back: [v.vanilla3.id], void: ids } });
    const prepared = resolve(engine, f, side);
    const next = { ...f, state: deserializeState(serializeState(prepared.state)), ids: { ...f.ids, [side]: { ...f.ids[side], hand: [f.ids[side].hand[1]] } } };
    next.state = { ...next.state, config: { ...next.state.config, autoAnswerForcedPrompts: false } };
    const result = resolve(engine, next, side, [[f.ids[side].back[0]!]]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", lastKnownSubjectCost: 3 }));
    expect(f.ids[side].void.filter(id => result.state.instances[id].zone === "hand")).toEqual(f.ids[side].void.slice(0, 2));
  });
});

describe("random lower bound fold recovery", () => {
  it.each(SIDES)("%s reloads a deferred subject selection and rejects stale or competing answers", side => {
    const { engine, f, departed } = subjectWorld(side, true, 3, p.optional(p.returnFromVoid(less(triggerSubjectCost(), "void", 10))));
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } }));
    const target = fold.pending(opened.slice)!.prompt;
    const chosen = applied(fold.reduce(opened.slice, { kind: "answer", side, promptId: target.id, value: [departed] }));
    const loaded = JSON.parse(JSON.stringify(chosen.slice)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const prompt = fresh.pending(loaded)!.prompt;
    expect(prompt.kind).toBe("confirm");
    expect(prompt).toEqual(fold.pending(chosen.slice)!.prompt);
    const intent = { kind: "answer" as const, side, promptId: prompt.id, value: true };
    expect(fresh.reduce(loaded, { ...intent, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(loaded, { ...intent, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(loaded, { ...intent, promptId: target.id })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const done = applied(fresh.reduce(loaded, intent));
    const direct = applied(fold.reduce(chosen.slice, intent));
    expect(stateHash(done.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(done.published).toEqual(direct.published);
    expect(f.ids[side].void.filter(id => done.slice.committed.instances[id].zone === "hand")).toEqual(f.ids[side].void.slice(0, 2));
    expect(done.slice.committed.rng["random:selection"]).toBe(2);
    expect(fresh.reduce(done.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("contains an actual primitive error after selection, restoring RNG, movement and knowledge", () => {
    const missing = parseFigmentId("5e5e5e5e-0000-4000-8000-000000058599");
    const body = p.optional(p.sequence(p.materialize(less(triggerSubjectCost())), p.materializeFigments(missing)));
    const { engine, f, departed } = subjectWorld("player", true, 3, body);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(f.state), { kind: "battleAction", side: "player", action: { kind: "play", card: f.ids.player.hand[0], from: "hand" } }));
    const target = fold.pending(opened.slice)!.prompt;
    const chosen = applied(fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: target.id, value: [departed] }));
    const prompt = fold.pending(chosen.slice)!.prompt;
    const before = stateHash(chosen.slice.committed);
    const outcome = fold.reduce(chosen.slice, { kind: "answer", side: "player", promptId: prompt.id, value: true });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("Expected contained missing-figment error");
    expect(outcome.published.filter(e => e.kind === "materialized")).toEqual([]);
    expect(outcome.slice.committed.sides.player.void).toEqual(chosen.slice.committed.sides.player.void);
    expect(outcome.slice.committed.rng["random:selection"] ?? 0).toBe(0);
    expect(outcome.slice.committed.knownTo).toEqual(chosen.slice.committed.knownTo);
    expect(stateHash(chosen.slice.committed)).toBe(before);
    expect(outcome.slice.inFlight).toBeNull();
    expect(invariantViolations(outcome.slice.committed, engine.catalog)).toEqual([]);
  });
});
