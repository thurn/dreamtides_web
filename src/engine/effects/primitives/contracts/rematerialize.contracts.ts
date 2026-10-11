import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, event, self, target, upTo } from "../../../dsl/builders";
import { onChallenge, onMaterialized, triggered, whenMaterialize } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import { banish } from "../banish";
import { disableTriggers } from "../disable-triggers";
import { gainEnergy } from "../gain-energy";
import { gainSpark } from "../gain-spark";
import { optional } from "../optional";
import { rematerialize } from "../rematerialize";
import { sequence } from "../sequence";
import { deck, v } from "./cards-support";

const fixture = (index: number, type: "event" | "character", abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  id: syntheticId(0x8500 + index), cardType: type, costs: [], spark: type === "character" ? 1 : null,
  subtype: type === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities,
});
const single = fixture(1, "event", () => [event(rematerialize(target(characterYouControl())))]);
const multiple = fixture(2, "event", () => [event(rematerialize(upTo(characterYouControl(), 2)))]);
const materialized = fixture(3, "character", () => [triggered(onMaterialized(), gainEnergy(1))]);
const observer = fixture(4, "character", () => [triggered(whenMaterialize(), gainEnergy(2))]);
const enemyObserver = fixture(5, "character", () => [triggered(whenMaterialize({ controller: "opponent" }), gainEnergy(3))]);
const challenge = fixture(6, "character", (variant) => [triggered(onChallenge(), rematerialize(variant.amplified ? upTo(characterYouControl(), 2) : target(characterYouControl())))]);
const interrupt: EngineCardDefinition = { ...fixture(7, "event", () => [event(banish(target({ controller: "opponent" })))]), speed: "interrupt" };
const bolster = fixture(8, "event", () => [event(gainSpark(target(characterYouControl()), 4, "untilEndOfTurn"))]);
const suppressed = fixture(9, "event", () => [event(sequence(disableTriggers(all(characterYouControl()), "untilEndOfTurn"), rematerialize(all(characterYouControl()))))]);
const once = fixture(10, "character", () => [triggered(onMaterialized(), gainEnergy(1), { oncePerTurn: true })]);
const twice = fixture(11, "event", () => [event(sequence(rematerialize(all(characterYouControl())), rematerialize(all(characterYouControl()))))]);
const offPlaySelf = fixture(12, "event", () => [event(rematerialize(self()))]);
const failing: EngineCardDefinition = {
  ...fixture(13, "event", () => []),
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, sequence(rematerialize(all(characterYouControl())), optional(gainEnergy(1))), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after rematerialization");
  } },
};
const engine = createEngine(testCatalog([single, multiple, materialized, observer, enemyObserver, challenge, interrupt, bolster, suppressed, once, twice, offPlaySelf, failing]));
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); return this.pick(prompt); }
}
const setup = (card: EngineCardDefinition, extra: NonNullable<BoardSetup["player"]> = {}): BoardSetup => ({
  active: "player", phase: "day", player: { hand: [card.id], deck, ...extra }, enemy: { deck },
});
const cast = (start: ReturnType<typeof boardState>, side: "player" | "enemy", index = 0, source: AnswerSource = NO_PROMPTS) => {
  const observed: typeof rest.steps = [];
  const played = engine.apply(start.state, side, playFromHand(start.ids, side, index).action, source, (state, step, events) => observed.push({ state, step, events }));
  const rest = passUntil(engine, played.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...played.events, ...rest.events], steps: [...observed, ...rest.steps] };
};
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent without error");
  return outcome.slice;
};

