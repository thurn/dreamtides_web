/** Historical cost answers resume through the public fold and optional-loop replay. */
import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, additionalCost, choiceCost, discardCost, energy, event, optionalCost, pointsCost } from "../../../dsl/builders";
import type { PaymentCost } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseModePrompt, Prompt, PromptFingerprint } from "../../../prompts/types";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { Context } from "../../../steps/context";
import { IllegalAnswer, ReplayDivergence } from "../../../steps/errors";
import { MalformedPrompt } from "../../../prompts/structure";
import { cloneState } from "../../../state/clone";
import { hashString, stateHash } from "../../../state/hash";
import { ScriptedSource } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";

const card: EngineCardDefinition = {
  id: syntheticId(0xb900), cardType: "event", costs: [energy(1)], spark: null,
  subtype: "", speed: "standard", status: "authored",
  abilities: () => [additionalCost(choiceCost([discardCost()], [pointsCost(3)])), additionalCost(optionalCost(pointsCost(1))), event(gainPoints(1))],
};
const looper: EngineCardDefinition = {
  ...card, id: syntheticId(0xb901), cardType: "character", spark: 1,
  abilities: () => [activated([choiceCost([energy(0)], [energy(0)])], gainPoints(1))],
};
const narrowedCard: EngineCardDefinition = { ...card, id: syntheticId(0xb902), abilities: () => [
  additionalCost(choiceCost([discardCost()], [pointsCost(3)])), additionalCost(discardCost()), event(gainPoints(1)),
] };
const engine = createEngine(testCatalog([card, looper, narrowedCard]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function choice(prompt: Prompt | undefined): ChooseModePrompt {
  if (prompt?.kind !== "chooseMode" || prompt.purpose.role !== "chooseCost") throw new Error("expected cost choice");
  return prompt;
}

/** Independently transcribed from pre472 and 472 source, never from the compatibility helper. */
function historical(prompt: ChooseModePrompt, format: "pre472" | "472"): PromptFingerprint {
  const fields: unknown[] = [prompt.kind, prompt.side, prompt.purpose, prompt.privateTo ?? null, prompt.options];
  if (prompt.subtypes !== undefined) fields.push(prompt.subtypes);
  if (format === "472" && prompt.costOptions !== undefined) fields.push(prompt.costOptions);
  return hashString(JSON.stringify(fields)).toString(36) as PromptFingerprint;
}

function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice } };
}
function suspended() {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id, v.vanilla1.id], energy: 5, score: 8, deck }, enemy: { deck } });
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  const prompt = choice(fold.pending(opened)?.prompt);
  const id = fold.pending(opened)?.prompt.id;
  if (id === undefined) throw new Error("missing choice");
  const waiting = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: id, value: 1 }));
  expect(fold.pending(waiting)?.prompt.purpose.role).toBe("optionalCost");
  return { waiting, prompt, ids };
}

