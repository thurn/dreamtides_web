/** Physical play subjects, retained replacement costs and public intent recovery. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { additionalCost, energy, event, everyIn, optionalCost, pointsCost, reclaim, stackItem } from "../../../dsl/builders";
import type { Ability, Cost } from "../../../dsl/types";
import { triggered, triggeringCard, whenYouPlay, whenMaterialize } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { hasKeyword } from "../../../rules/keywords";
import type { PreventDestination } from "../../../rules/stack";
import { routeCosts } from "../../../rules/timing";
import { instanceOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseDreamsignId } from "../../../../types/identifiers";
import { resolveEffect } from "../../interpreter";
import type { Effect } from "../../registry";
import { copyCardTimes } from "../copy-card";
import { gainPoints } from "../gain-points";
import { grantReclaim } from "../grant-reclaim";
import { grantTriggeringCardReclaim } from "../grant-triggering-card-reclaim";
import { prevent } from "../prevent";
import { sequence } from "../sequence";

const emblemId = parseDreamsignId("00000000-0000-4000-8000-000000006120");
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
const grant = (costs: readonly Cost[] = [energy(0)]) => grantTriggeringCardReclaim(triggeringCard(), costs);
const plain = grantReclaim(everyIn("void"));
function spell(index: number, abilities: readonly Ability[] = [event(gainPoints(0))], cost = 3): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x612000 + index), costs: [energy(cost)], abilities: () => abilities, status: "authored" };
}
function fixture(side: Side, effect: Effect = grant(), before: readonly Effect[] = [], abilities: readonly Ability[] = [], duplicates = 1) {
  const subject = spell(1, [event(gainPoints(0)), ...abilities]);
  const emblem: EngineDreamsignDefinition = { id: emblemId, status: "authored", abilities: () => [
    ...before.map(body => triggered(whenYouPlay({ cardType: "event" }, 2), body)),
    triggered(whenYouPlay({ cardType: "event" }, 2), effect),
  ] };
  const utility = spell(2, [event(plain)], 0);
  const engine = createEngine(testCatalog([subject, utility], { dreamsigns: [emblem] }));
  const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    dreamsigns: Array.from({ length: duplicates }, () => emblemId), hand: [subject.id, subject.id, subject.id, utility.id, v.vanilla0.id],
    void: [v.event1.id], energy: 12, score: 4, deck,
  }, [opponent(side)]: { hand: [v.interruptEvent.id], void: [v.event0.id], energy: 1, deck } });
  const state = { ...setup.state, config: { ...setup.state.config, autoAnswerForcedPrompts: false } };
  return { engine, state, ids: setup.ids, subject, utility, side };
}
function step(engine: Engine, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, engine.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected prompt ${result.prompt.kind}`);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function played(engine: Engine, state: BattleState, card: InstanceId, from: "hand" | "void" = "hand") {
  return step(engine, state, { kind: "play", card, from });
}
function second(f: ReturnType<typeof fixture>) {
  const first = played(f.engine, f.state, f.ids[f.side].hand[0]);
  expect(first.state.triggerQueue).toEqual([]);
  const resolved = step(f.engine, first.state, { kind: "resolveTop" });
  return played(f.engine, resolved.state, f.ids[f.side].hand[1]);
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const has = (engine: Engine, state: BattleState, card: InstanceId) => hasKeyword(state, engine.catalog, card, "reclaim");

for (const side of SIDES) describe(`${side} physical triggering-card Reclaim`, () => {
  it("grants the real second event while it is on stack, retains into void and actually reclaims for zero", () => {
    const f = fixture(side);
    const cast = second(f);
    const subject = f.ids[side].hand[1];
    expect(cast.state.instances[subject].zone).toBe("stack");
    expect(cast.events.filter(e => e.kind === "triggerQueued")).toEqual([expect.objectContaining({ subject, source: { kind: "dreamsign", side, index: 0 } })]);
    const granted = step(f.engine, cast.state, { kind: "resolveTrigger" });
    expect(granted.events.filter(e => e.kind === "effectStarted")).toEqual([expect.objectContaining({
      change: { kind: "keyword", instance: subject, keyword: "reclaim", gains: true, reclaimCosts: [energy(0)] }, expiry: { at: "never" },
    })]);
    expect(has(f.engine, granted.state, subject)).toBe(true);
    expect(granted.state.instances[subject].zone).toBe("stack");
    for (const id of [f.ids[side].hand[0], f.ids[side].hand[2], f.ids[side].void[0], f.ids[opponent(side)].void[0]]) expect(has(f.engine, granted.state, id)).toBe(false);
    const resolved = step(f.engine, granted.state, { kind: "resolveTop" });
    expect(resolved.state.instances[subject].zone).toBe("void");
    const loaded = deserializeState(serializeState(resolved.state));
    expect(stateHash(loaded)).toBe(stateHash(resolved.state));
    const empty = { ...loaded, sides: { ...loaded.sides, [side]: { ...loaded.sides[side], currentEnergy: 0 } } };
    const action = { kind: "play", card: subject, from: "void" } as const;
    expect(f.engine.legalActions(empty, side)).toContainEqual(action);
    expect(f.engine.legalActions(empty, opponent(side))).not.toContainEqual(action);
    const reclaimed = played(f.engine, empty, subject, "void");
    expect(reclaimed.state.sides[side].currentEnergy).toBe(0);
    expect(reclaimed.state.instances[subject].status.playedViaReclaim).toBe(true);
    expect(reclaimed.state.triggerQueue).toEqual([]);
    expect(step(f.engine, reclaimed.state, { kind: "resolveTop" }).state.instances[subject].zone).toBe("banished");
  });

  it("excludes first/third events, characters, opponents and created copies from the second-play consumer", () => {
    const f = fixture(side, grant(), [copyCardTimes(triggeringCard(), 2)]);
    const character = played(f.engine, f.state, f.ids[side].hand[4]);
    expect(character.state.triggerQueue).toEqual([]);
    const ready = step(f.engine, character.state, { kind: "resolveTop" }).state;
    const first = played(f.engine, ready, f.ids[side].hand[0]);
    expect(first.state.triggerQueue).toEqual([]);
    const resolved = step(f.engine, first.state, { kind: "resolveTop" }).state;
    const own = played(f.engine, resolved, f.ids[side].hand[1]);
    const copied = step(f.engine, own.state, { kind: "resolveTrigger" });
    const copies = copied.events.flatMap(e => e.kind === "cardCopied" ? [e.copy] : []);
    expect(copies).toHaveLength(2);
    expect(copied.state.turnLog.played[side].filter(item => item.cardType === "event")).toHaveLength(2);
    expect(copied.state.triggerQueue).toHaveLength(1);
    const granted = step(f.engine, copied.state, { kind: "resolveTrigger" }).state;
    for (const id of copies) expect(has(f.engine, granted, id)).toBe(false);
    let rest = granted;
    while (rest.stack.length > 0) rest = step(f.engine, rest, { kind: "resolveTop" }).state;
    expect(played(f.engine, rest, f.ids[side].hand[2]).state.triggerQueue).toEqual([]);
    const foreign = played(f.engine, first.state, f.ids[opponent(side)].hand[0]);
    expect(foreign.state.triggerQueue).toEqual([]);
  });

  it.each<PreventDestination>(["void", "ownerHand", "deckTop", "deckBottom", "yourHand"])("follows the bound subject after an earlier trigger sends it to %s", destination => {
    const f = fixture(side, grant(), [prevent(stackItem({ cardType: "event" }), { destination })]);
    const cast = second(f);
    const subject = f.ids[side].hand[1];
    const moved = step(f.engine, cast.state, { kind: "resolveTrigger" }, [[subject]]);
    expect(moved.state.stack).toEqual([]);
    const granted = step(f.engine, moved.state, { kind: "resolveTrigger" });
    expect(has(f.engine, granted.state, subject)).toBe(true);
    expect(routeCosts(granted.state, f.engine.catalog, subject, "reclaim")).toEqual([energy(0)]);
    expect(granted.events.filter(e => e.kind === "effectStarted")).toHaveLength(1);
    for (const id of [f.ids[side].hand[0], f.ids[side].hand[2], f.ids[side].void[0]]) expect(has(f.engine, granted.state, id)).toBe(false);
    const fresh = deserializeState(serializeState(moved.state));
    const replay = step(f.engine, fresh, { kind: "resolveTrigger" });
    expect(replay.events).toEqual(granted.events);
    expect(stateHash(replay.state)).toBe(stateHash(granted.state));
    for (const viewer of SIDES) {
      const visible = eventSeenBy(granted.events.find(e => e.kind === "effectStarted")!, viewer, granted.state);
      if (f.engine.view(granted.state, viewer).instances[subject] === undefined) expect(visible).toBeNull();
      else expect(visible).toMatchObject({ kind: "effectStarted", change: { instance: subject } });
    }
  });

  it("names no ceased physical card and emits no grant, including a retained queued subject", () => {
    const emblem: EngineDreamsignDefinition = { id: emblemId, status: "authored", abilities: () => [triggered(whenMaterialize(), grant())] };
    const engine = createEngine(testCatalog([], { dreamsigns: [emblem] }));
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: {
      dreamsigns: [emblemId], back: [v.vanilla1.id], hand: [v.dissolveFigmentCopy.id], deck,
    } });
    const cast = step(engine, setup.state, { kind: "play", card: setup.ids[side].hand[0], from: "hand" }, [[setup.ids[side].back[0]!]]);
    const ceased = step(engine, cast.state, { kind: "resolveTop" });
    const queued = ceased.events.find(e => e.kind === "triggerQueued");
    if (queued?.kind !== "triggerQueued" || queued.subject === null) throw new Error("missing real materialized-copy subject");
    expect(ceased.state.instances[queued.subject]).toBeUndefined();
    const grantResult = step(engine, ceased.state, { kind: "resolveTrigger" });
    expect(grantResult.events.some(e => e.kind === "effectStarted")).toBe(false);
    expect(grantResult.state.floating).toEqual([]);
  });

  it("retains the physical subject after a Reclaim replacement sends it to Banished", () => {
    const f = fixture(side, grant(), [prevent(stackItem({ cardType: "event" }))], [reclaim(energy(0))]);
    const setup = boardState(f.engine.catalog, { active: side, phase: "day", [side]: {
      dreamsigns: [emblemId], hand: [f.subject.id], void: [f.subject.id], energy: 3, deck,
    } });
    const first = played(f.engine, setup.state, setup.ids[side].hand[0]);
    const settled = step(f.engine, first.state, { kind: "resolveTop" });
    const subject = setup.ids[side].void[0];
    const cast = played(f.engine, settled.state, subject, "void");
    const prevented = step(f.engine, cast.state, { kind: "resolveTrigger" }, [[subject]]);
    expect(prevented.state.instances[subject].zone).toBe("banished");
    const granted = step(f.engine, prevented.state, { kind: "resolveTrigger" });
    expect(has(f.engine, granted.state, subject)).toBe(true);
    expect(granted.events.filter(e => e.kind === "effectStarted")).toHaveLength(1);
    expect(f.engine.legalActions(granted.state, side).some(a => a.kind === "play" && a.card === subject)).toBe(false);
  });

  it("names nothing outside a triggering-card binding", () => {
    const source = spell(11, [event(grant())], 0);
    const engine = createEngine(testCatalog([source]));
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [source.id], void: [v.event1.id], deck } });
    const cast = played(engine, setup.state, setup.ids[side].hand[0]);
    const resolved = step(engine, cast.state, { kind: "resolveTop" });
    expect(resolved.events.some(e => e.kind === "effectStarted")).toBe(false);
    expect(resolved.state.floating).toEqual([]);
    expect(has(engine, resolved.state, setup.ids[side].void[0])).toBe(false);
  });

  it("preserves the ordinary void-only API and explicit/latest/plain/printed replacement precedence", () => {
    const f = fixture(side, sequence(grant([energy(2)]), grant([]), plain), [], [reclaim(energy(5)), additionalCost(pointsCost(1))], 2);
    const cast = second(f);
    const subject = f.ids[side].hand[1];
    const one = step(f.engine, cast.state, { kind: "resolveTrigger" });
    const two = step(f.engine, one.state, { kind: "resolveTrigger" });
    expect(routeCosts(two.state, f.engine.catalog, subject, "reclaim")).toEqual([pointsCost(1)]);
    expect(two.events.filter(e => e.kind === "effectStarted" && e.change.kind === "keyword" && e.change.instance === subject)).toHaveLength(2);
    const voided = step(f.engine, two.state, { kind: "resolveTop" }).state;
    const paid = played(f.engine, voided, subject, "void");
    expect(paid.state.sides[side].currentEnergy).toBe(voided.sides[side].currentEnergy);
    expect(paid.state.sides[side].score).toBe(voided.sides[side].score - 1);
    const old = fixture(side, grantReclaim(triggeringCard(), { costs: [energy(0)] }));
    const oldGrant = step(old.engine, second(old).state, { kind: "resolveTrigger" });
    expect(oldGrant.events.some(e => e.kind === "effectStarted")).toBe(false);
    expect(has(old.engine, oldGrant.state, old.ids[side].hand[1])).toBe(false);
    expect(() => grantReclaim(everyIn("hand"))).toThrow();
  });

  it("cancels or cold-resumes optional additional payment with atomic refusal, stale and concurrent intents", () => {
    const f = fixture(side, grant(), [], [additionalCost(optionalCost(energy(1)))]);
    const first = step(f.engine, f.state, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, [false]);
    const rest = step(f.engine, first.state, { kind: "resolveTop" }).state;
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const start = slice(rest);
    const action = { kind: "play", card: f.ids[side].hand[1], from: "hand" } as const;
    const opened = applied(fold.reduce(start, { kind: "battleAction", side, action }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "confirm", purpose: { role: "optionalCost" } });
    expect(stateHash(opened.committed)).toBe(stateHash(rest));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(rest));
    expect(cancelled.committed.floating).toEqual([]);
    const fresh = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const loaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    expect(fresh.reduce(loaded, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: 4 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(loaded, { kind: "battleAction", side, action }).kind).toBe("bounced");
    const continued = fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: true });
    const committed = applied(continued).committed;
    const subject = f.ids[side].hand[1];
    expect(committed.instances[subject].zone).toBe("stack");
    expect(has(f.engine, committed, subject)).toBe(true);
    expect(committed.floating).toHaveLength(1);
    expect(committed.sides[side].currentEnergy).toBe(rest.sides[side].currentEnergy - 4);
    expect(fresh.reduce(applied(continued), { kind: "answer", side, promptId: pending.prompt.id, value: true }).kind).toBe("bounced");
    const repeat = fresh.reduce(JSON.parse(JSON.stringify(opened)) as BattleSlice, { kind: "answer", side, promptId: pending.prompt.id, value: true });
    expect(applied(repeat).committed).toEqual(committed);
    if (continued.kind !== "applied" || repeat.kind !== "applied") throw new Error("missing applied result");
    expect(repeat.published).toEqual(continued.published);
    expect(invariantViolations(committed, f.engine.catalog)).toEqual([]);
    const resolved = step(f.engine, committed, { kind: "resolveTop" }).state;
    const affordable = { ...resolved, sides: { ...resolved.sides, [side]: { ...resolved.sides[side], currentEnergy: 1 } } };
    const reclaimed = step(f.engine, affordable, { kind: "play", card: subject, from: "void" }, [true]);
    expect(reclaimed.state.sides[side].currentEnergy).toBe(0);
    expect(reclaimed.state.instances[subject].status.playedViaReclaim).toBe(true);
  });

  it("rolls back a synthetic fault after the actual grant write and allows subsequent recovery", () => {
    let fail = true;
    const fault: EngineCardDefinition = { ...spell(10, [], 0), synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, grant(), { source: item.instance, subject: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
      if (fail) throw new Error("synthetic failure after physical Reclaim grant");
    } } };
    const engine = createEngine(testCatalog([fault]));
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [fault.id], deck } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const result = fold.reduce(slice(setup.state), { kind: "battleAction", side, action: { kind: "play", card: setup.ids[side].hand[0], from: "hand" } });
    // The opponent has no response: the engine reaches the deliberately failing resolve step.
    if (result.kind !== "applied" || result.error === null) throw new Error("expected injected resolution error");
    expect(result.published.some(e => e.kind === "effectStarted")).toBe(false);
    expect(result.slice.committed.floating).toEqual([]);
    expect(result.slice.committed.instances[setup.ids[side].hand[0]].zone).toBe("stack");
    fail = false;
    const recovered = step(engine, result.slice.committed, { kind: "resolveTop" });
    expect(has(engine, recovered.state, setup.ids[side].hand[0])).toBe(true);
    expect(recovered.events.filter(e => e.kind === "effectStarted")).toHaveLength(1);
    expect(recovered.state.instances[setup.ids[side].hand[0]].zone).toBe("void");
  });
});