describe("rematerialize", () => {
  it("distinguishes ordinary entry from rematerialization in public persisted events", () => {
    const start = boardState(engine.catalog, setup(materialized, { hand: [materialized.id, single.id] }));
    const id = start.ids.player.hand[0];
    const entered = cast(start, "player");
    const repeated = cast({ ...start, state: entered.state }, "player", 1, new ScriptedSource([[id]]));
    const events = [...entered.events, ...repeated.events].filter((event) => event.kind === "materialized");
    expect(events).toEqual([
      { kind: "materialized", instance: id, side: "player", slot: { rank: "back", index: 0 } },
      { kind: "materialized", instance: id, side: "player", slot: { rank: "back", index: 0 }, rematerialized: true },
    ]);
    expect(repeated.state.instances[id]).toEqual(entered.state.instances[id]);
    expect(entered.state.sides.player.currentEnergy).toBe(1);
    expect(repeated.state.sides.player.currentEnergy).toBe(2);
    for (const viewer of ["player", "enemy"] as const) {
      const visible = events.map((event) => eventSeenBy(event, viewer, repeated.state));
      expect(visible).toEqual(events);
      const reloaded = JSON.parse(JSON.stringify(visible)) as typeof visible;
      expect(reloaded).toEqual(events);
    }
  });

  it("fires own and both sides' materialize observers FIFO without playing the character", () => {
    const start = boardState(engine.catalog, { ...setup(multiple, { back: [materialized.id, observer.id, materialized.id] }), enemy: { back: [enemyObserver.id], deck } });
    const [first, watcher, second] = start.ids.player.back;
    const result = cast(start, "player", 0, new ScriptedSource([[second!, first!]]));
    expect(result.events.filter((event) => event.kind === "materialized")).toEqual([
      { kind: "materialized", instance: second, side: "player", slot: { rank: "back", index: 2 }, rematerialized: true },
      { kind: "materialized", instance: first, side: "player", slot: { rank: "back", index: 0 }, rematerialized: true },
    ]);
    expect(result.events.filter((event) => event.kind === "triggerResolved").map((event) => event.source)).toEqual([
      watcher, second, start.ids.enemy.back[0], first, watcher, start.ids.enemy.back[0],
    ]);
    expect(result.state.sides.player.currentEnergy).toBe(6);
    expect(result.state.sides.enemy.currentEnergy).toBe(6);
    expect(result.events.filter((event) => event.kind === "cardPlayed").map((event) => event.instance)).toEqual(start.ids.player.hand);
    expect(result.events.filter((event) => event.kind === "leftPlay")).toEqual([]);
    const resolving = result.steps.find((step) => step.step.kind === "resolveTop")!;
    expect(resolving.state.sides.player.currentEnergy).toBe(0);
    expect(resolving.state.triggerQueue).toHaveLength(6);
    expect(unannouncedChanges(result.events, start.state, result.state)).toEqual([]);
  });

  it("keeps ready and exhausted instances, position, gained spark, variant and floating effects even at capacity", () => {
    const start = boardState(engine.catalog, setup(bolster, { hand: [bolster.id, multiple.id], front: [v.vanilla1.id], back: Array(10).fill(v.vanilla2.id) }));
    const front = start.ids.player.front[0]!;
    const back = start.ids.player.back[7]!;
    start.state.instances[front].status.exhausted = true;
    start.state.instances[front].status.gainedSpark = 2;
    start.state.instances[front].status.counters = 3;
    start.state.instances[front].enteredZoneAt = 9;
    start.state.instances[back] = { ...start.state.instances[back], variant: { amplified: true } };
    const bolstered = cast(start, "player", 0, new ScriptedSource([[front]]));
    const before = structuredClone({ front: bolstered.state.instances[front], back: bolstered.state.instances[back], floating: bolstered.state.floating, ranks: [bolstered.state.sides.player.frontRank, bolstered.state.sides.player.backRank] });
    const result = cast({ ...start, state: bolstered.state }, "player", 1, new ScriptedSource([[front, back]]));
    expect({ front: result.state.instances[front], back: result.state.instances[back], floating: result.state.floating, ranks: [result.state.sides.player.frontRank, result.state.sides.player.backRank] }).toEqual(before);
    expect(result.events.filter((event) => event.kind === "materialized")).toHaveLength(2);
    expect(result.events.filter((event) => event.kind === "leftPlay" || event.kind === "effectEnded")).toEqual([]);
  });

  it("uses current controller for a stolen character and permits the enemy to rematerialize", () => {
    const start = boardState(engine.catalog, { active: "enemy", phase: "day", player: { deck }, enemy: { hand: [single.id], back: [materialized.id, observer.id], deck } });
    const id = start.ids.enemy.back[0]!;
    start.state.instances[id] = { ...start.state.instances[id], owner: "player" };
    const result = cast(start, "enemy", 0, new ScriptedSource([[id]]));
    expect(result.events).toContainEqual({ kind: "materialized", instance: id, side: "enemy", slot: { rank: "back", index: 0 }, rematerialized: true });
    expect(result.state.instances[id]).toEqual(start.state.instances[id]);
    expect(result.state.sides.enemy.currentEnergy).toBe(3);
    expect(result.state.sides.player.currentEnergy).toBe(0);
  });

  it("offers only friendly legal characters, requires a target, and permits choosing none when up to two", () => {
    const start = boardState(engine.catalog, { ...setup(single, { back: [v.vanilla1.id, materialized.id] }), enemy: { back: [v.vanilla1.id], deck } });
    const source = new Answers((prompt) => {
      if (prompt.kind !== "chooseTargets") throw new Error("expected target");
      return [prompt.candidates[1]];
    });
    cast(start, "player", 0, source);
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", candidates: start.ids.player.back, min: 1, max: 1, cancellable: true });
    const empty = boardState(engine.catalog, setup(single));
    expect(engine.legalActions(empty.state, "player").filter((action) => action.kind === "play")).toEqual([]);
    const optionalStart = boardState(engine.catalog, setup(multiple, { back: [materialized.id] }));
    const declined = cast(optionalStart, "player", 0, new ScriptedSource([[]]));
    expect(declined.events.filter((event) => event.kind === "materialized")).toEqual([]);
    expect(declined.state.sides.player.currentEnergy).toBe(0);
    const absent = cast(boardState(engine.catalog, setup(offPlaySelf)), "player");
    expect(absent.events.filter((event) => event.kind === "materialized")).toEqual([]);
  });

  it("rechecks multiple targets after an interrupt, keeping each surviving physical instance", () => {
    for (const count of [1, 2]) {
      const start = boardState(engine.catalog, { ...setup(count === 1 ? single : multiple, { back: [materialized.id, materialized.id] }), enemy: { hand: [interrupt.id], deck } });
      const selected = start.ids.player.back.slice(0, count).map((id) => id!);
      const played = engine.apply(start.state, "player", playFromHand(start.ids, "player").action, new ScriptedSource([selected]));
      const interrupted = engine.apply(played.state, "enemy", playFromHand(start.ids, "enemy").action, new ScriptedSource([[selected[0]]]));
      const result = passUntil(engine, interrupted.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0);
      expect([...interrupted.events, ...result.events].filter((event) => event.kind === "materialized").map((event) => event.instance)).toEqual(selected.slice(1));
      expect(result.state.instances[selected[0]].zone).toBe("banished");
      expect(result.state.sides.player.currentEnergy).toBe(count - 1);
      expect([...interrupted.events, ...result.events].filter((event) => event.kind === "noLegalTarget")).toHaveLength(count === 1 ? 1 : 0);
    }
  });

  it("chooses Challenge targets during resolution, includes the source, and applies variant target bounds", () => {
    for (const amplified of [false, true]) {
      const start = boardState(engine.catalog, setup(single, { hand: [], front: [challenge.id], back: [materialized.id] }));
      const id = start.ids.player.front[0]!;
      start.state.instances[id] = { ...start.state.instances[id], variant: { amplified } };
      const source = new Answers((prompt) => {
        if (prompt.kind !== "chooseTargets") throw new Error("expected target");
        return amplified ? [id, start.ids.player.back[0]!] : [start.ids.player.back[0]!];
      });
      const result = passUntil(engine, start.state, at(engine, "player", "night"), source);
      expect(source.prompts).toHaveLength(1);
      expect(source.prompts[0]).toMatchObject({ kind: "chooseTargets", candidates: [start.ids.player.back[0], id], min: amplified ? 0 : 1, max: amplified ? 2 : 1, cancellable: false });
      expect(result.events.filter((event) => event.kind === "materialized").map((event) => event.instance)).toEqual(amplified ? [id, start.ids.player.back[0]] : [start.ids.player.back[0]]);
    }
  });

  it("respects suppressed and once-per-turn triggers while announcing every rematerialization", () => {
    const disabled = cast(boardState(engine.catalog, setup(suppressed, { back: [materialized.id, observer.id] })), "player");
    expect(disabled.events.filter((event) => event.kind === "materialized")).toHaveLength(2);
    expect(disabled.events.filter((event) => event.kind === "triggerQueued")).toEqual([]);
    const limited = cast(boardState(engine.catalog, setup(twice, { back: [once.id, observer.id] })), "player");
    expect(limited.events.filter((event) => event.kind === "materialized")).toHaveLength(4);
    expect(limited.state.sides.player.currentEnergy).toBe(9);
    expect(limited.events.filter((event) => event.kind === "triggerResolved")).toHaveLength(5);
  });
});

