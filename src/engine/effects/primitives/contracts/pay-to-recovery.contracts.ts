import { promptFingerprint } from "../../../prompts/fingerprint";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { describe, expect, it } from "vitest";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Answer } from "../../../prompts/types";
import { answer, applied, deferred, engine, failing, opened, setup } from "./pay-to-support";

const reload = (slice: BattleSlice): BattleSlice => JSON.parse(JSON.stringify(slice)) as BattleSlice;

describe("payTo interruption and recovery", () => {
  it("reloads confirm, exact discard, deferred mode and target with identical prompts and commits once", () => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids } = opened(setup("player", deferred.id), records);
    const inputs: Answer[] = [true, [ids.player.hand[1]], 0, [ids.enemy.back[1]!]];
    let normal = slice;
    let resumed = reload(slice);
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const normalEvents = [];
    const resumedEvents = [];
    for (const value of inputs) {
      const prompt = fold.pending(normal)!.prompt;
      expect(fresh.pending(resumed)?.prompt).toEqual(prompt);
      const before = JSON.stringify(resumed);
      for (let i = 0; i < 3; i++) expect(fresh.pending(resumed)?.prompt).toEqual(prompt);
      expect(JSON.stringify(resumed)).toBe(before);
      expect(fresh.reduce(resumed, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(fresh.reduce(resumed, { kind: "answer", side: "enemy", promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fresh.reduce(resumed, { kind: "cancel", side: "player", promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
      expect(fresh.reduce({ ...resumed, attempt: resumed.attempt + 1 }, { kind: "answer", side: "player", promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const n = answer(fold, normal, value);
      const r = answer(fresh, resumed, value);
      normal = applied(n);
      resumed = reload(applied(r));
      if (n.kind !== "applied" || r.kind !== "applied") throw new Error("expected completed answer");
      normalEvents.push(...n.published);
      resumedEvents.push(...r.published);
      const old = fresh.reduce(resumed, { kind: "answer", side: "player", promptId: prompt.id, value });
      expect(old).toEqual({ kind: "bounced", reason: fresh.pending(resumed) === null ? "noPendingPrompt" : "stalePrompt" });
    }
    expect(resumed.committed).toEqual(normal.committed);
    expect(resumedEvents).toEqual(normalEvents);
    expect(resumedEvents.filter((e) => e.kind === "energyChanged" && e.cause === "payment")).toHaveLength(1);
    expect(resumedEvents.filter((e) => e.kind === "discarded")).toHaveLength(1);
    expect(records.filter((r) => r.event === "engine.promptAnswered")).toHaveLength(4);

  });

  it("rejects underfilled, oversized, duplicate, foreign and malformed discard answers without paying", () => {
    const { fold, slice, ids } = opened();
    const accepted = applied(answer(fold, slice, true));
    const prompt = fold.pending(accepted)!.prompt;
    for (const value of [[], ids.player.hand.slice(1), [ids.player.hand[1], ids.player.hand[1]], [ids.enemy.hand[0]], [ids.player.hand[0]], true] as Answer[]) {
      expect(fold.reduce(accepted, { kind: "answer", side: "player", promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.pending(accepted)?.display.sides.player.currentEnergy).toBe(4);
      expect(fold.pending(accepted)?.display.sides.player.hand).toEqual(ids.player.hand.slice(1));
    }
    const done = applied(answer(fold, accepted, [ids.player.hand[2]]));
    expect(done.committed.sides.player.currentEnergy).toBe(2);
  });

  it("publishes the paid prefix once and rolls a failing child back while retaining shown identities only", () => {
    const records: EngineLogRecord[] = [];
    const { fold, slice, ids } = opened({ ...setup("player", failing.id), enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck: Array.from({ length: 6 }, () => v.vanilla1.id) } }, records);
    const accepted = applied(answer(fold, slice, true));
    const prefix = answer(fold, accepted, [ids.player.hand[1]]);
    const suspended = applied(prefix);
    if (prefix.kind !== "applied") throw new Error("expected published prefix");
    expect(prefix.published.filter((e) => e.kind === "energyChanged")).toHaveLength(1);
    expect(prefix.published.filter((e) => e.kind === "discarded")).toHaveLength(1);
    expect(prefix.published.filter((e) => e.kind === "cardDrawn")).toHaveLength(1);
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const saved = reload(suspended);
    expect(fresh.pending(saved)?.prompt).toEqual(fold.pending(suspended)?.prompt);
    const failed = answer(fresh, saved, [ids.enemy.hand[1]]);
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected failing child");
    expect(failed.error.message).toMatch(/synthetic payTo child failure/);
    expect(failed.published).toEqual([]);
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed.sides).toEqual(saved.committed.sides);
    expect(failed.slice.committed.instances).toEqual(saved.committed.instances);
    expect(failed.slice.committed.sides.player.currentEnergy).toBe(4);
    expect(failed.slice.committed.sides.player.hand).toEqual(ids.player.hand.slice(1));
    expect(failed.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    // Revealed identities that were already in hand retain knowledge on
    // rollback. A transient draw cannot reveal a committed deck position.
    expect(failed.slice.committed.knownTo.enemy).toContain(ids.player.hand[1]);
    expect(failed.slice.committed.knownTo.enemy).toContain(ids.player.hand[2]);
    for (const side of ["player", "enemy"] as const) {
      expect(failed.slice.committed.knownTo[side]).not.toContain(ids.player.deck[0]);
      expect(failed.slice.committed.knownTo[side]).not.toContain(ids.player.deck[1]);
    }
    expect(records.filter((r) => r.event === "engine.promptAnswered").map((r) => r.value)).toEqual([true, [ids.player.hand[1]]]);
  });

  it("recovers a corrupted recorded answer or partial event-prefix write as an engine error", () => {
    const { fold, slice, ids } = opened(setup("player", deferred.id));
    const accepted = applied(answer(fold, slice, true));
    const selected = applied(answer(fold, accepted, [ids.player.hand[1]]));
    const corruptAnswer = reload(selected);
    if (corruptAnswer.inFlight === null) throw new Error("expected recorded answers");
    const corrupt: BattleSlice = { ...corruptAnswer, inFlight: { ...corruptAnswer.inFlight, answers: corruptAnswer.inFlight.answers.map((a, i) => i === 0 ? { ...a, fingerprint: promptFingerprint({ kind: "confirm", side: "enemy", cancellable: false, purpose: { role: "youMay", source: null, cardId: null, ability: null } }) } : a) } };
    for (const bad of [corrupt, { ...selected, publishedEvents: selected.publishedEvents + 100 }]) {
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      if (bad === corrupt) expect(fresh.pending(bad)).toBeNull();
      const prompt = fold.pending(selected)!.prompt;
      const failed = fresh.reduce(bad, { kind: "answer", side: "player", promptId: prompt.id, value: 0 });
      if (failed.kind !== "applied" || failed.error === null) throw new Error("expected recovery error");
      expect(failed.error.kind).toBe("engine_error");
      expect(failed.slice.inFlight).toBeNull();
      expect({ ...failed.slice.committed, knownTo: selected.committed.knownTo }).toEqual(selected.committed);
      if (bad !== corrupt) expect(failed.slice.committed.knownTo.enemy).toContain(ids.player.hand[1]);
      expect(failed.published).toEqual([]);
    }
  });
});
