/** Whole-hand redraw preserves its captured count through ordinary zone replacements and fold replay. */
import { describe, expect, it } from "vitest";
import { parseDreamwellCardId, parsePromptId } from "../../../../types/identifiers";
import { createCatalog, type EngineCardDefinition, type EngineDreamwellDefinition } from "../../../catalog";
import { energy, event, self } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { triggered, whenDiscard, whenDraw, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC_CARDS, SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { gainEnergy } from "../gain-energy";
import { gainAdditionalSpark } from "../gain-spark";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { redrawHand } from "../redraw-hand";
import { sequence } from "../sequence";

function card(index: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition {
  return { id: syntheticId(0x56700 + index), cardType: character ? "character" : "event", costs: [energy(0)], spark: character ? 1 : null, subtype: character ? "Warrior" : "", speed: "standard", status: "authored", abilities };
}
const own = card(0, () => [event(redrawHand())]);
const other = card(1, () => [event(redrawHand("opponent"))]);
const pauseAfter = card(2, () => [event(sequence(redrawHand(), optional(gainPoints(1))))]);
const failing = card(3, () => [event(sequence(redrawHand(), gainAdditionalSpark(self(), 1)))]);
const watcher = card(4, () => [triggered(whenDiscard(), gainEnergy(1)), triggered(whenDraw(), gainPoints(1))], true);
const handSource = card(5, () => [triggered(whenYouPlay({ cardType: "event" }), redrawHand(), { zone: "hand", oncePerTurn: true })], true);
const well: EngineDreamwellDefinition = { id: parseDreamwellCardId("00000000-0000-4000-8000-000000056700"), order: 4, energyAdded: 0, status: "authored", abilities: () => [event(optional(redrawHand()))] };
const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, DSL.mayRedrawHand, own, other, pauseAfter, failing, watcher, handSource], [well]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla1.id];
const play = (card: InstanceId) => ({ kind: "play" as const, card, from: "hand" as const });
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`unexpected outcome ${JSON.stringify(out)}`);
  return out;
}
function setup(controller: Side = "player", source = own, ref: PlayerRef = "you") {
  const side = ref === "you" ? controller : opponent(controller);
  const board = boardState(engine.catalog, { active: controller, phase: "day", scoreToWin: 100,
    [controller]: { hand: [source.id, ...(side === controller ? [v.vanilla1.id, v.vanilla2.id] : [])], deck },
    [opponent(controller)]: { hand: side === controller ? [] : [v.vanilla1.id, v.vanilla2.id], deck } });
  return { ...board, side, source: board.ids[controller].hand[0], cohort: board.ids[side].hand.filter((id) => id !== board.ids[controller].hand[0]) };
}