describe("rematerialize fold recovery", () => {
  it("cancels safely, reloads target selection, rejects competing input and commits each trigger exactly once", () => {
    const { state, ids } = boardState(engine.catalog, { ...setup(single, { back: [materialized.id, observer.id] }), enemy: { hand: [interrupt.id], deck } });
    const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const open = applied(adapter.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const prompt = adapter.pending(open)!.prompt;
    const cancel = applied(adapter.reduce(open, { kind: "cancel", side: "player", promptId: prompt.id }));
    expect(cancel.committed).toEqual(state);
    const reloaded = JSON.parse(JSON.stringify(open)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(reloaded)!.prompt).toEqual(prompt);
    const answer = { kind: "answer", side: "player", promptId: prompt.id, value: [ids.player.back[0]!] } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { ...answer, value: [ids.enemy.deck[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const chosen = applied(fresh.reduce(reloaded, answer));
    expect(chosen.inFlight).toBeNull();
    expect(fresh.reduce(chosen, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const done = applied(fresh.reduce(chosen, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(done.committed.sides.player.currentEnergy).toBe(3);
    expect(done.committed.triggerQueue).toEqual([]);
    const replay = applied(adapter.reduce(open, answer));
    const replayDone = applied(adapter.reduce(replay, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(stateHash(done.committed)).toBe(stateHash(replayDone.committed));
    expect(JSON.parse(JSON.stringify(done))).toEqual(done);
  });

  it("rolls back emitted materialization and all queued triggers when the resolving step throws", () => {
    const { state, ids } = boardState(engine.catalog, { ...setup(failing, { back: [materialized.id, observer.id] }), enemy: { hand: [interrupt.id], deck } });
    const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const played = applied(adapter.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = applied(adapter.reduce(played, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(pending.committed).toEqual(played.committed);
    expect(pending.committed.triggerQueue).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(pending)) as BattleSlice;
    const prompt = adapter.pending(reloaded)!.prompt;
    const outcome = adapter.reduce(reloaded, { kind: "answer", side: "player", promptId: prompt.id, value: true });
    if (outcome.kind !== "applied") throw new Error("expected applied error");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(played.committed);
    expect(outcome.slice.inFlight).toBeNull();
  });
});
