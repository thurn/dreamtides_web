/** Public Dreamsign fixture, indexed-source, prompt and replay contracts. */
import { expect, it } from "vitest";
import { createCatalog, type EngineDreamsignDefinition } from "../catalog";
import { createEngine } from "../engine";
import { activated, energy } from "../dsl/builders";
import { atStartOfFirstTurn, triggered } from "../dsl/triggers";
import { draw } from "../effects/primitives/draw";
import { optional } from "../effects/primitives/optional";
import { sequence } from "../effects/primitives/sequence";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { firstLegalAnswer } from "../prompts/answers";
import { parseDreamsignId } from "../../types/identifiers";
import { opponent, SIDES } from "../state/ids";
import type { EngineEvent } from "../events";
import { dreamsignLabBattle, runDreamsignLabPreflight } from "./dreamsign-lab";
import { SYNTHETIC_CARDS, SYNTHETIC } from "./synthetic-cards";

const id = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000022800");
const pending: EngineDreamsignDefinition = { id, status: "pending", abilities: () => [] };
const first: EngineDreamsignDefinition = { id, status: "authored", abilities: () => [triggered(atStartOfFirstTurn(), optional(draw(1)))] };
const engineOf = (dreamsign: EngineDreamsignDefinition) => createEngine(createCatalog(SYNTHETIC_CARDS, [], { dreamsigns: [dreamsign] }));
const serialized = (slice: BattleSlice): BattleSlice => structuredClone(slice);

for (const side of SIDES) {
  const request = { dreamsignId: id, side };
  const source = { kind: "dreamsign" as const, side, index: 0 };
  it(`initializes only the ${side} pending or vanilla Dreamsign without exercise`, () => {
    for (const definition of [pending, { ...pending, status: "vanilla" as const }]) {
      const engine = engineOf(definition);
      const lab = dreamsignLabBattle(engine, request);
      expect(lab.init.dreamsigns).toEqual({ [side]: [id] });
      expect(lab.slice.committed.sides[side].dreamsigns).toEqual([{ id }]);
      expect(lab.slice.committed.sides[opponent(side)].dreamsigns).toEqual([]);
      expect(lab.slice.committed.sides.player.avatar).toBeNull();
      expect(lab.slice.committed.sides.enemy.avatar).toBeNull();
      expect(dreamsignLabBattle(engine, request)).toEqual(lab);
      expect(runDreamsignLabPreflight(engine, request)).toMatchObject({ uuid: id, side, entityKind: "dreamsign", verdict: definition.status === "pending" ? "pending" : "pass", exercised: false, reason: null });
    }
  });
  it(`resumes the genuine ${side} indexed first-turn trigger and rejects stale answers`, () => {
    const engine = engineOf(first); const adapter = createFoldAdapter(engine); const events: EngineEvent[] = [];
    const lab = dreamsignLabBattle(engine, request, batch => events.push(...batch));
    const prompt = adapter.pending(lab.slice)?.prompt;
    if (prompt === undefined) throw new Error("Synthetic first-turn prompt missing");
    expect(prompt.side).toBe(side);
    expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source, controller: side }));
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: firstLegalAnswer(prompt) };
    expect(adapter.reduce(lab.slice, { ...answer, side: opponent(side) })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    const resumed = adapter.reduce(serialized(lab.slice), answer);
    expect(resumed).toEqual(adapter.reduce(lab.slice, answer));
    if (resumed.kind !== "applied") throw new Error("Synthetic answer bounced");
    expect(resumed.error).toBeNull();
    expect([...events, ...resumed.published]).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source, controller: side }));
    expect(adapter.reduce(resumed.slice, answer)).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
    expect(runDreamsignLabPreflight(engine, request)).toMatchObject({ verdict: "pass", exercised: true, answers: 1 });
  });
  it(`pays the ${side} Dreamsign energy cost and resumes its suspended activation`, () => {
    const engine = engineOf({ id, status: "authored", abilities: () => [activated([energy(1)], optional(draw(1)))] });
    const adapter = createFoldAdapter(engine); let slice = dreamsignLabBattle(engine, request).slice;
    const action = engine.legalActions(slice.committed, side).find(action => action.kind === "activate" && typeof action.source === "object" && action.source.kind === "dreamsign" && action.source.index === 0);
    if (action === undefined) throw new Error("Synthetic Dreamsign activation missing");
    const beforeEnergy = slice.committed.sides[side].currentEnergy;
    expect(adapter.reduce(slice, { kind: "battleAction", side: opponent(side), action })).toMatchObject({ kind: "bounced", reason: "notYourDecision" });
    const activation = adapter.reduce(slice, { kind: "battleAction", side, action });
    if (activation.kind !== "applied" || activation.error !== null) throw new Error("Synthetic activation failed");
    expect(activation.slice.committed.sides[side].currentEnergy).toBe(beforeEnergy - 1);
    const prompt = adapter.pending(activation.slice)?.prompt;
    if (prompt === undefined) throw new Error("Synthetic activation prompt missing");
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: firstLegalAnswer(prompt) };
    const resumed = adapter.reduce(serialized(activation.slice), answer);
    expect(resumed).toEqual(adapter.reduce(activation.slice, answer));
    if (resumed.kind !== "applied" || resumed.error !== null) throw new Error("Synthetic activation resume failed");
    slice = resumed.slice; const events = [...activation.published, ...resumed.published];
    while (slice.committed.stack.length > 0) {
      const decision = engine.decision(slice.committed);
      if (decision === null) throw new Error("Synthetic resolution decision missing");
      const result = adapter.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } });
      if (result.kind !== "applied" || result.error !== null) throw new Error("Synthetic resolution failed");
      events.push(...result.published); slice = result.slice;
    }
    expect(events).toContainEqual({ kind: "abilityResolved", source, side, ability: 0 });
  });
}

it("retains failures and rejects invalid budgets without publishing partial constructor evidence", () => {
  const request = { dreamsignId: id, side: "player" as const }; const engine = engineOf(pending);
  expect(runDreamsignLabPreflight(engine, { ...request, dreamsignId: parseDreamsignId(SYNTHETIC.vanilla1.id) })).toMatchObject({ verdict: "fail", reason: "fixtureFailed", events: [] });
  expect(runDreamsignLabPreflight(engine, request, 0)).toMatchObject({ verdict: "fail", reason: "stalled", events: [] });
  const twice = engineOf({ ...first, abilities: () => [triggered(atStartOfFirstTurn(), sequence(optional(draw(1)), optional(draw(1))))] });
  expect(runDreamsignLabPreflight(twice, request, 1)).toMatchObject({ verdict: "fail", reason: "stalled", answers: 1 });
  expect(runDreamsignLabPreflight({ ...twice, decision: () => { throw new Error("Synthetic decision failure"); } }, request)).toMatchObject({ verdict: "fail", reason: "engineError" });
  const broken = engineOf({ ...first, abilities: () => { throw new Error("Synthetic ability failure"); } }); const published: EngineEvent[] = [];
  expect(() => dreamsignLabBattle(broken, request, events => published.push(...events))).toThrow(); expect(published).toEqual([]);
});
