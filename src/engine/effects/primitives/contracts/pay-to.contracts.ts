import { describe, expect, it } from "vitest";
import type { EngineLogRecord } from "../../../log";
import { effectiveSpark } from "../../../rules/spark";
import { opponent } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { draw } from "../draw";
import { payTo } from "../pay-to";
import { answer, applied, compound, deferred, discardWatcher, engine, handSource, inheritedX, opened, setup, shapes, twoDiscards } from "./pay-to-support";

describe("payTo fixed resolving payment", () => {
  it.each(["player", "enemy"] as const)("%s plans an exact discard before paying, then emits ordinary payment and draw events", (side) => {
    for (const selected of [1, 2]) {
      const records: EngineLogRecord[] = [];
      const { fold, slice, ids } = opened(setup(side), records);
      const confirm = fold.pending(slice)!;
      expect(confirm.prompt).toMatchObject({ kind: "confirm", side, purpose: { role: "optionalCost", source: ids[side].hand[0], cardId: compound.id, ability: 0 } });
      const accepted = applied(answer(fold, slice, true));
      const discard = fold.pending(accepted)!;
      expect(discard.prompt).toMatchObject({ kind: "chooseCards", side, min: 1, max: 1, purpose: { role: "discardCost" } });
      if (discard.prompt.kind !== "chooseCards") throw new Error("expected card selection");
      expect(discard.prompt.candidates).toEqual(ids[side].hand.slice(1));
      expect(discard.display.sides[side].currentEnergy).toBe(4);
      expect(discard.display.sides[side].hand).toEqual(ids[side].hand.slice(1));
      const paid = answer(fold, accepted, [ids[side].hand[selected]]);
      const done = applied(paid);
      if (paid.kind !== "applied") throw new Error("expected applied payment");
      expect(fold.pending(done)).toBeNull();
      expect(done.committed.sides[side].currentEnergy).toBe(2);
      expect(done.committed.sides[side].hand).toHaveLength(3);
      expect(done.committed.sides[side].deck).toHaveLength(4);
      expect(done.committed.instances[ids[side].hand[selected]].zone).toBe("void");
      expect(paid.published).toContainEqual(expect.objectContaining({ kind: "energyChanged", side, change: -2, cause: "payment" }));
      expect(paid.published).toContainEqual(expect.objectContaining({ kind: "discarded", side, instance: ids[side].hand[selected] }));
      expect(unannouncedChanges(paid.published, discard.display, done.committed)).toEqual([]);
      expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
      expect(records.filter((r) => r.event === "engine.promptAnswered").map((r) => r.value)).toEqual([true, [ids[side].hand[selected]]]);
      expect(records.filter((r) => r.event === "engine.promptOpened")).toEqual(expect.arrayContaining([expect.objectContaining({ source: ids[side].hand[0], cardId: compound.id, side })]));
    }
  });

  it.each(["player", "enemy"] as const)("%s declines without resource changes or child choices", (side) => {
    const { fold, slice, ids } = opened(setup(side, deferred.id));
    const done = applied(answer(fold, slice, false));
    expect(fold.pending(done)).toBeNull();
    expect(done.committed.sides[side].currentEnergy).toBe(4);
    expect(done.committed.sides[side].hand).toEqual(ids[side].hand.slice(1));
    expect(done.committed.sides[side].deck).toEqual(ids[side].deck);
    expect(effectiveSpark(done.committed, engine.catalog, ids[opponent(side)].back[0]!)).toBe(1);
  });

  it.each([{ energy: 1, hand: [v.vanilla1.id, v.vanilla2.id] }, { energy: 4, hand: [] }])("does not offer an independently unaffordable payment: $energy energy and $hand", ({ energy: available, hand }) => {
    for (const side of ["player", "enemy"] as const) {
      const { fold, slice, ids } = opened(setup(side, compound.id, available, hand));
      expect(fold.pending(slice)).toBeNull();
      expect(slice.committed.sides[side].currentEnergy).toBe(available);
      expect(slice.committed.sides[side].hand).toEqual(ids[side].hand.slice(1));
      expect(slice.committed.sides[side].deck).toEqual(ids[side].deck);
    }
  });

  it("does not offer an exact two-card payment when only one hand card is available", () => {
    const { fold, slice, ids } = opened(setup("player", twoDiscards.id, 4, [v.vanilla1.id]));
    expect(fold.pending(slice)).toBeNull();
    expect(slice.committed.sides.player.hand).toEqual(ids.player.hand.slice(1));
    expect(slice.committed.sides.player.currentEnergy).toBe(4);
    expect(slice.committed.sides.player.deck).toEqual(ids.player.deck);
  });

  it.each(shapes.map((subject, i) => ({ subject, i })))("supports omitted, energy-only, discard-only and explicit-zero shape $i", ({ subject, i }) => {
    for (const accepted of [false, true]) {
      const { fold, slice, ids } = opened(setup("player", subject.id));
      expect(fold.pending(slice)?.prompt.purpose.role).toBe("optionalCost");
      let done = applied(answer(fold, slice, accepted));
      if (accepted && i === 2) done = applied(answer(fold, done, [ids.player.hand[1]]));
      expect(fold.pending(done)).toBeNull();
      expect(done.committed.sides.player.currentEnergy).toBe(4 - (accepted && i === 1 ? 2 : 0));
      expect(done.committed.sides.player.deck).toHaveLength(accepted ? 5 : 6);
      expect(done.committed.sides.player.hand).toHaveLength(2 + Number(accepted) - Number(accepted && i === 2));
    }
  });

  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid fixed energy %s", (energy) => expect(() => payTo({ energy }, draw(1))).toThrow());
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid exact discard count %s", (discard) => expect(() => payTo({ discard }, draw(1))).toThrow());

  it("defers fresh modes and targets until full payment and preserves prompt provenance", () => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids } = opened(setup("player", deferred.id), records);
    let done = applied(answer(fold, slice, true));
    done = applied(answer(fold, done, [ids.player.hand[1]]));
    expect(fold.pending(done)?.prompt.purpose.role).toBe("chooseOne");
    expect(fold.pending(done)?.display.sides.player.currentEnergy).toBe(2);
    done = applied(answer(fold, done, 0));
    expect(fold.pending(done)?.prompt.purpose).toMatchObject({ role: "target", source: ids.player.hand[0], cardId: deferred.id, ability: 0 });
    done = applied(answer(fold, done, [ids.enemy.back[1]!]));
    expect(effectiveSpark(done.committed, engine.catalog, ids.enemy.back[1]!)).toBe(4);
    expect(records.filter((r) => r.event === "engine.promptOpened").map((r) => r.role)).toEqual(["optionalCost", "discardCost", "chooseOne", "target"]);
  });

  it.each([true, false])("retains shared target and mode objects plus enclosing paid-X and optional-cost binding %s", (outerAccepted) => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids } = opened(setup("player", inheritedX.id, 8), records);
    let done = slice;
    for (const value of [2, 0, [ids.enemy.back[1]!], outerAccepted, true, [ids.player.hand[1]]] as const) done = applied(answer(fold, done, value));
    expect(fold.pending(done)).toBeNull();
    expect(done.committed.sides.player.currentEnergy).toBe(outerAccepted ? 3 : 4);
    expect(done.committed.sides.player.score).toBe(outerAccepted ? 2 : 9);
    expect(effectiveSpark(done.committed, engine.catalog, ids.enemy.back[1]!)).toBe(4);
    expect(records.filter((r) => r.event === "engine.promptOpened").map((r) => r.role)).toEqual(["chooseX", "chooseOne", "target", "optionalCost", "optionalCost", "discardCost"]);
  });

  it("includes a resolving hand-zone source in the exact discard pool and routes ordinary discard triggers", () => {
    const { fold, slice, ids } = opened({ ...setup("player", v.event0.id, 4, [handSource.id, v.vanilla1.id]), player: { hand: [v.event0.id, handSource.id, v.vanilla1.id], back: [discardWatcher.id], energy: 4 } });
    const accepted = applied(answer(fold, slice, true));
    const prompt = fold.pending(accepted)!.prompt;
    expect(prompt.purpose).toMatchObject({ role: "discardCost", source: ids.player.hand[1], cardId: handSource.id });
    if (prompt.kind !== "chooseCards") throw new Error("expected discard selection");
    expect(prompt.candidates).toContain(ids.player.hand[1]);
    const done = applied(answer(fold, accepted, [ids.player.hand[1]]));
    expect(done.committed.instances[ids.player.hand[1]].zone).toBe("void");
    expect(done.committed.sides.player.score).toBe(3);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
    // The normal synchronous path has no further choice after self-discard.
    expect(engine.apply(done.committed, "player", { kind: "pass" }, NO_PROMPTS).events.some((e) => e.kind === "discarded")).toBe(false);
  });
});
