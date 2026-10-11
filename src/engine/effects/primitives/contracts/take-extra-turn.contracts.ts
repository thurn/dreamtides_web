import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, energy, event, exhaustSelf } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords, type EngineLogRecord } from "../../../log";
import { instanceOrigin, oncePerTurnKey } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { PHASES, opponent } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { STACK, STACK_CARDS } from "../../../testing/stack-cards";
import { SYNTHETIC as v, SYNTHETIC_DREAMWELL, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { eachPlayer } from "../each-player";
import { forDuration } from "../for-duration";
import { gainEnergy } from "../gain-energy";
import { optional } from "../optional";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";
import { takeExtraTurn } from "../take-extra-turn";

const grant: EngineCardDefinition = {
  id: syntheticId(0x11200), cardType: "event", costs: [energy(1)], spark: null,
  subtype: "", speed: "standard", status: "authored", abilities: () => [event(takeExtraTurn())],
};
const interrupt = { ...grant, id: syntheticId(0x11201), speed: "interrupt" } as const;
const both = { ...grant, id: syntheticId(0x11202), abilities: () => [event(eachPlayer(takeExtraTurn()))] };
const enduring = {
  ...grant, id: syntheticId(0x11203), abilities: () => [event(sequence(
    forDuration("untilEndOfTurn", sparkModifier(all(characterYouControl()), 1)),
    forDuration("untilYourNextTurn", sparkModifier(all(characterYouControl()), 2)),
    takeExtraTurn(),
  ))],
};
const once: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(0x11204), status: "authored",
  abilities: () => [activated([exhaustSelf()], gainEnergy(1), { oncePerTurn: true })],
};
const partial = { ...grant, id: syntheticId(0x11205), abilities: () => [event(sequence(takeExtraTurn(), optional(gainEnergy(1))))] };
const fault: EngineCardDefinition = {
  ...partial, id: syntheticId(0x11206), abilities: () => [],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, sequence(takeExtraTurn(), optional(gainEnergy(1))), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
      ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after the extra turn");
  } },
};
const engine = createEngine(testCatalog([grant, interrupt, both, enduring, once, partial, fault, ...STACK_CARDS]));
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function passUntil(state: BattleState, done: (state: BattleState) => boolean) {
  const events: EngineEvent[] = [];
  for (let guard = 0; !done(state) && state.result === null && guard < 200; guard++) {
    const decision = engine.decision(state);
    if (decision === null) break;
    const next = engine.apply(state, decision.side, { kind: "pass" }, NO_PROMPTS);
    state = next.state;
    events.push(...next.events);
  }
  expect(done(state) || state.result !== null).toBe(true);
  return { state, events };
}
const grants = (events: readonly EngineEvent[]) => events.filter((entry) => entry.kind === "extraTurnGranted");
const starts = (events: readonly EngineEvent[]) => events.flatMap((entry) => entry.kind === "turnStarted" ? [{ side: entry.side, round: entry.round, extra: entry.extra }] : []);

