/** Public producer attribution and transactional continuations for composed alternative payments. */
import { describe, expect, it } from "vitest";
import { additionalCost, alternativeCost, costPaid, discardCost, energy, enemyCharacter, event, optionalCost, targetWhen } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Prompt } from "../../../prompts/types";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { stateHash } from "../../../state/hash";
import { opponent, SIDES } from "../../../state/ids";
import { promptView } from "../../../view/view";
import { revealToBoth } from "../../../view/knowledge";
import { dissolve } from "../dissolve";
import { provenanceAnswer, provenanceApplied, provenanceCard, provenanceFixture, provenanceOpen, provenanceSlice, type ProvenanceKind } from "./alternative-cost-provenance-support";

const restored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
describe.each(SIDES)("alternative payment provenance for %s", side => {
  const other = opponent(side);
  it("attributes base and additional nested payments to their own declaration occurrences", () => {
    for (const [optional, choice, energy, discarded] of [[true, 0, 8, 4], [false, 1, 7, 1]] as const) {
      const f = provenanceFixture(side), prompts: Prompt[] = [];
      const paid = f.engine.apply(f.state, side, f.action, { answer(prompt) {
        prompts.push(prompt);
        return provenanceAnswer(prompt, "alternativeCost", optional, choice);
      } });
      expect(prompts.map(prompt => [prompt.purpose.role, prompt.purpose.ability])).toEqual(optional ? [
        ["playRoute", 0], ["target", 0], ["chooseCost", 2], ["optionalCost", 2],
        ["optionalCost", 1], ["discardCost", 1], ["chooseCost", 3], ["discardCost", 3],
        ["discardCost", 4], ["optionalCost", 5], ["discardCost", 5],
      ] : [["playRoute", 0], ["target", 0], ["chooseCost", 2], ["optionalCost", 2],
        ["optionalCost", 1], ["chooseCost", 3], ["discardCost", 4], ["optionalCost", 5]]);
      for (const prompt of prompts) expect(prompt.purpose).toMatchObject({ source: f.id, cardId: f.definition.id });
      expect(paid.state.sides[side].currentEnergy).toBe(energy);
      expect(paid.events.filter(event => event.kind === "discarded")).toHaveLength(discarded);
      expect(paid.state.stack[0]).toMatchObject({ instance: f.id, optionalPaid: [optional, optional, optional] });
      expect(paid.state.sides[other].score).toBe(0);
      expect(paid.state.turnLog.played[side]).toHaveLength(1);
    }
  });
  it("retains captured-card producers and the shared ability-zero numeric X before targeting", () => {
    for (const kind of ["capture", "count"] as const) {
      const f = provenanceFixture(side, kind), prompts: Prompt[] = [];
      const paid = f.engine.apply(f.state, side, f.action, { answer(prompt) {
        prompts.push(prompt);
        return provenanceAnswer(prompt);
      } });
      expect(prompts.map(prompt => [prompt.purpose.role, prompt.purpose.ability])).toEqual(kind === "capture"
        ? [["playRoute", 0], ["discardCost", 2], ["target", 0]]
        : [["playRoute", 0], ["chooseX", 0], ["target", 0], ["discardCost", 2]]);
      expect(paid.state.stack[0]?.x).toBe(1);
      expect(paid.state.instances[f.ids[side].hand[1]].zone).toBe("void");
      expect(paid.state.sides[side].currentEnergy).toBe(10);
      expect(paid.state.instances[f.ids[other].back[0]!].zone).toBe("play");
    }
  });
  it("attributes payment decisions prepared before an optional-payment-dependent target", () => {
    for (const pays of [true, false]) {
      const definition = { ...provenanceCard("composite"), abilities: () => [
        event(dissolve(targetWhen(costPaid(0), enemyCharacter(), enemyCharacter({ costAtMost: 1 })))),
        alternativeCost(energy(0)), additionalCost(optionalCost(discardCost(1))),
      ] };
      const f = provenanceFixture(side, "composite", definition), prompts: Prompt[] = [];
      let { slice } = provenanceOpen(f);
      while (slice.inFlight !== null) {
        const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
        const pending = cold.pending(restored(slice))!;
        prompts.push(pending.prompt);
        expect(stateHash(slice.committed)).toBe(stateHash(f.state));
        slice = provenanceApplied(cold.reduce(restored(slice), { kind: "answer", side, promptId: pending.prompt.id, value: provenanceAnswer(pending.prompt, "alternativeCost", pays) }));
      }
      expect(prompts.map(prompt => [prompt.purpose.role, prompt.purpose.ability])).toEqual(pays
        ? [["playRoute", 0], ["optionalCost", 2], ["discardCost", 2], ["target", 0]]
        : [["playRoute", 0], ["optionalCost", 2], ["target", 0]]);
      const target = prompts[prompts.length - 1];
      expect(target.kind).toBe("chooseTargets");
      if (target.kind !== "chooseTargets") throw new Error("Expected target");
      expect(target.candidates).toEqual(pays ? f.ids[other].back : f.ids[other].back.slice(0, 1));
      expect(slice.committed.sides[side].void).toHaveLength(pays ? 1 : 0);
      expect(slice.committed.sides[side].currentEnergy).toBe(10);
      expect(slice.committed.stack[0]?.optionalPaid).toEqual([pays]);
    }
  });
  it("reconstructs every current decision on a cold reload, with actor and observer views", () => {
    for (const kind of ["composite", "capture", "count"] as const satisfies readonly ProvenanceKind[]) {
      const f = provenanceFixture(side, kind);
      let { slice } = provenanceOpen(f);
      const seen: Prompt[] = [];
      while (slice.inFlight !== null) {
        const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
        const pending = cold.pending(restored(slice))!;
        expect(pending).toEqual(createFoldAdapter(f.engine).pending(slice));
        const { prompt, display } = pending;
        seen.push(prompt);
        expect(promptView(prompt, side, display)).toEqual(prompt);
        expect(promptView(prompt, other, display).purpose.source).toBeNull();
        const known = restored(display);
        revealToBoth(known, [f.id]);
        expect(promptView(prompt, other, known).purpose).toEqual(prompt.purpose);
        expect(promptFingerprint(cold.pending(restored(slice))!.prompt)).toBe(promptFingerprint(prompt));
        expect(stateHash(slice.committed)).toBe(stateHash(f.state));
        slice = provenanceApplied(cold.reduce(restored(slice), { kind: "answer", side, promptId: prompt.id, value: provenanceAnswer(prompt) }));
      }
      const inline = f.engine.apply(f.state, side, f.action, { answer: prompt => provenanceAnswer(prompt) });
      expect(stateHash(slice.committed)).toBe(stateHash(inline.state));
      expect(seen.some(prompt => prompt.purpose.role === "discardCost" && prompt.purpose.ability !== 0)).toBe(true);
    }
  });
  it("cancels an attributed payment and rejects invalid, stale, foreign and competing intents", () => {
    const f = provenanceFixture(side);
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true, log: record => records.push(record) });
    let slice = provenanceApplied(fold.reduce(provenanceSlice(f.state), { kind: "battleAction", side, action: f.action }));
    while (fold.pending(slice)!.prompt.purpose.role !== "discardCost") {
      const prompt = fold.pending(slice)!.prompt;
      slice = provenanceApplied(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: provenanceAnswer(prompt) }));
    }
    const prompt = fold.pending(slice)!.prompt;
    expect(prompt.purpose.ability).toBe(1);
    const frozen = JSON.stringify(slice);
    expect(fold.reduce(slice, { kind: "answer", side: other, promptId: prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(slice, { kind: "cancel", side: other, promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(slice, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(JSON.stringify(slice)).toBe(frozen);
    const cancelled = provenanceApplied(fold.reduce(restored(slice), { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(f.state));
    slice = provenanceApplied(fold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
    expect(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    let last = prompt.id;
    while (slice.inFlight !== null) {
      const pending = fold.pending(restored(slice))!.prompt;
      last = pending.id;
      slice = provenanceApplied(fold.reduce(restored(slice), { kind: "answer", side, promptId: pending.id, value: provenanceAnswer(pending) }));
    }
    expect(slice.committed.sides[side].currentEnergy).toBe(8);
    expect(slice.committed.sides[side].void).toHaveLength(4);
    expect(slice.committed.turnLog.played[side]).toHaveLength(1);
    expect(fold.reduce(slice, { kind: "answer", side, promptId: last, value: [] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(records.filter(record => record.event === "engine.action")).toHaveLength(1);
    expect(records.some(record => record.event === "engine.promptOpened" && record.role === "discardCost" && record.cardId === f.definition.id)).toBe(true);
  });
  it("leaves no partial payment when a later public payment answer fails", () => {
    const f = provenanceFixture(side), before = stateHash(f.state);
    let choices = 0, discarded = false;
    expect(() => f.engine.apply(f.state, side, f.action, { answer(prompt) {
      if (prompt.purpose.role === "discardCost") discarded = true;
      if (prompt.purpose.role === "chooseCost" && ++choices === 2) throw new Error("synthetic later payment failure");
      return provenanceAnswer(prompt);
    } })).toThrow("synthetic later payment failure");
    expect(discarded).toBe(true);
    expect(stateHash(f.state)).toBe(before);
    expect(f.state.sides[side].currentEnergy).toBe(10);
    expect(f.state.sides[side].hand).toHaveLength(5);
    expect(f.state.stack).toEqual([]);
    expect(f.state.turnLog.played[side]).toEqual([]);
  });
  it("keeps ordinary-route payment and reload behavior independent of the alternative", () => {
    const f = provenanceFixture(side);
    let { slice } = provenanceOpen(f);
    while (slice.inFlight !== null) {
      const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
      const pending = cold.pending(restored(slice))!;
      slice = provenanceApplied(cold.reduce(restored(slice), { kind: "answer", side, promptId: pending.prompt.id, value: provenanceAnswer(pending.prompt, "normal") }));
    }
    const inline = f.engine.apply(f.state, side, f.action, { answer: prompt => provenanceAnswer(prompt, "normal") });
    expect(stateHash(slice.committed)).toBe(stateHash(inline.state));
    expect(slice.committed.sides[side].currentEnergy).toBe(7);
    expect(slice.committed.sides[side].void).toHaveLength(4);
  });
});