for (const format of ["pre472", "472", "current"] as const) {
  describe(`saved cost choice ${format}`, () => {
    it("cold-loads an answered cost choice followed by another prompt and pays the selected alternative once", () => {
      const { waiting, prompt, ids } = suspended();
      let saved = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
      if (saved.inFlight === null || saved.inFlight.answers[0] === undefined) throw new Error("missing answered choice");
      saved = { ...saved, inFlight: { ...saved.inFlight, answers: saved.inFlight.answers.map((answer, index) => index === 0 ? { ...answer, fingerprint: format === "current" ? promptFingerprint(prompt) : historical(prompt, format) } : answer) } };
      const loaded = parseJourneyBattleFoldState(savedJourney(saved));
      expect(loaded).not.toBeNull();
      if (loaded === null) throw new Error("save rejected by loader");
      const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
      const pending = cold.pending(saved);
      expect(pending).not.toBeNull();
      if (pending === null) throw new Error("historical saved choice is unreplayable");
      expect(pending).toEqual(createFoldAdapter(engine).pending(waiting));
      expect(saved.committed.sides.player.score).toBe(8);
      expect(cold.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: false })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 3 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(cold.reduce(saved, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
      expect(cancelled.committed).toEqual(saved.committed);
      const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
      expect(cold.reduce(reopened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: false })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const paid = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: false }));
      expect(paid.inFlight).toBeNull();
      expect(paid.committed.sides.player.score).toBe(6);
      expect(paid.committed.sides.player.currentEnergy).toBe(4);
      expect(paid.committed.sides.player.hand).toEqual([ids.player.hand[1]]);
      expect(cold.reduce(paid, { kind: "answer", side: "player", promptId: pending.prompt.id, value: false })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    });

    it("resumes the discard alternative and saves its migrated choice before the next prompt", () => {
      const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [card.id, v.vanilla1.id, v.vanilla2.id], energy: 5, score: 8, deck }, enemy: { deck } });
      const fold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
      const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
      const first = fold.pending(opened);
      if (first === null) throw new Error("missing cost choice");
      const prompt = choice(first.prompt);
      const selected = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: first.prompt.id, value: 0 }));
      if (selected.inFlight === null) throw new Error("missing saved choice");
      const saved: BattleSlice = JSON.parse(JSON.stringify({ ...selected, inFlight: { ...selected.inFlight, answers: [{ fingerprint: format === "current" ? promptFingerprint(prompt) : historical(prompt, format), value: 0 }] } })) as BattleSlice;
      const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
      const discard = cold.pending(saved);
      expect(discard?.prompt.purpose.role).toBe("discardCost");
      if (discard === null) throw new Error("missing discard prompt");
      const waiting = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: discard.prompt.id, value: [ids.player.hand[1]] }));
      expect(waiting.inFlight?.answers[0]?.fingerprint).toBe(promptFingerprint(prompt));
      expect(waiting.committed).toEqual(state);
      const reloaded = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
      const again = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
      const optional = again.pending(reloaded);
      expect(optional?.prompt.purpose.role).toBe("optionalCost");
      if (optional === null) throw new Error("missing optional prompt");
      const paid = applied(again.reduce(reloaded, { kind: "answer", side: "player", promptId: optional.prompt.id, value: false }));
      expect(paid.committed.sides.player.hand).toEqual([ids.player.hand[2]]);
      expect(paid.committed.sides.player.void.filter((id) => id === ids.player.hand[1])).toHaveLength(1);
      expect(paid.committed.sides.player.score).toBe(9);
      expect(paid.committed.sides.player.currentEnergy).toBe(4);
    });

    it("repeats a JSON-loaded loop containing an answered historical cost choice", () => {
      const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [looper.id], deck }, enemy: { deck } });
      const physical = ids.player.back[0];
      if (physical === null) throw new Error("missing activation source");
      const action = { kind: "activate", source: physical, ability: 0 } as const;
      const source = new ScriptedSource([1]);
      let prompt: ChooseModePrompt | undefined;
      const once = engine.apply(state, "player", action, { answer(shown) { prompt = choice(shown); return source.answer(shown); } });
      const saved = JSON.parse(JSON.stringify(once.state)) as typeof state;
      const candidate = saved.loops.candidate;
      if (candidate?.actions === null || candidate === null) throw new Error("no loop");
      saved.loops.candidate = { ...candidate, actions: candidate.actions.map((entry) => ({ steps: entry.steps.map((step) => ({ ...step, answers: step.answers.map((answer) => ({ ...answer, fingerprint: format === "current" ? promptFingerprint(choice(prompt)) : historical(choice(prompt), format) })) })) })) };
      const offer = engine.legalActions(saved, "player").find((entry) => entry.kind === "repeatLoop");
      if (offer?.kind !== "repeatLoop") throw new Error("no repeat offer");
      const repeated = createEngine(engine.catalog).apply(saved, "player", { ...offer, count: 2 }, new ScriptedSource([]));
      expect(repeated.events.filter((entry) => entry.kind === "loopEnded")).toEqual([expect.objectContaining({ iterations: 2, reason: "completed" })]);
      expect(repeated.state.sides.player.score).toBe(3);
    });
  });
}


