/** Resolution-time random battlefield references and transaction/replay contracts. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, event, keyword, randomCharacter, staticAbility } from "../../../dsl/builders";
import { triggered, triggeringCard, whenYouPlay } from "../../../dsl/triggers";
import type { CharacterSelector } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";

const STREAM = "random:selection";
const signId = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000058301");
const figment = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000058302"), subtype: "Warrior" as const, spark: 1, status: "vanilla" as const, abilities: () => [] };
const protectedCard: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x583003), abilities: () => [keyword("cannotBeTargeted")] };
const gain = () => p.gainSpark(randomCharacter(), 1, "untilEndOfTurn");
const gains = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "sparkGained");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome) {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result;
}
function spell(effect: ResolvingEffect, index = 0x583004): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(index), status: "authored", abilities: () => [event(effect)] };
}
function world(side: Side, effect: ResolvingEffect = gain(), setup: SideSetup = {}, other: SideSetup = {}, cards: readonly EngineCardDefinition[] = []) {
  const source = spell(effect);
  const engine = createEngine(testCatalog([protectedCard, source, ...cards], {}, [figment]));
  return { engine, source, ...boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [source.id], deck: [v.vanilla5.id, v.vanilla5.id], ...setup }, [opponent(side)]: { deck: [v.vanilla5.id, v.vanilla5.id], ...other } }) };
}
function cast(engine: Engine, state: BattleState, side: Side, card: InstanceId) {
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  const done = passUntil(engine, played.state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
  const result = { state: done.state, events: [...played.events, ...done.events] };
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  return result;
}
function watcher(effect: ResolvingEffect): EngineDreamsignDefinition {
  return { id: signId, status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), effect)] };
}

for (const side of SIDES) describe(`${side} random battlefield character`, () => {
  it("chooses each physical slot uniformly from both sides with scripted draws, including identical printings and protection", () => {
    const selected = new Set<InstanceId>();
    let eligible: readonly (InstanceId | null)[] = [];
    for (const draw of [0, 0.26, 0.51, 0.99]) {
      const source: EngineCardDefinition = { ...v.event0, id: syntheticId(0x583005), synthetic: { resolve(ctx, item) {
        const random = ctx.random.bind(ctx);
        ctx.random = stream => { expect(stream).toBe(STREAM); random(stream); return draw; };
        try { resolveEffect(ctx, gain(), { source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]),
          ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } }); }
        finally { ctx.random = random; }
      } } };
      const w = world(side, p.sequence(), { hand: [source.id], back: [v.vanilla1.id, v.vanilla1.id] }, { back: [protectedCard.id, v.vanilla1.id] }, [source]);
      const pool = [...w.ids[side].back, ...w.ids[opponent(side)].back];
      expect(new Set(pool).size).toBe(4);
      eligible = pool;
      const result = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      const gained = gains(result.events);
      expect(gained).toHaveLength(1);
      expect(pool).toContain(gained[0].instance);
      selected.add(gained[0].instance);
      expect(result.state.rng[STREAM]).toBe(1);
      for (const id of pool) expect(effectiveSpark(result.state, w.engine.catalog, id!)).toBe(id === gained[0].instance ? 2 : 1);
      expect(result.events.some(e => e.kind === "noLegalTarget")).toBe(false);
    }
    expect(selected).toEqual(new Set(eligible));
  });

  it("draws once for a singleton, and never for an empty pool while the remaining effect continues", () => {
    for (const populated of [false, true]) {
      const w = world(side, p.sequence(gain(), p.gainPoints(2)), {}, { back: populated ? [protectedCard.id] : [] });
      const result = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      expect(gains(result.events).map(e => e.instance)).toEqual(w.ids[opponent(side)].back);
      expect(result.state.rng[STREAM] ?? 0).toBe(populated ? 1 : 0);
      expect(result.state.sides[side].score).toBe(2);
    }
  });

  it("conjoins live selector fields and includes ordinary figments and physical figment copies", () => {
    const selectors: readonly CharacterSelector[] = [characterYouControl({ figment: true }), { controller: "opponent", figment: true }, anyCharacter({ figment: false, subtype: "Warrior", sparkAtMost: 1, exhausted: false })];
    for (const selector of selectors) {
      const w = world(side, p.gainSpark(randomCharacter(selector), 1, "untilEndOfTurn"), {
        back: [v.vanilla3.id], figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }],
      }, { back: [protectedCard.id], figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null } }] });
      const expected = selector.figment === false ? w.ids[opponent(side)].back[0] : w.state.sides[selector.controller === "you" ? side : opponent(side)].backRank[1];
      const result = cast(w.engine, w.state, side, w.ids[side].hand[0]);
      expect(gains(result.events).map(e => e.instance)).toEqual([expected]);
    }
  });

  it("reads the board after earlier resolving instructions remove every old candidate and materialize a new one", () => {
    const w = world(side, p.sequence(p.returnToHand(all(anyCharacter())), p.materializeFigments(figment.id), gain()), { back: [v.vanilla1.id] }, { back: [protectedCard.id] });
    const result = cast(w.engine, w.state, side, w.ids[side].hand[0]);
    const born = result.events.find(e => e.kind === "materialized");
    expect(born?.kind).toBe("materialized");
    if (born?.kind !== "materialized") throw new Error("Missing new physical figment");
    expect(gains(result.events).map(e => e.instance)).toEqual([born.instance]);
    for (const id of [...w.ids[side].back, ...w.ids[opponent(side)].back]) expect(result.state.instances[id!].zone).toBe("hand");
    expect(result.state.rng[STREAM]).toBe(1);
  });

  it("queues an event-only emblem trigger without a play-time draw and expires the gain with that turn", () => {
    const sign = watcher(gain());
    const engine = createEngine(testCatalog([], { dreamsigns: [sign] }));
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { dreamsigns: [sign.id], back: [v.vanilla1.id], hand: [v.event0.id, v.vanilla0.id], deck: [v.vanilla5.id, v.vanilla5.id] }, [opponent(side)]: { deck: [v.vanilla5.id, v.vanilla5.id] } });
    const played = runStep(f.state, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS, engine.catalog);
    if (played.kind !== "done") throw new Error("Unexpected event prompt");
    expect(played.state.rng[STREAM] ?? 0).toBe(0);
    expect(played.state.triggerQueue).toHaveLength(1);
    const loaded = deserializeState(serializeState(played.state));
    const finish = (start: BattleState) => {
      const trigger = runStep(start, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
      if (trigger.kind !== "done") throw new Error("Unexpected trigger prompt");
      const top = runStep(trigger.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
      if (top.kind !== "done") throw new Error("Unexpected resolution prompt");
      return { state: top.state, events: [...trigger.events, ...top.events] };
    };
    const done = finish(played.state);
    const reloaded = finish(loaded);
    expect(stateHash(done.state)).toBe(stateHash(reloaded.state));
    expect(gains(done.events)).toHaveLength(1);
    expect(effectiveSpark(done.state, engine.catalog, f.ids[side].back[0]!)).toBe(2);
    const character = cast(engine, done.state, side, f.ids[side].hand[1]);
    expect(gains(character.events)).toEqual([]);
    const nextTurn = passUntil(engine, character.state, state => state.turn.active !== side);
    expect(effectiveSpark(nextTurn.state, engine.catalog, f.ids[side].back[0]!)).toBe(1);
    expect(nextTurn.state.rng[STREAM]).toBe(1);
  });

  it("does not trigger for a stack copy that was not played", () => {
    const sign = watcher(p.sequence(gain(), p.copyCard(triggeringCard())));
    const engine = createEngine(testCatalog([], { dreamsigns: [sign] }));
    const f = boardState(engine.catalog, { active: side, phase: "day", [side]: { dreamsigns: [sign.id], back: [v.vanilla1.id], hand: [v.event0.id] } });
    const done = cast(engine, f.state, side, f.ids[side].hand[0]);
    expect(done.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
    expect(done.events.filter(e => e.kind === "cardCopied")).toHaveLength(1);
    expect(gains(done.events)).toHaveLength(1);
    expect(done.state.rng[STREAM]).toBe(1);
  });
});

it("rejects static random subjects without drawing from any stream", () => {
  const invalid: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x583007), abilities: () => [staticAbility(p.sparkModifier(randomCharacter(), 1))] };
  const engine = createEngine(testCatalog([invalid]));
  const f = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [invalid.id] } });
  const before = structuredClone(f.state.rng);
  expect(() => engine.view(f.state, "player")).toThrow(/static ability cannot select a random character/);
  expect(f.state.rng).toEqual(before);
});

for (const side of SIDES) it(`${side} reloads after a random gain, rejects competing/stale intents, and commits the same draw exactly once`, () => {
  const w = world(side, p.sequence(gain(), p.optional(p.gainPoints(1))), { back: [v.vanilla1.id] }, { back: [v.vanilla1.id] });
  const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
  const opening = applied(fold.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
  const opened = opening.slice;
  const pending = fold.pending(opened)!;
  expect(pending.prompt.kind).toBe("confirm");
  expect(pending.display.rng[STREAM]).toBe(1);
  expect(opened.committed.rng[STREAM] ?? 0).toBe(0);
  const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
  const fresh = createFoldAdapter(createEngine(w.engine.catalog), { checkEventPrefix: true });
  expect(fresh.pending(saved)).toEqual(pending);
  const intent = { kind: "answer" as const, side, promptId: pending.prompt.id, value: true };
  expect(fresh.reduce(saved, { ...intent, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
  expect(fresh.reduce(saved, { ...intent, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
  expect(fresh.reduce(saved, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
  expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
  const direct = applied(fold.reduce(opened, intent));
  const resumed = applied(fresh.reduce(saved, intent));
  expect(stateHash(resumed.slice.committed)).toBe(stateHash(direct.slice.committed));
  expect(resumed.published).toEqual(direct.published);
  expect(resumed.slice.committed.rng[STREAM]).toBe(1);
  expect(gains([...opening.published, ...resumed.published])).toHaveLength(1);
  expect(fresh.reduce(resumed.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
});

it("contains a real error after random gain, restoring RNG and spark with no partial publication", () => {
  const missing = parseFigmentId("5e5e5e5e-0000-4000-8000-000000058399");
  const w = world("player", p.optional(p.sequence(gain(), p.materializeFigments(missing))), { back: [v.vanilla1.id] });
  const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
  const opened = applied(fold.reduce(slice(w.state), { kind: "battleAction", side: "player", action: { kind: "play", card: w.ids.player.hand[0], from: "hand" } })).slice;
  const prompt = fold.pending(opened)!.prompt;
  const before = stateHash(opened.committed);
  const failed = fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.id, value: true });
  if (failed.kind !== "applied" || failed.error === null) throw new Error("Expected missing-figment resolver error");
  expect(failed.slice.committed.rng[STREAM] ?? 0).toBe(0);
  expect(effectiveSpark(failed.slice.committed, w.engine.catalog, w.ids.player.back[0]!)).toBe(1);
  expect(gains(failed.published)).toEqual([]);
  expect(stateHash(opened.committed)).toBe(before);
  expect(failed.slice.inFlight).toBeNull();
});
