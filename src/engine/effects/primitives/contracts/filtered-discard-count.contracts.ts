/** Actual instruction-local discard cohorts through public engine and fold contracts. */
import { describe, expect, it } from "vitest";
import { parsePromptId } from "../../../../types/identifiers";
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { additionalCost, cardsMovedBy, costOf, countDiscardedBy, discardCost, event, everyIn, self, stackItem, staticAbility, characterYouControl, all } from "../../../dsl/builders";
import { NO_DECK_MODS, type ValueExpr } from "../../../dsl/types";
import { triggered, whenDiscard, whenDiscardBatch } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { ResolvingEffect } from "../../registry";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, DeckEntry } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { misplacedMovedCardReads } from "../../../testing/moved-card-audit";
import { SYNTHETIC as v, SYNTHETIC_CARDS, syntheticId } from "../../../testing/synthetic-cards";
import * as p from "../index";

const sourceId = syntheticId(0xade000);
function makeEngine(build: () => ResolvingEffect, additions: readonly EngineCardDefinition[] = [], payment = false): Engine {
  const source: EngineCardDefinition = { ...v.event0, id: sourceId, status: "authored", abilities: () => [...(payment ? [additionalCost(discardCost())] : []), event(build())] };
  const changed = new Set(additions.map(c => c.id));
  return createEngine(createCatalog([...SYNTHETIC_CARDS.filter(c => !changed.has(c.id)), ...additions, source], []));
}
const countEffect = (count: number | ValueExpr, cardType: "character" | "event" = "event") => () => {
  const instruction = p.discard(count);
  return p.sequence(instruction, p.gainPoints(countDiscardedBy(instruction, cardType)));
};
function board(engine: Engine, hand: SideSetup["hand"], side: Side = "player", extras: SideSetup = {}) {
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100, [side]: { hand: [sourceId, ...(hand ?? [])], energy: 4, ...extras }, [opponent(side)]: {} });
}
function run(engine: Engine, b: ReturnType<typeof board>, side: Side = "player", choices: readonly (readonly InstanceId[])[] = []) {
  let index = 0;
  const answer = (prompt: Parameters<InlineSource["answer"]>[0]) => {
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return choices[index++] ?? prompt.candidates.slice(0, prompt.min);
    if (prompt.kind === "confirm") return true;
    throw new Error(`Unexpected synthetic prompt ${prompt.kind}`);
  };
  const answers = new InlineSource({ player: answer, enemy: answer });
  const events: EngineEvent[] = [];
  let out = engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, answers);
  events.push(...out.events);
  for (let passes = 0; out.state.stack.length > 0; passes++) {
    if (passes >= 40) throw new Error("Synthetic stack exceeded its finite step guard");
    const decision = engine.decision(out.state);
    if (decision === null) throw new Error("No stack decision");
    out = engine.apply(out.state, decision.side, { kind: "pass" }, answers);
    events.push(...out.events);
  }
  return { state: out.state, events };
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected fold result ${JSON.stringify(out)}`);
  return out.slice;
}

describe("filtered count of one discard instruction", () => {
  it.each([
    { count: 0, hand: [v.event1.id], score: 0 },
    { count: 1, hand: [v.event1.id], score: 1 },
    { count: 5, hand: [v.event1.id, v.event1.id], score: 2 },
    { count: 3, hand: [v.event1.id, v.vanilla1.id, v.event0.id], score: 2 },
    { count: 2, hand: [v.vanilla1.id, v.vanilla2.id], score: 0 },
  ])("counts actual event discards with $count requested", ({ count, hand, score }) => {
    const engine = makeEngine(countEffect(count)), b = board(engine, hand), done = run(engine, b);
    expect(done.state.sides.player.score).toBe(score);
    expect(done.events.filter(e => e.kind === "discarded")).toHaveLength(Math.min(count, hand.length));
  });

  it("captures chosen physical references, including created cessation, rather than all identical printings", () => {
    const engine = makeEngine(countEffect(2)), b = board(engine, [v.event1.id, v.event1.id, v.vanilla1.id]);
    const [created, retained, character] = b.ids.player.hand.slice(1);
    b.state.instances[created].status.created = true;
    const done = run(engine, b, "player", [[character, created]]);
    expect(done.state.sides.player.score).toBe(1);
    expect(done.state.instances[created]).toBeUndefined();
    expect(done.state.instances[retained].zone).toBe("hand");
    expect(done.events.filter(e => e.kind === "discarded").map(e => e.instance)).toEqual([created, character]);
  });

  it("matches effective pre-departure types rather than the printing", () => {
    const engine = makeEngine(countEffect(1));
    const asEvent: DeckEntry = { cardId: v.vanilla1.id, amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event" as const, subtype: "" } } };
    const asCharacter: DeckEntry = { cardId: v.event1.id, amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character" as const, subtype: "Warrior" } } };
    expect(run(engine, board(engine, [asEvent])).state.sides.player.score).toBe(1);
    expect(run(engine, board(engine, [asCharacter])).state.sides.player.score).toBe(0);
    const characters = makeEngine(countEffect(1, "character"));
    expect(run(characters, board(characters, [asCharacter])).state.sides.player.score).toBe(1);
    expect(run(characters, board(characters, [asEvent])).state.sides.player.score).toBe(0);
  });

  it("counts a reclaimed event banished by the discard replacement", () => {
    const engine = makeEngine(countEffect(1)), b = board(engine, [v.event1.id]);
    const selected = b.ids.player.hand[1];
    b.state.instances[selected].status.reclaimed = true;
    const done = run(engine, b);
    expect(done.state.instances[selected].zone).toBe("banished");
    expect(done.state.sides.player.void).not.toContain(selected);
    expect(done.state.sides.player.score).toBe(1);
  });

  it("keeps distinct sequential instruction captures through later draws and zone changes", () => {
    const engine = makeEngine(() => {
      const first = p.discard(1), second = p.discard(2);
      return p.sequence(first, second, p.draw(1), p.putInDeck([everyIn("void")], "bottom"), p.gainPoints(countDiscardedBy(first, "event")), p.gainEnergy(countDiscardedBy(second, "event")));
    });
    const b = board(engine, [v.event1.id, v.vanilla1.id, v.event0.id], "player", { deck: [v.vanilla2.id] });
    const done = run(engine, b);
    expect(done.state.sides.player.score).toBe(1);
    expect(done.state.sides.player.currentEnergy).toBe(5);
    expect(done.state.instances[b.ids.player.hand[1]].zone).toBe("deck");
  });

  it("replaces a reused instruction capture on every repeat, including zero remaining cards", () => {
    const engine = makeEngine(() => {
      const instruction = p.discard(1);
      return p.repeat(3, p.sequence(instruction, p.gainPoints(countDiscardedBy(instruction, "event"))));
    });
    expect(run(engine, board(engine, [v.event1.id])).state.sides.player.score).toBe(1);
    expect(run(engine, board(engine, [v.event1.id, v.vanilla1.id])).state.sides.player.score).toBe(1);
  });

  it("isolates independent resolutions and unrelated play-time discards", () => {
    const engine = makeEngine(countEffect(1), [], true);
    for (const side of ["player", "enemy"] as const) {
      const b = board(engine, [v.event1.id, v.vanilla1.id], side);
      expect(run(engine, b, side).state.sides[side].score).toBe(0);
    }
    const fresh = makeEngine(countEffect(1));
    expect(run(fresh, board(fresh, [v.event1.id])).state.sides.player.score).toBe(1);
    expect(run(fresh, board(fresh, [v.vanilla1.id])).state.sides.player.score).toBe(0);
  });

  it("preserves copiable cost and canonical per-card/batch triggers for the same physical discard", () => {
    const watcher: EngineCardDefinition = { ...v.vanilla0, status: "authored", abilities: () => [triggered(whenDiscard(), p.gainEnergy(1)), triggered(whenDiscardBatch(), p.gainEnergy(1))] };
    const engine = makeEngine(() => { const instruction = p.discard(2); return p.sequence(instruction, p.gainPoints(countDiscardedBy(instruction, "event")), p.gainPoints(costOf(cardsMovedBy(instruction)))); }, [watcher]);
    const b = board(engine, [v.event1.id, v.vanilla2.id], "player", { back: [watcher.id] });
    b.state.instances[b.ids.player.hand[1]].status.created = true;
    const done = run(engine, b);
    expect(done.state.sides.player.score).toBe(4);
    expect(done.state.sides.player.currentEnergy).toBe(7);
    expect(done.events.filter(e => e.kind === "discardBatch")).toMatchObject([{ side: "player", count: 2 }]);
    expect(done.events.filter(e => e.kind === "discarded")).toHaveLength(2);
  });

  it("rebuilds independent captures for a copied resolving event", () => {
    const copier: EngineCardDefinition = { ...v.interruptEvent, status: "authored", abilities: () => [event(p.copyCard({ kind: "stackTarget", selector: stackItem({ cardType: "event", controller: "opponent" }) }))] };
    const engine = makeEngine(countEffect(1), [copier]);
    const b = boardState(engine.catalog, { active: "player", phase: "day", scoreToWin: 100, player: { hand: [sourceId, v.event1.id], energy: 3 }, enemy: { hand: [copier.id, v.vanilla1.id], energy: 3 } });
    const answer = (prompt: Parameters<InlineSource["answer"]>[0]) => {
      if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
      throw new Error(`Unexpected copy prompt ${prompt.kind}`);
    };
    const answers = new InlineSource({ player: answer, enemy: answer });
    let state = engine.apply(b.state, "player", { kind: "play", card: b.ids.player.hand[0], from: "hand" }, answers).state;
    state = engine.apply(state, "enemy", { kind: "play", card: b.ids.enemy.hand[0], from: "hand" }, answers).state;
    for (let pass = 0; state.stack.length > 0; pass++) {
      if (pass >= 40) throw new Error("Copied stack exceeded finite step guard");
      const decision = engine.decision(state);
      if (decision === null) throw new Error("No copy stack decision");
      state = engine.apply(state, decision.side, { kind: "pass" }, answers).state;
    }
    expect(state.sides.player.score).toBe(1);
    expect(state.sides.enemy.score).toBe(0);
    expect(state.instances[b.ids.enemy.hand[1]].zone).toBe("void");
  });

  it("keeps the existing authoring gate for static, late, foreign and separate-resolution reads", () => {
    const instruction = p.discard(1), read = p.gainPoints(countDiscardedBy(instruction, "event"));
    expect(misplacedMovedCardReads([event(p.sequence(instruction, read))])).toEqual([]);
    expect(misplacedMovedCardReads([event(p.sequence(read, instruction))])).toMatchObject([{ reason: "notBefore" }]);
    expect(misplacedMovedCardReads([event(p.sequence(p.discard(1), read))])).toMatchObject([{ reason: "notBefore" }]);
    expect(misplacedMovedCardReads([staticAbility(p.sparkModifier(all(characterYouControl()), countDiscardedBy(instruction, "event")))])).toMatchObject([{ reason: "static" }]);
    expect(misplacedMovedCardReads([event(p.sequence(instruction, p.floating(whenDiscardBatch(), read)))])).toMatchObject([{ reason: "notBefore" }]);
    expect(misplacedMovedCardReads([event(p.chooseOne(instruction, read))])).toMatchObject([{ reason: "notBefore" }]);
  });
});

describe("instruction count transaction recovery", () => {
  it.each(["player", "enemy"] as const)("replays a capture after reload and rejects invalid/stale/competing answers for %s", side => {
    const engine = makeEngine(() => { const instruction = p.discard(1); return p.sequence(instruction, p.optional(p.gainPoints(0)), p.gainPoints(countDiscardedBy(instruction, "event"))); });
    const b = board(engine, [v.event1.id, v.vanilla1.id], side), fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const pending = fold.pending(opened)!;
    const chosen = b.ids[side].hand[1], before = JSON.stringify(opened);
    for (const value of [[chosen, chosen], [b.ids[side].hand[0]]]) expect(fold.reduce(opened, { kind: "answer", side, promptId: pending.prompt.id, value })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(opened, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: [chosen] })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(opened, { kind: "answer", side, promptId: parsePromptId("0:0:999"), value: [chosen] })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
    expect(JSON.stringify(opened)).toBe(before);
    const paused = applied(fold.reduce(opened, { kind: "answer", side, promptId: pending.prompt.id, value: [chosen] }));
    const confirmation = fold.pending(paused)!;
    expect(confirmation.prompt.kind).toBe("confirm");
    expect(paused.committed.sides[side].hand).toContain(chosen);
    const reloaded = JSON.parse(JSON.stringify(paused)) as BattleSlice, cold = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(cold.pending(reloaded)).toEqual(confirmation);
    const finish = (adapter: typeof fold, current: BattleSlice) => applied(adapter.reduce(current, { kind: "answer", side, promptId: confirmation.prompt.id, value: true }));
    const live = finish(fold, paused), saved = finish(cold, reloaded);
    expect(saved).toEqual(live);
    expect(saved.committed.sides[side].score).toBe(1);
    expect(fold.reduce(saved, { kind: "answer", side, promptId: confirmation.prompt.id, value: true })).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(saved.committed)).toBe(stateHash(run(engine, b, side, [[chosen]]).state));
  });

  it("rolls back an error after capture and recovers using a fresh independent resolution", () => {
    const failing = makeEngine(() => { const instruction = p.discard(1); return p.sequence(instruction, p.gainPoints(countDiscardedBy(instruction, "event")), p.gainAdditionalSpark(self(), 1)); });
    const b = board(failing, [v.event1.id]), before = stateHash(b.state);
    expect(() => run(failing, b)).toThrow();
    expect(stateHash(b.state)).toBe(before);
    expect(b.state.instances[b.ids.player.hand[1]].zone).toBe("hand");
    const recovered = makeEngine(countEffect(1));
    expect(run(recovered, b).state.sides.player.score).toBe(1);
    expect(stateHash(b.state)).toBe(before);
  });
});
