import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import type { EngineCardDefinition } from "../catalog";
import { boardState } from "../testing/board";
import { syntheticId, SYNTHETIC as v, testCatalog } from "../testing/synthetic-cards";
import { dissolve } from "../rules/zones";
import type { ChooseNumberPrompt } from "../prompts/types";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "./slice";
const done = (result: IntentOutcome) => { if (result.kind !== "applied") throw new Error(result.reason); return result; };
function world(fail = false, lateFailure = false) {
  let failureEnabled = false;
  const card: EngineCardDefinition = { ...v.event0, id: syntheticId(0x272100), status: "authored", synthetic: {
    play(ctx, source) {
      const victim = ctx.state.sides.enemy.backRank[0]; if (victim !== null) dissolve(ctx, victim, "player");
      const picked = ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: "player", purpose: { source, cardId: null, ability: 0, role: "chooseX" }, min: 0, max: 1 });
      if (fail && failureEnabled && picked === 1) throw new Error("synthetic post-prefix failure");
      return {};
    }, ...(lateFailure ? { resolve: () => { throw new Error("synthetic later automatic failure"); } } : {}),
  } };
  const engine = createEngine(testCatalog([card]));
  const placed = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id], deck: [v.vanilla1.id] }, enemy: { back: [v.vanilla2.id], deck: [v.vanilla1.id] } });
  const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
  const start: BattleSlice = { committed: placed.state, inFlight: null, attempt: 0, publishedEvents: 0 };
  const suspended = done(adapter.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: placed.ids.player.hand[0], from: "hand" } }));
  const pending = adapter.pending(suspended.slice); if (pending === null) throw new Error("Missing synthetic prompt");
  return { ...placed, engine, adapter, start, suspended, pending, enableFailure: () => { failureEnabled = true; } };
}
describe("authoritative committed step results", () => {
  it("excludes a real cancellable removal prefix, and emits the complete successful prefix once after cold reload", () => {
    const w = world();
    expect(w.suspended.published.some((e) => e.kind === "dissolved")).toBe(true); expect(w.suspended.committedSteps).toEqual([]);
    const cancelled = done(w.adapter.reduce(w.suspended.slice, { kind: "cancel", side: "player", promptId: w.pending.prompt.id }));
    expect(cancelled.committedSteps).toEqual([]); expect(cancelled.slice.committed.instances[w.ids.enemy.back[0]!].zone).toBe("play");
    const saved = JSON.parse(JSON.stringify(w.suspended.slice)) as BattleSlice, cold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const intent = { kind: "answer" as const, side: "player" as const, promptId: cold.pending(saved)!.prompt.id, value: 0 };
    const final = done(cold.reduce(saved, intent));
    expect(final.error).toBeNull(); expect(final.published.some((e) => e.kind === "dissolved")).toBe(false);
    expect(final.committedSteps.flatMap((row) => row.events).filter((e) => e.kind === "dissolved")).toHaveLength(1);
    expect(final.slice.committed.instances[w.ids.enemy.back[0]!].zone).toBe("void");
    expect(cold.reduce(final.slice, intent).kind).toBe("bounced");
  });
  it("returns no completed row for a post-prefix throw", () => {
    const w = world(true); w.enableFailure(); const result = done(w.adapter.reduce(w.suspended.slice, { kind: "answer", side: "player", promptId: w.pending.prompt.id, value: 1 }));
    expect(result.error?.message).toContain("synthetic post-prefix failure"); expect(result.committedSteps).toEqual([]);
    expect(result.slice.committed.instances[w.ids.enemy.back[0]!].zone).toBe("play");
  });
  it("retains earlier completed work when a later automatic resolution fails", () => {
    const w = world(false, true);
    let result = done(w.adapter.reduce(w.suspended.slice, { kind: "answer", side: "player", promptId: w.pending.prompt.id, value: 0 }));
    const all = [...result.committedSteps];
    for (let n = 0; n < 4 && result.error === null; n++) {
      const side = w.engine.decision(result.slice.committed)?.side;
      if (side === undefined) throw new Error("Expected public pass before automatic failure");
      result = done(w.adapter.reduce(result.slice, { kind: "battleAction", side, action: { kind: "pass" } })); all.push(...result.committedSteps);
    }
    expect(result.error?.message).toContain("synthetic later automatic failure");
    expect(all.flatMap((row) => row.events).filter((e) => e.kind === "dissolved")).toHaveLength(1);
    expect(result.committedSteps.length).toBeGreaterThan(0);
    expect(result.slice.committed.instances[w.ids.enemy.back[0]!].zone).toBe("void");
  });
});
