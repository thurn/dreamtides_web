import { describe, expect, it } from "vitest";
import { parseDreamwellCardId, parsePromptId } from "../../../../types/identifiers";
import { createCatalog, type EngineCardDefinition, type EngineDreamwellDefinition } from "../../../catalog";
import { event, self } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { STACK } from "../../../testing/stack-cards";
import { SYNTHETIC_CARDS, SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { chooseOne } from "../choose-one";
import { drawDreamwell } from "../draw-dreamwell";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { gainAdditionalSpark } from "../gain-spark";
import { sequence } from "../sequence";

function well(index: number, effect: Parameters<typeof event>[0], energyAdded = 1): EngineDreamwellDefinition {
  return { id: parseDreamwellCardId(`00000000-0000-4000-8000-${(0x21200 + index).toString(16).padStart(12, "0")}`),
    order: 3, energyAdded, status: "authored", abilities: () => [event(effect)] };
}
const outer = well(0, sequence(drawDreamwell(), gainPoints(7)));
const bonus = well(1, gainPoints(4), 2);
const nested = well(2, drawDreamwell(), 0);
const modal = well(3, sequence(gainEnergy(2), chooseOne(gainPoints(2), gainPoints(5))), 2);
const bad = well(4, sequence(gainEnergy(2), gainAdditionalSpark(self(), 1)), 2);
const badOuter = well(5, sequence(drawDreamwell(), gainAdditionalSpark(self(), 1)));
const definitions = [outer, bonus, nested, modal, bad, badOuter];
const drawEvent = (index: number, player: PlayerRef): EngineCardDefinition => ({ ...v.event0, id: syntheticId(0x21200 + index),
  status: "authored", abilities: () => [event(drawDreamwell(player))] });
const ownEvent = drawEvent(0, "you");
const otherEvent = drawEvent(1, "opponent");
const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, ownEvent, otherEvent, STACK.preventEvent], definitions));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`unexpected outcome ${JSON.stringify(out)}`);
  return out;
}
function beforeDraw(cards: readonly EngineDreamwellDefinition[], side: Side = "player") {
  const board = boardState(engine.catalog, { active: opponent(side), phase: "night", round: 2, scoreToWin: 100,
    player: { energy: 2, deck }, enemy: { energy: 2, deck } });
  board.state.dreamwell = { deck: cards.map((w) => w.id), next: 0, catalog: [bonus.id] };
  return board.state;
}
function opening() {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const out = applied(fold.reduce(sliceOf(beforeDraw([outer, modal])), { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
  const pending = fold.pending(out.slice);
  if (pending === null) throw new Error("missing bonus prompt");
  return { fold, out, pending };
}

describe("drawDreamwell", () => {
  it.each(["player", "enemy"] as const)("draws the shared next card with its refill and FIFO bonus for %s", (side) => {
    const result = engine.apply(beforeDraw([outer, bonus], side), opponent(side), { kind: "pass" }, NO_PROMPTS);
    expect(result.state.dreamwell.next).toBe(2);
    expect(result.state.sides[side]).toMatchObject({ maxEnergy: 5, currentEnergy: 5, score: 11 });
    expect(result.state.sides[opponent(side)]).toMatchObject({ maxEnergy: 2, currentEnergy: 2, score: 0 });
    expect(result.events.filter((e) => e.kind === "dreamwellDrawn")).toEqual([
      { kind: "dreamwellDrawn", side, card: outer.id, energyAdded: 1 },
      { kind: "dreamwellDrawn", side, card: bonus.id, energyAdded: 2 },
    ]);
    expect(result.events.filter((e) => e.kind === "pointsScored").map((e) => e.amount)).toEqual([7, 4]);
    const secondDraw = result.events.findIndex((e) => e.kind === "dreamwellDrawn" && e.card === bonus.id);
    const refresh = result.events.findIndex((e) => e.kind === "energyChanged" && e.max === 5);
    const scores = result.events.findIndex((e) => e.kind === "pointsScored");
    expect(secondDraw).toBeGreaterThanOrEqual(0);
    expect(refresh).toBeGreaterThan(secondDraw);
    expect(scores).toBeGreaterThan(refresh);
    expect(result.events.filter((e) => e.kind === "triggerResolved").map((e) => e.source)).toEqual([
      { kind: "dreamwell", side, id: outer.id }, { kind: "dreamwell", side, id: bonus.id },
    ]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it("resolves a chain of additional draws in FIFO order, including zero-energy cards", () => {
    const result = engine.apply(beforeDraw([outer, nested, bonus]), "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.dreamwell.next).toBe(3);
    expect(result.state.sides.player).toMatchObject({ maxEnergy: 5, currentEnergy: 5, score: 11 });
    expect(result.events.filter((e) => e.kind === "dreamwellDrawn").map((e) => e.card)).toEqual([outer.id, nested.id, bonus.id]);
  });

  it.each(["player", "enemy"] as const)("resolves you and opponent relative to the source controller %s", (controller) => {
    for (const definition of [ownEvent, otherEvent]) {
      const side = definition === ownEvent ? controller : opponent(controller);
      const board = boardState(engine.catalog, { active: controller, phase: "day", scoreToWin: 100,
        [controller]: { hand: [definition.id], deck, energy: 2 }, [opponent(controller)]: { deck, energy: 2 } });
      board.state.dreamwell = { deck: [bonus.id], next: 0, catalog: [bonus.id] };
      const result = engine.apply(board.state, controller, { kind: "play", card: board.ids[controller].hand[0], from: "hand" }, NO_PROMPTS);
      expect(result.state.sides[side]).toMatchObject({ maxEnergy: 4, currentEnergy: 4, score: 4 });
      expect(result.state.sides[opponent(side)].maxEnergy).toBe(2);
      expect(result.events.filter((e) => e.kind === "dreamwellDrawn")).toEqual([{ kind: "dreamwellDrawn", side, card: bonus.id, energyAdded: 2 }]);
    }
  });

  it("continues into a catalog cycle when the shared deck is exhausted", () => {
    const result = engine.apply(beforeDraw([outer]), "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.dreamwell.next).toBe(2);
    expect(result.state.dreamwell.deck).toEqual([outer.id, bonus.id]);
    expect(result.state.sides.player).toMatchObject({ maxEnergy: 5, currentEnergy: 5, score: 11 });
  });

  it("settles an additional draw against an empty catalog without a fabricated card", () => {
    const start = beforeDraw([outer]); start.dreamwell.catalog = [];
    const result = engine.apply(start, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.dreamwell.next).toBe(1);
    expect(result.state.sides.player).toMatchObject({ maxEnergy: 3, currentEnergy: 3, score: 7 });
    expect(result.events.filter((e) => e.kind === "dreamwellDrawn")).toHaveLength(1);
  });

  it("lets an actual Interrupt prevent an event before it draws a Dreamwell card", () => {
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [ownEvent.id], deck, energy: 3 },
      enemy: { hand: [STACK.preventEvent.id], deck, energy: 3 } });
    board.state.dreamwell = { deck: [bonus.id], next: 0, catalog: [bonus.id] };
    const first = engine.apply(board.state, "player", { kind: "play", card: board.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(first.state.stack).toHaveLength(1);
    const result = engine.apply(first.state, "enemy", { kind: "play", card: board.ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    expect(result.state.dreamwell.next).toBe(0);
    expect(result.state.sides.player.maxEnergy).toBe(3);
    expect(result.events.some((e) => e.kind === "prevented")).toBe(true);
    expect(result.events.some((e) => e.kind === "dreamwellDrawn")).toBe(false);
  });

  it("rolls back a failing step's additional draw and retains the preceding committed draw", () => {
    const start = beforeDraw([badOuter, bonus]); start.turn.phase = "ending";
    const drawn = runStep(start, { kind: "advancePhase" }, NO_PROMPTS, engine.catalog);
    if (drawn.kind !== "done") throw new Error("unexpected draw prompt");
    const hash = stateHash(drawn.state);
    expect(() => runStep(drawn.state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    expect(stateHash(drawn.state)).toBe(hash);
    expect(drawn.state.dreamwell.next).toBe(1);
    expect(drawn.state.sides.player.maxEnergy).toBe(3);
    expect(drawn.state.triggerQueue).toHaveLength(1);
  });

  it("retains the additional draw when its separately queued child bonus fails", () => {
    const out = createFoldAdapter(engine).reduce(sliceOf(beforeDraw([outer, bad])), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (out.kind !== "applied") throw new Error("missing failed bonus outcome");
    expect(out.error).not.toBeNull();
    expect(out.slice.committed.dreamwell.next).toBe(2);
    expect(out.slice.committed.sides.player).toMatchObject({ maxEnergy: 5, currentEnergy: 5, score: 7 });
    expect(out.slice.committed.triggerQueue).toHaveLength(1);
  });

  it("reconstructs a suspended child after reload, committing the additional draw once", () => {
    const { fold, out, pending } = opening();
    expect(out.slice.committed.dreamwell.next).toBe(2);
    expect(out.slice.committed.sides.player).toMatchObject({ maxEnergy: 5, currentEnergy: 5, score: 7 });
    expect(pending.display.sides.player.currentEnergy).toBe(5);
    expect(pending.prompt.purpose.source).toEqual({ kind: "dreamwell", side: "player", id: modal.id });
    expect(stateHash(deserializeState(serializeState(out.slice.committed)))).toBe(stateHash(out.slice.committed));
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 } as const;
    const replay = applied(createFoldAdapter(engine).reduce(JSON.parse(JSON.stringify(out.slice)) as BattleSlice, answer));
    const direct = applied(fold.reduce(out.slice, answer));
    expect(stateHash(replay.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(replay.slice.committed.dreamwell.next).toBe(2);
    expect(replay.slice.committed.sides.player).toMatchObject({ maxEnergy: 5, currentEnergy: 7, score: 9 });
    expect([...out.published, ...replay.published].filter((e) => e.kind === "dreamwellDrawn")).toHaveLength(2);
  });

  it("bounces foreign, stale, invalid, concurrent and repeated answers without drawing again", () => {
    const { fold, out, pending } = opening();
    const hash = stateHash(out.slice.committed);
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 } as const;
    expect(fold.reduce(out.slice, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(out.slice, { ...answer, promptId: parsePromptId("0:0:0") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fold.reduce(out.slice, { ...answer, value: 99 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(out.slice, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(stateHash(out.slice.committed)).toBe(hash);
    const first = applied(fold.reduce(out.slice, answer));
    expect(fold.reduce(first.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const replica = applied(createFoldAdapter(engine).reduce(JSON.parse(JSON.stringify(out.slice)) as BattleSlice, answer));
    expect(stateHash(replica.slice.committed)).toBe(stateHash(first.slice.committed));
    expect(first.slice.committed.dreamwell.next).toBe(2);
    expect(first.slice.committed.sides.player.score).toBe(9);
  });
});