describe("takeExtraTurn", () => {
  it.each(["player", "enemy"] as const)("queues and announces a turn for its %s controller and replays identically", (side) => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [grant.id], energy: 2, deck }, [opponent(side)]: { deck } });
    const source = ids[side].hand[0];
    const action = { kind: "play", card: source, from: "hand" } as const;
    const first = engine.apply(state, side, action, NO_PROMPTS);
    expect(first.state.turn.extraTurns).toEqual([side]);
    expect(first.state.turn.active).toBe(side);
    expect(grants(first.events)).toEqual([{ kind: "extraTurnGranted", side, source }]);
    expect(eventLogRecords(first.events, state.version)).toContainEqual({ event: "engine.extraTurn", version: state.version, detail: grants(first.events)[0] });
    const saved = JSON.parse(JSON.stringify(state)) as BattleState;
    const replay = engine.apply(saved, side, action, new ScriptedSource(first.answers.map((answer) => answer.value)));
    expect(replay).toEqual(first);
    expect(stateHash(replay.state)).toBe(stateHash(first.state));
    expect(state.turn.extraTurns).toEqual([]);
    expect(invariantViolations(first.state, engine.catalog)).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("grants %s a turn during the opponent's turn when its Interrupt resolves", (side) => {
    const active = opponent(side);
    const { state, ids } = boardState(engine.catalog, { active, phase: "day", [active]: { hand: [v.event0.id], deck }, [side]: { hand: [interrupt.id], energy: 1, deck } });
    const waiting = engine.apply(state, active, { kind: "play", card: ids[active].hand[0], from: "hand" }, NO_PROMPTS).state;
    expect(engine.decision(waiting)).toEqual({ kind: "respond", side });
    const result = engine.apply(waiting, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.state.turn.active).toBe(active);
    expect(result.state.turn.extraTurns).toEqual([side]);
    const next = passUntil(result.state, (current) => current.turn.extra && current.turn.phase === "day");
    expect(next.state.turn.active).toBe(side);
    expect(next.state.turn.round).toBe(state.turn.round);
  });

  it("consumes multiple granted turns last-in-first-out, runs every phase and resumes normal order", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", round: 1, player: { hand: [both.id], energy: 1, deck }, enemy: { deck } });
    state.dreamwell = { deck: SYNTHETIC_DREAMWELL.map((card) => card.id), next: 0, catalog: SYNTHETIC_DREAMWELL.map((card) => card.id) };
    const queued = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(queued.state.turn.extraTurns).toEqual(["player", "enemy"]);
    const first = passUntil(queued.state, (current) => current.turn.extra && current.turn.phase === "day");
    expect(first.state.turn).toMatchObject({ active: "enemy", round: 1, extraTurns: ["player"] });
    const second = passUntil(first.state, (current) => current.turn.active === "player" && current.turn.extra && current.turn.phase === "day");
    const resumed = passUntil(second.state, (current) => !current.turn.extra && current.turn.active === "enemy" && current.turn.phase === "day");
    const events = [...first.events, ...second.events, ...resumed.events];
    expect(starts(events)).toEqual([{ side: "enemy", round: 1, extra: true }, { side: "player", round: 1, extra: true }, { side: "enemy", round: 1, extra: false }]);
    for (const side of ["player", "enemy"] as const) {
      expect(events.filter((entry) => entry.kind === "dreamwellDrawn" && entry.side === side)).toHaveLength(1);
      const start = events.findIndex((entry) => entry.kind === "turnStarted" && entry.side === side && entry.extra);
      const end = events.findIndex((entry, index) => index > start && entry.kind === "turnStarted");
      const turn = events.slice(start, end);
      expect(turn.flatMap((entry) => entry.kind === "phaseChanged" ? [entry.phase] : [])).toEqual([...PHASES]);
      expect(turn.filter((entry) => entry.kind === "cardDrawn" && entry.side === side)).toHaveLength(1);
    }
    expect(resumed.state.turn.extraTurns).toEqual([]);
  });

  it("takes a granted extra turn at the round limit before the next normal round draws", () => {
    const { state: initial, ids } = boardState(engine.catalog, { active: "enemy", phase: "day", round: 50, player: { deck }, enemy: { hand: [grant.id], energy: 1, deck } });
    const state = { ...initial, config: { ...initial.config, turnLimit: 50 } };
    const queued = engine.apply(state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS).state;
    const extra = passUntil(queued, (current) => current.turn.extra && current.turn.phase === "day");
    expect(extra.state.result).toBeNull();
    expect(extra.state.turn).toMatchObject({ active: "enemy", round: 50 });
    const ended = passUntil(extra.state, () => false);
    expect(ended.state.result).toEqual({ kind: "draw", reason: "turnLimit" });
    expect(starts(ended.events)).toEqual([]);
  });

  it("uses the extra turn for duration expiry, energy, turn logs, exhaustion and once-per-turn reset", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [enduring.id], back: [once.id], energy: 3, deck }, enemy: { deck } });
    const source = ids.player.back[0]!;
    const used = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    expect(used.instances[source]?.status.exhausted).toBe(true);
    expect(used.oncePerTurn).toContain(oncePerTurnKey(source, 0));
    const queued = engine.apply(used, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    expect(queued.floating).toHaveLength(2);
    const next = passUntil(queued, (current) => current.turn.extra && current.turn.phase === "day");
    expect(next.state.floating).toEqual([]);
    expect(next.state.oncePerTurn).toEqual([]);
    expect(next.state.turn.sideTurns.player).toBe(state.turn.sideTurns.player + 1);
    expect(next.state.turnLog.played.player).toEqual([]);
    expect(next.state.sides.player.currentEnergy).toBe(next.state.sides.player.maxEnergy);
    expect(next.state.instances[source]?.status.exhausted).toBe(false);
    expect(engine.legalActions(next.state, "player")).toContainEqual({ kind: "activate", source, ability: 0 });
  });

  it("announces the granted side publicly while redacting hidden or ceased source identities", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [grant.id], deck: [grant.id] }, enemy: { deck } });
    for (const source of [ids.player.hand[0], ids.player.deck[0]]) {
      const entry = { kind: "extraTurnGranted", side: "player", source } as const;
      expect(eventSeenBy(entry, "enemy", state)).toEqual({ ...entry, source: null });
    }
    const entry = { kind: "extraTurnGranted", side: "player", source: ids.player.hand[0] } as const;
    expect(eventSeenBy(entry, "player", state)).toEqual(entry);
    const ceased = { ...state, instances: { ...state.instances } };
    delete ceased.instances[entry.source];
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(entry, viewer, ceased)).toEqual({ ...entry, source: null });
  });

  it("a prevented event grants nothing", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [grant.id], energy: 1, deck }, enemy: { hand: [STACK.preventEvent.id], energy: 1, deck } });
    const waiting = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    const result = engine.apply(waiting, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new ScriptedSource([[ids.player.hand[0]]]));
    expect(result.state.turn.extraTurns).toEqual([]);
    expect(grants(result.events)).toEqual([]);
  });

  it.each([partial, fault])("keeps an enclosing suspended step atomic, replayable and guarded ($id)", (card) => {
    const records: EngineLogRecord[] = [];
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id], energy: 1, deck }, enemy: { deck } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const intent = { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } } as const;
    expect(fold.reduce(sliceOf(state), { ...intent, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourDecision" });
    const opened = applied(fold.reduce(sliceOf(state), intent));
    const pending = fold.pending(opened)!;
    expect(opened.committed.turn.extraTurns).toEqual([]);
    expect(pending.display.turn.extraTurns).toEqual(["player"]);
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce(saved, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, intent)).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const result = fresh.reduce(saved, answer);
    expect(result).toEqual(fold.reduce(opened, answer));
    if (result.kind !== "applied") throw new Error("expected answer to run");
    expect(result.slice.inFlight).toBeNull();
    expect(fresh.reduce(result.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    if (card === fault) {
      expect(result.error?.message).toMatch(/synthetic failure/);
      expect(result.slice.committed.turn.extraTurns).toEqual([]);
      expect(result.slice.committed.rng).toEqual(opened.committed.rng);
      expect(result.published).toEqual([]);
    } else {
      expect(result.error).toBeNull();
      expect(result.slice.committed.turn.extraTurns).toEqual(["player"]);
      expect(records.filter((record) => record.event === "engine.extraTurn")).toHaveLength(1);
      expect(fresh.reduce(result.slice, intent)).toEqual({ kind: "bounced", reason: "illegalAction" });
    }
  });
});