describe("redrawHand", () => {
  it.each(["player", "enemy"] as const)("captures the whole instructed hand and discards it before drawing for controller %s", (controller) => {
    for (const ref of ["you", "opponent"] as const) {
      const b = setup(controller, ref === "you" ? own : other, ref);
      const before = stateHash(b.state);
      const result = engine.apply(b.state, controller, play(b.source), NO_PROMPTS);
      expect(result.events.filter((e) => e.kind === "discarded")).toEqual(b.cohort.map((instance) => ({ kind: "discarded", side: b.side, instance })));
      expect(result.events.filter((e) => e.kind === "cardDrawn")).toEqual(b.ids[b.side].deck.slice(0, 2).map((instance) => ({ kind: "cardDrawn", side: b.side, instance })));
      const discardEnd = result.events.map((e) => e.kind).lastIndexOf("discarded");
      expect(result.events.findIndex((e) => e.kind === "cardDrawn")).toBeGreaterThan(discardEnd);
      expect(result.state.sides[b.side].hand).toEqual(b.ids[b.side].deck.slice(0, 2));
      expect(result.state.sides[b.side].void.filter((id) => id !== b.source)).toEqual([...b.cohort].reverse());
      expect(result.state.turnLog.drawn[b.side]).toBe(2);
      expect(result.state.turnLog.drawn[opponent(b.side)]).toBe(0);
      expect(stateHash(b.state)).toBe(before);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
      expect(eventRedactionViolations(result.events, b.state, result.state)).toEqual([]);
      const drawn = result.events.find((e) => e.kind === "cardDrawn")!;
      expect(eventSeenBy(drawn, opponent(b.side), result.state)).toMatchObject({ kind: "cardDrawn", instance: null });
    }
  });

  it.each(["player", "enemy"] as const)("uses only the existing optional confirmation for %s, and decline leaves the cohort untouched", (controller) => {
    for (const accept of [false, true]) {
      const b = setup(controller, DSL.mayRedrawHand);
      const answers = new ScriptedSource([accept]);
      const result = engine.apply(b.state, controller, play(b.source), answers);
      answers.assertExhausted();
      expect(result.state.sides[controller].hand).toEqual(accept ? b.ids[controller].deck.slice(0, 2) : b.cohort);
      expect(result.events.filter((e) => e.kind === "discarded")).toHaveLength(accept ? 2 : 0);
      expect(result.events.filter((e) => e.kind === "cardDrawn")).toHaveLength(accept ? 2 : 0);
    }
  });

  it("an empty hand attempts no draws and causes no Fatigue", () => {
    const b = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [own.id], deck: [] }, enemy: { deck } });
    const result = engine.apply(b.state, "player", play(b.ids.player.hand[0]), NO_PROMPTS);
    expect(result.state.sides.player.hand).toEqual([]);
    expect(result.events.filter((e) => e.kind === "discarded" || e.kind === "cardDrawn" || e.kind === "fatigue")).toEqual([]);
  });

  it("counts created and reclaimed discards even when they cease or are banished", () => {
    const b = setup();
    b.state.instances[b.cohort[0]].status.created = true;
    b.state.instances[b.cohort[1]].status.reclaimed = true;
    const result = engine.apply(b.state, "player", play(b.source), NO_PROMPTS);
    expect(result.state.instances[b.cohort[0]]).toBeUndefined();
    expect(result.state.instances[b.cohort[1]]?.zone).toBe("banished");
    expect(result.state.sides.player.void).toEqual([b.source]);
    expect(result.events.filter((e) => e.kind === "discarded").map((e) => e.instance)).toEqual(b.cohort);
    expect(result.state.sides.player.hand).toEqual(b.ids.player.deck.slice(0, 2));
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("draws the available deck and applies ordinary increasing Fatigue for each missing draw", () => {
    const b = setup();
    b.state.sides.player.deck = b.ids.player.deck.slice(0, 1);
    for (const id of b.ids.player.deck.slice(1)) delete b.state.instances[id];
    const result = engine.apply(b.state, "player", play(b.source), NO_PROMPTS);
    expect(result.state.sides.player.hand).toEqual(b.ids.player.deck.slice(0, 1));
    expect(result.events.filter((e) => e.kind === "fatigue")).toEqual([{ kind: "fatigue", side: "player", points: 1 }]);
    expect(result.state.sides.enemy.score).toBe(1);
    expect(result.state.turnLog.drawn.player).toBe(1);
    const empty = setup();
    for (const id of empty.ids.player.deck) delete empty.state.instances[id];
    empty.state.sides.player.deck = [];
    const exhausted = engine.apply(empty.state, "player", play(empty.source), NO_PROMPTS);
    expect(exhausted.events.filter((e) => e.kind === "fatigue")).toEqual([{ kind: "fatigue", side: "player", points: 1 }, { kind: "fatigue", side: "player", points: 2 }]);
    expect(exhausted.state.sides.enemy.score).toBe(3);
  });

  it("ordinary discard and draw triggers queue in occurrence order and resolve after the entire redraw", () => {
    const b = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [own.id, v.vanilla1.id, v.vanilla2.id], back: [watcher.id], deck }, enemy: { deck } });
    const result = engine.apply(b.state, "player", play(b.ids.player.hand[0]), NO_PROMPTS);
    expect(result.events.filter((e) => e.kind === "triggerQueued").map((e) => e.ability)).toEqual([0, 0, 1, 1]);
    expect(result.events.findIndex((e) => e.kind === "triggerResolved")).toBeGreaterThan(result.events.map((e) => e.kind).lastIndexOf("cardDrawn"));
    expect(result.state.sides.player.currentEnergy).toBe(2);
    expect(result.state.sides.player.score).toBe(2);
  });

  it("includes a physically held ability source, while an event source already on the stack is excluded by zone", () => {
    const b = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [v.event0.id, handSource.id, v.vanilla1.id], deck }, enemy: { deck } });
    const result = engine.apply(b.state, "player", play(b.ids.player.hand[0]), NO_PROMPTS);
    expect(result.events.filter((e) => e.kind === "discarded").map((e) => e.instance)).toEqual(b.ids.player.hand.slice(1));
    expect(result.state.sides.player.hand).toEqual(b.ids.player.deck.slice(0, 2));
    expect(result.state.instances[b.ids.player.hand[1]]?.zone).toBe("void");
  });

  it.each(["player", "enemy"] as const)("a Dreamwell source preserves every held card in controller %s's captured count", (controller) => {
    const b = boardState(engine.catalog, { active: opponent(controller), phase: "night", scoreToWin: 100,
      [controller]: { hand: [v.vanilla1.id, v.vanilla2.id], deck }, [opponent(controller)]: { deck } });
    b.state.dreamwell = { deck: [well.id], next: 0, catalog: [] };
    const result = engine.apply(b.state, opponent(controller), { kind: "pass" }, new ScriptedSource([true]));
    expect(result.events.filter((e) => e.kind === "discarded").map((e) => e.instance)).toEqual(b.ids[controller].hand);
    expect(result.state.sides[controller].void).toEqual([...b.ids[controller].hand].reverse());
    expect(result.state.sides[controller].hand).toEqual(b.ids[controller].deck.slice(0, 3));
    expect(result.state.turnLog.drawn[controller]).toBe(3);
  });

  it.each(["player", "enemy"] as const)("suspends before any redraw for %s, reloads identically and publishes the accepted effects once", (controller) => {
    const b = setup(controller, DSL.mayRedrawHand);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: controller, action: play(b.source) }));
    const pending = fold.pending(start.slice)!;
    expect(pending.prompt).toMatchObject({ kind: "confirm", side: controller, purpose: { role: "youMay" } });
    expect(pending.display.sides[controller].hand).toEqual(b.cohort);
    expect(start.published.some((e) => e.kind === "discarded" || e.kind === "cardDrawn")).toBe(false);
    const reloaded = JSON.parse(JSON.stringify(start.slice)) as BattleSlice;
    expect(fold.pending(reloaded)).toEqual(pending);
    expect(fold.reduce(reloaded, { kind: "battleAction", side: controller, action: { kind: "pass" } }).kind).toBe("bounced");
    for (const answer of [
      { side: opponent(controller), promptId: pending.prompt.id, value: true },
      { side: controller, promptId: parsePromptId("0:0:0"), value: true },
      { side: controller, promptId: pending.prompt.id, value: [] },
    ] as const) expect(fold.reduce(reloaded, { kind: "answer", ...answer }).kind).toBe("bounced");
    const accepted = applied(fold.reduce(reloaded, { kind: "answer", side: controller, promptId: pending.prompt.id, value: true }));
    const inline = engine.apply(b.state, controller, play(b.source), new ScriptedSource([true]));
    expect(stateHash(accepted.slice.committed)).toBe(stateHash(inline.state));
    expect([...start.published, ...accepted.published]).toEqual(inline.events);
    expect(fold.reduce(accepted.slice, { kind: "answer", side: controller, promptId: pending.prompt.id, value: true }).kind).toBe("bounced");
    expect(stateHash(deserializeState(serializeState(accepted.slice.committed)))).toBe(stateHash(inline.state));
  });

  it("replays a complete published redraw prefix at a later optional suspension without duplicating cards or events", () => {
    const b = setup("player", pauseAfter);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const suspended = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: play(b.source) }));
    const pending = fold.pending(suspended.slice)!;
    expect(pending.display.sides.player.hand).toEqual(b.ids.player.deck.slice(0, 2));
    expect(suspended.slice.committed.sides.player.hand).toEqual(b.cohort);
    expect(suspended.published.filter((e) => e.kind === "discarded")).toHaveLength(2);
    expect(suspended.published.filter((e) => e.kind === "cardDrawn")).toHaveLength(2);
    const reloaded = JSON.parse(JSON.stringify(suspended.slice)) as BattleSlice;
    const result = applied(fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true }));
    const inline = engine.apply(b.state, "player", play(b.source), new ScriptedSource([true]));
    expect(stateHash(result.slice.committed)).toBe(stateHash(inline.state));
    expect([...suspended.published, ...result.published]).toEqual(inline.events);
  });

  it("rolls back a failing redraw step without publishing discard, draw, or trigger prefixes", () => {
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: {
      hand: [failing.id, v.vanilla1.id, v.vanilla2.id], back: [watcher.id], deck }, enemy: { deck } });
    const b = { ...board, source: board.ids.player.hand[0], cohort: board.ids.player.hand.slice(1) };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const out = fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: play(b.source) });
    if (out.kind !== "applied" || out.error === null) throw new Error("expected invalid event-source spark change");
    expect(out.slice.committed.sides.player.hand).toEqual(b.cohort);
    expect(out.slice.committed.sides.player.deck).toEqual(b.ids.player.deck);
    expect(out.slice.committed.turnLog.drawn.player).toBe(0);
    expect(out.slice.committed.triggerQueue).toEqual([]);
    expect(out.published.some((e) => e.kind === "discarded" || e.kind === "cardDrawn" || e.kind === "triggerQueued")).toBe(false);
    expect(stateHash(b.state)).toBe(stateHash(deserializeState(serializeState(b.state))));
  });
});
