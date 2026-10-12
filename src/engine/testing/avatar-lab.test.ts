/** Public synthetic contracts for avatar initialization, intent ownership and replay. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineAvatarDefinition } from "../catalog";
import { createEngine } from "../engine";
import { activated, exhaustSelf } from "../dsl/builders";
import { atStartOfFirstTurn, triggered } from "../dsl/triggers";
import { draw } from "../effects/primitives/draw";
import { sequence } from "../effects/primitives/sequence";
import { optional } from "../effects/primitives/optional";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { firstLegalAnswer } from "../prompts/answers";
import { parseAvatarId } from "../../types/identifiers";
import { opponent, SIDES } from "../state/ids";
import type { EngineEvent } from "../events";
import { avatarLabBattle, runAvatarLabPreflight } from "./avatar-lab";
import { SYNTHETIC_CARDS, SYNTHETIC } from "./synthetic-cards";

const id = parseAvatarId("5e5e5e5e-0000-4000-8000-000000021900");
const pending: EngineAvatarDefinition = { id, status: "pending", abilities: () => [] };
const firstTurn: EngineAvatarDefinition = { id, status: "authored", abilities: () => [triggered(atStartOfFirstTurn(), optional(draw(1)))] };
const active: EngineAvatarDefinition = { id, status: "authored", abilities: () => [activated([exhaustSelf()], optional(draw(1)))] };
const engineOf = (avatar: EngineAvatarDefinition) => createEngine(createCatalog(SYNTHETIC_CARDS, [], { avatars: [avatar] }));
const serialized = (slice: BattleSlice): BattleSlice => JSON.parse(JSON.stringify(slice)) as BattleSlice;

for (const side of SIDES) describe(`avatar lab ${side}`, () => {
  const request = { avatarId: id, side };
  it("initializes exactly the requested pending emblem and reaches its first Day", () => {
    const engine = engineOf(pending);
    const lab = avatarLabBattle(engine, request);
    expect(lab.init.avatars).toEqual({ [side]: id });
    expect(lab.slice.committed.sides[side].avatar).toEqual({ id, exhausted: false });
    expect(lab.slice.committed.sides[opponent(side)].avatar).toBeNull();
    expect(avatarLabBattle(engine, request)).toEqual(lab);
    expect(runAvatarLabPreflight(engine, request)).toMatchObject({ uuid: id, side, entityKind: "avatar", verdict: "pending", reason: null, exercised: false, instance: null, zone: null });
  });
  it("resumes a genuine suspended first-turn trigger after serialization and rejects stale actors", () => {
    const engine = engineOf(firstTurn);
    const events: EngineEvent[] = [];
    const lab = avatarLabBattle(engine, request, published => events.push(...published));
    const adapter = createFoldAdapter(engine);
    const prompt = adapter.pending(lab.slice)?.prompt;
    if (prompt === undefined) throw new Error("First-turn trigger did not suspend");
    expect(prompt.side).toBe(side);
    expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: { kind: "avatar", side }, controller: side }));
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: firstLegalAnswer(prompt) };
    expect(adapter.reduce(lab.slice, { ...answer, side: opponent(side) })).toMatchObject({ kind: "bounced", reason: "notYourPrompt" });
    const resumed = createFoldAdapter(engine).reduce(serialized(lab.slice), answer);
    const uninterrupted = adapter.reduce(lab.slice, answer);
    expect(resumed).toEqual(uninterrupted);
    if (resumed.kind !== "applied") throw new Error("First-turn answer bounced");
    expect(resumed.error).toBeNull();
    expect([...events, ...resumed.published]).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: { kind: "avatar", side }, controller: side }));
    expect(adapter.reduce(resumed.slice, answer)).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
    expect(runAvatarLabPreflight(engine, request)).toMatchObject({ verdict: "pass", exercised: true, answers: 1 });
  });
  it("pays avatar exhaustion through a normal activation and preserves the suspended cost on reload", () => {
    const engine = engineOf(active);
    const adapter = createFoldAdapter(engine);
    let slice = avatarLabBattle(engine, request).slice;
    while (slice.committed.turn.phase !== "day") {
      const decision = engine.decision(slice.committed);
      if (decision === null) throw new Error("No first Day decision");
      const outcome = adapter.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } });
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("First Day pass failed");
      slice = outcome.slice;
    }
    const action = engine.legalActions(slice.committed, side).find(action => action.kind === "activate" && typeof action.source === "object" && action.source.kind === "avatar");
    if (action === undefined) throw new Error("No legal avatar activation");
    expect(adapter.reduce(slice, { kind: "battleAction", side: opponent(side), action })).toMatchObject({ kind: "bounced", reason: "notYourDecision" });
    const activated = adapter.reduce(slice, { kind: "battleAction", side, action });
    if (activated.kind !== "applied" || activated.error !== null) throw new Error("Avatar activation failed");
    const prompt = adapter.pending(activated.slice)?.prompt;
    if (prompt === undefined) throw new Error("Avatar activation did not suspend");
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: firstLegalAnswer(prompt) };
    const resumed = createFoldAdapter(engine).reduce(serialized(activated.slice), answer);
    expect(resumed).toEqual(adapter.reduce(activated.slice, answer));
    if (resumed.kind !== "applied" || resumed.error !== null) throw new Error("Avatar answer failed");
    slice = resumed.slice;
    const events = [...activated.published, ...resumed.published];
    while (slice.committed.stack.length > 0) {
      const decision = engine.decision(slice.committed);
      if (decision === null) throw new Error("No resolution decision");
      const outcome = adapter.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } });
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Avatar resolution failed");
      events.push(...outcome.published); slice = outcome.slice;
    }
    expect(slice.committed.sides[side].avatar).toEqual({ id, exhausted: true });
    expect(events).toContainEqual({ kind: "abilityActivated", source: { kind: "avatar", side }, side, ability: 0 });
    expect(events).toContainEqual({ kind: "abilityResolved", source: { kind: "avatar", side }, side, ability: 0 });
    expect(adapter.reduce(slice, answer)).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
  });
});

it("classifies unknown fixtures, guarded progress and engine errors without a successful verdict", () => {
  const engine = engineOf(pending);
  const request = { avatarId: id, side: "player" as const };
  expect(runAvatarLabPreflight(engine, { ...request, avatarId: parseAvatarId(SYNTHETIC.vanilla1.id) })).toMatchObject({ verdict: "fail", reason: "fixtureFailed", events: [], exercised: false });
  expect(runAvatarLabPreflight(engine, request, 0)).toMatchObject({ verdict: "fail", reason: "stalled", events: [] });
  const twice = engineOf({ ...firstTurn, abilities: () => [triggered(atStartOfFirstTurn(), sequence(optional(draw(1)), optional(draw(1))))] });
  expect(runAvatarLabPreflight(twice, request, 1)).toMatchObject({ verdict: "fail", reason: "stalled", answers: 1 });
  expect(runAvatarLabPreflight({ ...twice, decision: () => { throw new Error("Synthetic decision failure"); } }, request)).toMatchObject({ verdict: "fail", reason: "engineError" });
  const broken = engineOf({ ...firstTurn, abilities: () => { throw new Error("Synthetic ability failure"); } });
  const published: EngineEvent[] = [];
  expect(() => avatarLabBattle(broken, request, events => published.push(...events))).toThrow();
  expect(published).toEqual([]);
});