describe("cost choice compatibility safety", () => {
  function replay(prompt: ChooseModePrompt, fingerprint: PromptFingerprint, value: Answer = 1) {
    const { waiting } = suspended();
    const ctx = new Context(cloneState(waiting.committed), engine.catalog, new ScriptedSource([]), { prefix: [{ fingerprint, value }], replay: true });
    ctx.choose(prompt);
    return ctx;
  }
  it("upgrades accepted historical records to the metadata-sensitive current format", () => {
    const { prompt } = suspended();
    const current = promptFingerprint(prompt);
    expect(current).not.toBe(historical(prompt, "472"));
    for (const format of ["pre472", "472"] as const) {
      const ctx = replay(prompt, historical(prompt, format));
      expect(ctx.answers).toEqual([{ fingerprint: current, value: 1 }]);
      const changed = { ...prompt, costOptions: [[discardCost()], [pointsCost(4)]] };
      expect(() => replay(changed, ctx.answers[0].fingerprint)).toThrow(ReplayDivergence);
    }
  });
  it("accepts raw full-metadata legacy hashes and distinguishes their independent decision-surface fixtures", () => {
    const { prompt } = suspended();
    const full = historical(prompt, "472");
    expect(full).not.toBe(historical(prompt, "pre472"));
    expect(replay(prompt, full).answers).toEqual([{ fingerprint: promptFingerprint(prompt), value: 1 }]);
  });
  const rawMetadataChanges: readonly [string, readonly (readonly PaymentCost[])[]][] = [
    ["amount", [[discardCost()], [pointsCost(4)]]],
    ["alternative order", [[pointsCost(3)], [discardCost()]]],
    ["discard filter", [[{ cost: "discard", count: 1, filter: { cardType: "character" } }], [pointsCost(3)]]],
  ];
  for (const [detail, options] of rawMetadataChanges) {
    it(`rejects a raw full-metadata legacy record after its ${detail} changes without payment or commitment`, () => {
      const { prompt, waiting } = suspended();
      if (waiting.inFlight === null) throw new Error("missing recorded step");
      const changed: EngineCardDefinition = { ...card, abilities: () => [
        additionalCost(choiceCost(...options)), additionalCost(optionalCost(pointsCost(1))), event(gainPoints(1)),
      ] };
      const step = waiting.inFlight.step;
      const observed: EngineEvent[] = [];
      const before = stateHash(waiting.committed);
      expect(() => runStep(waiting.committed, step, new ScriptedSource([false]), testCatalog([changed]), {
        prefix: [{ fingerprint: historical(prompt, "472"), value: 1 }],
        observeEvent: (entry) => observed.push(entry),
      })).toThrow(ReplayDivergence);
      expect(stateHash(waiting.committed)).toBe(before);
      expect(observed.filter((entry) => entry.kind === "energyChanged" || entry.kind === "pointsScored" || entry.kind === "discarded")).toEqual([]);
    });
  }
  it("rejects current records when amounts, original payment order, same-arity data, or legality differ", () => {
    const { prompt } = suspended();
    const current = promptFingerprint(prompt);
    const changed: ChooseModePrompt[] = [
      { ...prompt, costOptions: [[discardCost()], [pointsCost(4)]] },
      { ...prompt, costOptions: [[pointsCost(3)], [discardCost()]] },
      { ...prompt, costOptions: [[{ cost: "discard", count: 1, filter: { cardType: "character" } }], [pointsCost(3)]] },
      { ...prompt, options: [{ mode: 0, legal: false }, { mode: 1, legal: true }] },
    ];
    for (const next of changed) expect(() => replay(next, current)).toThrow(ReplayDivergence);
    expect(() => replay(prompt, current.replace(/^[^:]+:/, "cost-choice-v999:") as PromptFingerprint)).toThrow(ReplayDivergence);
  });
  it("refuses illegal historical answers and malformed metadata without payment or partial commitment", () => {
    const { prompt, waiting } = suspended();
    expect(() => replay(prompt, historical(prompt, "pre472"), 4)).toThrow(IllegalAnswer);
    expect(() => replay({ ...prompt, costOptions: [] }, historical(prompt, "pre472"))).toThrow(MalformedPrompt);
    const before = stateHash(waiting.committed);
    if (waiting.inFlight === null) throw new Error("no in-flight step");
    const broken: BattleSlice = { ...waiting, inFlight: { ...waiting.inFlight, answers: [{ fingerprint: promptFingerprint(prompt), value: 4 }] } };
    const outcome = createFoldAdapter(engine).reduce(broken, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("missing recovery");
    expect(outcome.error).not.toBeNull();
    expect(outcome.slice.inFlight).toBeNull();
    expect(stateHash(outcome.slice.committed)).toBe(before);
    expect(outcome.published).toEqual([]);
  });
  it("keeps metadata-free cost choices and unrelated mode fingerprints exact", () => {
    const { prompt } = suspended();
    const { costOptions: omitted, ...bare } = prompt;
    expect(omitted).toBeDefined();
    expect(promptFingerprint(bare)).toBe(historical(bare, "pre472"));
    replay(bare, historical(bare, "pre472"));
    const ordinary: ChooseModePrompt = { ...bare, purpose: { ...bare.purpose, role: "chooseOne" } };
    expect(promptFingerprint(ordinary)).toBe(historical(ordinary, "pre472"));
    const changed = { ...ordinary, options: [{ mode: 0, legal: false }, { mode: 1, legal: true }] };
    expect(() => replay(changed, historical(ordinary, "pre472"))).toThrow(ReplayDivergence);
  });
  it("preserves feasibility narrowing and original alternative indexes through historical reload", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [narrowedCard.id, v.vanilla1.id], energy: 5, score: 8, deck }, enemy: { deck } });
    const start = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
    for (const format of ["pre472", "472"] as const) {
      const fold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
      const opened = applied(fold.reduce(sliceOf(start), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
      const pending = fold.pending(opened);
      if (pending === null) throw new Error("missing narrowed choice");
      const prompt = choice(pending.prompt);
      expect(prompt.options).toEqual([{ mode: 0, legal: false }, { mode: 1, legal: true }]);
      expect(prompt.costOptions).toEqual([[discardCost()], [pointsCost(3)]]);
      const waiting = applied(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 1 }));
      let saved = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
      if (saved.inFlight === null) throw new Error("no answer prefix");
      saved = { ...saved, inFlight: { ...saved.inFlight, answers: [{ fingerprint: historical(prompt, format), value: 1 }] } };
      const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
      const next = cold.pending(saved);
      expect(next?.prompt.purpose.role).toBe("discardCost");
      if (next === null) throw new Error("no subsequent card cost");
      const paid = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: next.prompt.id, value: [ids.player.hand[1]] }));
      expect(paid.committed.sides.player.score).toBe(6);
      expect(paid.committed.sides.player.hand).toEqual([]);
      expect(paid.committed.sides.player.void).toContain(ids.player.hand[1]);
    }
  });
});
