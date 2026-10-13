/** Discard counts survive public prompt suspension, save/replay, views and competing answers. */
import { describe, expect, it } from "vitest";
import { parsePromptId } from "../../../../types/identifiers";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import type { Decklists } from "../../../view/determinize";
import { eventRedactionViolations } from "../../../testing/redaction";
import { D, applied, engine, run, setup, slice } from "./discard-batch-support";

function decklists(state: ReturnType<typeof setup>["state"]): Decklists {
  const entries = (side: "player" | "enemy") => Object.values(state.instances).filter((c) => c.owner === side && !c.status.created).flatMap((c) => c.printing.kind === "card" ? [{ cardId: c.printing.cardId, ...c.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("discard captured count replay and privacy", () => {
  it.each(["player", "enemy"] as const)("restarts a paused instruction with its published prefix, captured count and once use for %s", (side) => {
    const b = setup(side, D.pause), fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: b.action }));
    const first = fold.pending(opened)!.prompt;
    const second = applied(fold.reduce(opened, { kind: "answer", side, promptId: first.id, value: b.cohort.slice(0, 2) }));
    const pending = fold.pending(second)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(pending.display.triggerQueue.filter((q) => q.discardedCount !== undefined)).toMatchObject([{ subject: null, discardedCount: 2 }]);
    expect(pending.display.oncePerTurn).toHaveLength(1);
    const reloaded = copy(second), cold = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(cold.pending(reloaded)).toEqual(pending);
    const finish = (adapter: typeof fold, s: typeof second) => applied(adapter.reduce(s, { kind: "answer", side, promptId: pending.prompt.id, value: true }));
    const live = finish(fold, second), saved = finish(cold, reloaded);
    expect(saved).toEqual(live);
    expect(live.committed.sides[side].deck).toHaveLength(b.state.sides[side].deck.length - 2);
    expect(live.committed.sides[side].score).toBe(2);
  });

  it("reloads a genuinely queued trigger interrupted at its own confirmation", () => {
    const b = setup("player", D.three, "you", D.pausedWatch), fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: b.action }));
    const choice = fold.pending(opened)!.prompt;
    const queued = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: choice.id, value: b.cohort.slice(0, 3) }));
    const pending = fold.pending(queued)!;
    expect(pending.prompt.kind).toBe("confirm");
    expect(queued.committed.triggerQueue[0]).toMatchObject({ subject: null, discardedCount: 3 });
    const restoredState = deserializeState(serializeState(queued.committed));
    expect(stateHash(restoredState)).toBe(stateHash(queued.committed));
    const coldSlice = { ...copy(queued), committed: restoredState }, cold = createFoldAdapter(engine);
    expect(cold.pending(coldSlice)?.prompt).toEqual(pending.prompt);
    const done = applied(cold.reduce(coldSlice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true }));
    expect(done.committed.sides.player.deck).toHaveLength(b.state.sides.player.deck.length - 3);
    expect(done.committed.triggerQueue).toEqual([]);
    // A legacy queue without the optional count retains its absent-context value.
    const legacy = copy(queued);
    legacy.committed.triggerQueue = legacy.committed.triggerQueue.map(({ discardedCount: _count, ...q }) => q);
    const old = createFoldAdapter(engine), completed = applied(old.reduce(legacy, { kind: "answer", side: "player", promptId: old.pending(legacy)!.prompt.id, value: true }));
    expect(completed.committed.sides.player.deck).toEqual(legacy.committed.sides.player.deck);
  });

  it("preserves a public scalar in both views and determinizations without a card subject", () => {
    const b = setup("player", D.three, "you", D.pausedWatch), fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: b.action }));
    const queued = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: fold.pending(opened)!.prompt.id, value: b.cohort.slice(0, 3) }));
    for (const side of ["player", "enemy"] as const) {
      const visible = engine.view(queued.committed, side);
      expect(visible.triggerQueue.filter((q) => q.discardedCount !== undefined)).toMatchObject([{ subject: null, discardedCount: 3 }]);
      const sampled = engine.determinize(visible, decklists(queued.committed), () => 0.5);
      expect(sampled.triggerQueue.filter((q) => q.discardedCount !== undefined)).toMatchObject([{ subject: null, discardedCount: 3 }]);
    }
  });

  it("keeps the public amount when the queued source becomes hidden", () => {
    const b = setup("player", D.hidePause), fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: b.action }));
    const paused = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: fold.pending(opened)!.prompt.id, value: b.cohort.slice(0, 2) }));
    const pending = fold.pending(paused)!;
    const view = engine.view(pending.display, "enemy");
    expect(view.triggerQueue.filter((q) => q.discardedCount !== undefined)).toMatchObject([{ source: null, origin: null, subject: null, discardedCount: 2 }]);
    const completed = applied(fold.reduce(paused, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true }));
    expect(completed.committed.sides.player.deck).toHaveLength(pending.display.sides.player.deck.length - 2);
  });

  it("shows a created-card discard count while keeping its hidden physical identity private", () => {
    const b = setup();
    b.state.instances[b.cohort[0]].status.created = true;
    const done = run(b.state, "player", b.action), created = b.cohort[0];
    const perCard = done.events.find((e) => e.kind === "discarded" && e.instance === created)!;
    expect(eventSeenBy(perCard, "enemy", done.state)).toBeNull();
    const batch = done.events.find((e) => e.kind === "discardBatch")!;
    expect(eventSeenBy(batch, "enemy", done.state)).toEqual({ kind: "discardBatch", side: "player", count: 3 });
    const queued = done.events.find((e) => e.kind === "triggerQueued" && e.discardedCount !== undefined)!;
    expect(eventSeenBy(queued, "enemy", done.state)).toMatchObject({ subject: null, discardedCount: 3 });
    expect(JSON.stringify(engine.view(done.state, "enemy"))).not.toContain(JSON.stringify(created));
    expect(eventRedactionViolations(done.events, b.state, done.state)).toEqual([]);
  });

  it("rejects duplicate, nonmember, wrong-side and stale answers before consuming a batch", () => {
    const b = setup("player", D.three), fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: b.action }));
    const pending = fold.pending(opened)!, before = JSON.stringify(opened);
    const bad = [[b.cohort[0], b.cohort[0], b.cohort[1]], [b.cohort[0], b.cohort[1], b.ids.enemy.hand[0]], [b.cohort[0], b.cohort[1], b.ids.player.deck[0]]];
    for (const value of bad) expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(opened, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: b.cohort.slice(0, 3) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: parsePromptId("0:0:999"), value: b.cohort.slice(0, 3) })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(JSON.stringify(opened)).toBe(before);
    expect(pending.display.triggerQueue).toEqual([]);
    expect(pending.display.oncePerTurn).toEqual([]);
    const done = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: b.cohort.slice(0, 3) }));
    const final = JSON.stringify(done);
    expect(fold.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: b.cohort.slice(1, 4) })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(JSON.stringify(done)).toBe(final);
    expect(done.committed.sides.player.deck).toHaveLength(b.state.sides.player.deck.length - 3);
    expect(done.committed.sides.player.score).toBe(3);
  });
});
