/** One discard occasion captures its actual count while existing card triggers keep their order. */
import { describe, expect, it } from "vitest";
import { createFoldAdapter } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { opponent } from "../../../state/ids";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { D, applied, deck, engine, run, setup, slice, v } from "./discard-batch-support";

const batches = (result: ReturnType<typeof run>) => result.events.filter((e) => e.kind === "discardBatch");
const triggerDraws = (result: ReturnType<typeof run>) => result.steps.filter((step) => step.kind === "resolveTrigger").flatMap((step) => step.events).filter((e) => e.kind === "cardDrawn");

describe("discard batch occasions", () => {
  it.each(["player", "enemy"] as const)("distinguishes zero, one and multiple cards for %s without changing per-card announcements", (side) => {
    for (const [source, count] of [[D.zero, 0], [D.one, 1], [D.three, 3]] as const) {
      const b = setup(side, source), before = stateHash(b.state);
      const done = run(b.state, side, b.action);
      expect(batches(done)).toEqual(count === 0 ? [] : [{ kind: "discardBatch", side, count }]);
      expect(done.events.filter((e) => e.kind === "discarded")).toEqual(b.cohort.slice(0, count).map((instance) => ({ kind: "discarded", side, instance })));
      expect(triggerDraws(done)).toHaveLength(count);
      expect(done.state.sides[side].score).toBe(count);
      expect(done.state.oncePerTurn).toHaveLength(Number(count > 0));
      expect(stateHash(b.state)).toBe(before);
      expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(["player", "enemy"] as const)("keeps sequential instruction occasions separate for %s", (side) => {
    for (const [source, amounts] of [[D.separate21, [2, 1]], [D.separate12, [1, 2]], [D.three, [3]]] as const) {
      const b = setup(side, source), done = run(b.state, side, b.action);
      expect(batches(done).map((e) => e.count)).toEqual(amounts);
      expect(triggerDraws(done)).toHaveLength(amounts[0]);
      expect(done.state.sides[side].score).toBe(3);
      const queued = done.events.filter((e) => e.kind === "triggerQueued" && e.source === b.ids[side].back[0]);
      expect(queued).toMatchObject([{ subject: null, discardedCount: amounts[0] }]);
    }
  });

  it.each(["player", "enemy"] as const)("uses the instructed hand holder and relative opponent trigger for %s", (side) => {
    const b = setup(side, D.opponentThree, "opponent", D.opponentWatch), done = run(b.state, side, b.action);
    expect(batches(done)).toEqual([{ kind: "discardBatch", side: opponent(side), count: 3 }]);
    expect(triggerDraws(done).filter((e) => e.side === side)).toHaveLength(3);
    expect(triggerDraws(done).filter((e) => e.side === opponent(side))).toHaveLength(3);
    expect(done.state.sides[opponent(side)].score).toBe(3);
  });

  it.each(["player", "enemy"] as const)("groups individual discard payment descriptors for %s", (side) => {
    for (const [source, amounts] of [[D.payer21, [2, 1]], [D.payer3, [3]], [D.payHand, [4]]] as const) {
      const b = setup(side, source), done = run(b.state, side, b.action);
      expect(batches(done).map((e) => e.count)).toEqual(amounts);
      expect(triggerDraws(done)).toHaveLength(amounts[0]);
      expect(done.state.sides[side].score).toBe(amounts.reduce((a, n) => a + n, 0));
      expect(done.state.sides[side].currentEnergy).toBe(source === D.payer21 ? 2 : 4);
    }
    const b = setup(side, D.payTo), done = run(b.state, side, b.action);
    expect(batches(done)).toEqual([{ kind: "discardBatch", side, count: 2 }]);
    expect(triggerDraws(done)).toHaveLength(2);
    expect(done.state.sides[side].currentEnergy).toBe(2);
    const declined = run(b.state, side, b.action, false);
    expect(batches(declined)).toEqual([]);
    expect(declined.state.sides[side].currentEnergy).toBe(4);
    expect(declined.state.oncePerTurn).toEqual([]);
  });

  it("captures a whole-hand resource cohort even when the caller supplies its live hand list", () => {
    const b = setup("player", D.aliasGroup), done = run(b.state, "player", b.action);
    expect(batches(done)).toEqual([{ kind: "discardBatch", side: "player", count: 4 }]);
    expect(done.events.filter((e) => e.kind === "discarded").map((e) => e.instance)).toEqual(b.cohort);
    expect(triggerDraws(done)).toHaveLength(4);
  });

  it("counts whole-hand redraw once and keeps its own draw amount separate", () => {
    const b = setup("player", D.redraw), done = run(b.state, "player", b.action);
    expect(batches(done)).toEqual([{ kind: "discardBatch", side: "player", count: 4 }]);
    expect(done.events.filter((e) => e.kind === "cardDrawn")).toHaveLength(8);
    expect(triggerDraws(done)).toHaveLength(4);
    expect(done.events.findIndex((e) => e.kind === "discardBatch")).toBeLessThan(done.events.findIndex((e) => e.kind === "cardDrawn"));
  });

  it.each(["player", "enemy"] as const)("captures one hand-limit chosen set for %s", (side) => {
    const b = boardState(engine.catalog, { active: side, phase: "night", scoreToWin: 100,
      [side]: { back: [D.watcher.id, D.perCard.id], hand: Array.from({ length: 13 }, () => v.vanilla1.id), deck }, [opponent(side)]: { deck } });
    const fixed = { ...b.state, config: { ...b.state.config, handLimit: 10, turnLimit: null } };
    const done = run(fixed, side, { kind: "pass" });
    expect(batches(done)).toEqual([{ kind: "discardBatch", side, count: 3 }]);
    expect(triggerDraws(done).filter((e) => e.side === side)).toHaveLength(3);
    expect(done.state.sides[side].score).toBe(3);
    expect(done.state.sides[side].hand).toHaveLength(13);
  });

  it("counts created cessation and Reclaim banishment without relying on void growth", () => {
    const b = setup();
    b.state.instances[b.cohort[0]].status.created = true;
    b.state.instances[b.cohort[1]].status.reclaimed = true;
    const done = run(b.state, "player", b.action);
    expect(batches(done)).toEqual([{ kind: "discardBatch", side: "player", count: 3 }]);
    expect(triggerDraws(done)).toHaveLength(3);
    expect(done.state.instances[b.cohort[0]]).toBeUndefined();
    expect(done.state.instances[b.cohort[1]]?.zone).toBe("banished");
    expect(done.state.sides.player.void).toContain(b.cohort[2]);
    expect(done.state.sides.player.score).toBe(3);
  });

  it("retains the first occasion after later hand and void changes or its source leaves play", () => {
    for (const source of [D.changes, D.sourceLeaves]) {
      const b = setup("player", source), done = run(b.state, "player", b.action);
      expect(batches(done).map((e) => e.count)).toEqual([2]);
      expect(triggerDraws(done)).toHaveLength(2);
      if (source === D.changes) expect(done.state.sides.player.void).not.toContain(b.cohort[0]);
      else expect(done.state.instances[b.ids.player.back[0]!].zone).toBe("hand");
    }
  });

  it("uses deterministic random discard order and one actual count", () => {
    const b = setup("player", D.random), first = run(b.state, "player", b.action), replay = run(b.state, "player", b.action);
    expect(first.events).toEqual(replay.events);
    expect(stateHash(first.state)).toBe(stateHash(replay.state));
    expect(batches(first)).toEqual([{ kind: "discardBatch", side: "player", count: 2 }]);
    const perCards = first.events.filter((e) => e.kind === "discarded");
    expect(new Set(perCards.map((e) => e.instance)).size).toBe(2);
    expect(triggerDraws(first)).toHaveLength(2);
  });

  it("keeps floating and delayed trigger amounts bound to their own occasions", () => {
    for (const source of [D.floating, D.delayed]) {
      const b = setup("player", source, "you", D.perCard), done = run(b.state, "player", b.action);
      const queued = done.events.filter((e) => e.kind === "triggerQueued" && e.source === b.source);
      expect(queued).toMatchObject([{ subject: null, discardedCount: 2 }]);
      expect(triggerDraws(done)).toHaveLength(2);
      if (source === D.delayed) expect(done.state.floating.filter((e) => e.change.kind === "trigger")).toEqual([]);
    }
  });

  it("zero leaves the once-per-turn use available and a new real turn resets it", () => {
    const b = boardState(engine.catalog, { active: "player", phase: "day", scoreToWin: 100,
      player: { back: [D.watcher.id, D.perCard.id], hand: [D.zeroThenTwo.id, ...Array.from({ length: 6 }, () => v.vanilla1.id), D.three.id, D.three.id], deck }, enemy: { deck } });
    const fixed = { ...b.state, config: { ...b.state.config, handLimit: 10, turnLimit: null } };
    const first = run(fixed, "player", { kind: "play", card: b.ids.player.hand[0], from: "hand" });
    expect(batches(first).map((e) => e.count)).toEqual([2]);
    expect(triggerDraws(first)).toHaveLength(2);
    const second = run(first.state, "player", { kind: "play", card: b.ids.player.hand[7], from: "hand" });
    expect(batches(second).map((e) => e.count)).toEqual([3]);
    expect(triggerDraws(second)).toEqual([]);
    let state = second.state;
    const source = b.ids.player.back[0]!;
    const turn = state.turn.turnNumber;
    for (let i = 0; (state.turn.turnNumber <= turn || state.turn.active !== "player" || state.turn.phase !== "day") && i < 30; i++) {
      const decision = engine.decision(state);
      if (decision === null) throw new Error("Expected real turn decision");
      state = run(state, decision.side, { kind: "pass" }).state;
    }
    expect(state.turn.turnNumber).toBeGreaterThan(turn);
    expect(state.oncePerTurn).not.toContain(`${source}#0`);
    const eligible = run(state, "player", { kind: "play", card: b.ids.player.hand[8], from: "hand" });
    expect(triggerDraws(eligible)).toHaveLength(3);
  });
});

describe("discard rejection and rollback", () => {
  it("validates a whole resource cohort before any member moves", () => {
    const b = setup("player", D.invalid), before = stateHash(b.state);
    expect(() => run(b.state, "player", b.action)).toThrow();
    expect(stateHash(b.state)).toBe(before);
    expect(b.state.sides.player.hand).toContain(b.cohort[0]);
    expect(b.state.triggerQueue).toEqual([]);
    expect(b.state.oncePerTurn).toEqual([]);
  });

  it("a public mid-resolution error preserves the original cards, resources, queue and once use", () => {
    const b = setup("player", D.fails), before = stateHash(b.state);
    expect(() => run(b.state, "player", b.action)).toThrow();
    expect(stateHash(b.state)).toBe(before);
    expect(b.state.sides.player.currentEnergy).toBe(4);
    expect(b.state.triggerQueue).toEqual([]);
    expect(b.state.oncePerTurn).toEqual([]);
  });

  it("rejects an invalid later payment choice without partial energy, discard or trigger mutation", () => {
    const b = setup("player", D.payer21, "you", D.watcher, 5), fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: b.action }));
    const first = fold.pending(opened)!.prompt;
    const second = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: first.id, value: b.cohort.slice(0, 2) }));
    const pending = fold.pending(second)!;
    expect(pending.prompt.purpose.role).toBe("discardCost");
    const before = JSON.stringify(second);
    expect(fold.reduce(second, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [b.ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(JSON.stringify(second)).toBe(before);
    expect(pending.display.sides.player.currentEnergy).toBe(4);
    expect(pending.display.sides.player.hand).toEqual(b.cohort);
    expect(pending.display.triggerQueue).toEqual([]);
    expect(pending.display.oncePerTurn).toEqual([]);
    const done = applied(fold.reduce(second, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [b.cohort[2]] }));
    expect(done.committed.sides.player.currentEnergy).toBe(2);
  });
});
