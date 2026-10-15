/** Current route continuations, explicit legacy unknown history and captured entry save boundaries. */
import { describe, expect, it } from "vitest";
import { activated, energy, keyword, reclaim, sourceWasAlternativePlayed, staticAbility } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { cloneState } from "../../../state/clone";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent } from "../../../state/ids";
import { playRoutes } from "../../../rules/timing";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { ruleModifier } from "../rule-modifier";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { passUntil } from "../../../testing/trigger-harness";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { moveInstance, moveToHand } from "../../../rules/zones";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { conditionalAnswers, conditionalApplied, conditionalCard, conditionalFixture, conditionalSlice, survivor } from "./conditional-alternative-cost-support";

const coldSlice = (slice: BattleSlice): BattleSlice => JSON.parse(JSON.stringify(slice)) as BattleSlice;
const saved = (slice: BattleSlice) => ({ init: { seed: "conditional-save", decks: { player: [], enemy: [] }, dreamwell: [], scoreToWin: 25 }, slice: coldSlice(slice) });
describe.each(SIDES)("conditional alternative recovery for %s", side => {
  const other = opponent(side);
  it("cold reloads, cancels and refuses invalid route inputs without recording a new method", () => {
    const f = conditionalFixture(side); const logs: EngineLogRecord[] = [];
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true, log: line => logs.push(line) });
    const opened = conditionalApplied(fold.reduce(conditionalSlice(f.state), { kind: "battleAction", side, action: f.action }));
    const pending = fold.pending(opened)!; expect(pending.prompt.kind).toBe("chooseMode");
    expect(opened.committed.instances[f.id].status.playedViaAlternativeCost).toBe(false);
    const restored = coldSlice(opened), cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(restored)).toEqual(pending);
    expect(cold.reduce(restored, { kind: "answer", side: other, promptId: pending.prompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(restored, { kind: "answer", side, promptId: pending.prompt.id, value: 22 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(restored, { kind: "battleAction", side, action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = conditionalApplied(cold.reduce(restored, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(f.state);
    const reopened = conditionalApplied(cold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
    expect(cold.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const current = cold.pending(reopened)!;
    const committed = conditionalApplied(cold.reduce(coldSlice(reopened), { kind: "answer", side, promptId: current.prompt.id, value: 1 }));
    expect(committed.committed.instances[f.id].status.playedViaAlternativeCost).toBe(true);
    expect(committed.committed.sides[side].currentEnergy).toBe(9);
    expect(committed.committed.stack[0]).toMatchObject({ materializesAwakened: true });
    expect(parseEngineBattleFold(saved(committed), f.engine.catalog)).not.toBeNull();
    expect(cold.reduce(committed, { kind: "answer", side, promptId: current.prompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const entered = conditionalApplied(cold.reduce(coldSlice(committed), { kind: "battleAction", side: other, action: { kind: "pass" } }));
    expect(entered.committed.instances[f.id].status.exhausted).toBe(false);
    expect(logs.some(line => line.event === "engine.promptOpened" && line.cardId === conditionalCard().id)).toBe(true);
  });
  it.each(["reclaim", "offering", "eventAlternative"] as const)("records an actual later %s route instead of the previous card alternative", route => {
    const c = conditionalCard(31, { extras: [reclaim(energy(0)), keyword("offering")],
      ...(route === "eventAlternative" ? { fields: { cardType: "event", spark: null, speed: "fast" } } : {}) });
    const provider = { ...survivor, id: syntheticId(0x698160), abilities: () => [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] };
    const f = conditionalFixture(side, c, { hand: [c.id, v.vanilla0.id], back: [provider.id] }, {}, [provider]);
    const played = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
    const prior = passUntil(f.engine, played, state => state.stack.length === 0).state;
    expect(prior.instances[f.id].status.playedViaAlternativeCost).toBe(true);
    const actual = cloneState(prior), ctx = new Context(actual, f.engine.catalog, NO_PROMPTS);
    const from = route === "reclaim" ? "void" as const : "hand" as const;
    if (from === "void") moveInstance(ctx, f.id, "void"); else moveToHand(ctx, f.id, side);
    const mode = playRoutes(actual, f.engine.catalog, f.id, from).indexOf(route); expect(mode).toBeGreaterThanOrEqual(0);
    const next = f.engine.apply(actual, side, { kind: "play", card: f.id, from }, conditionalAnswers("normal", { playRoute: mode, voidRoute: mode }).source).state;
    expect(next.instances[f.id].status.playedViaAlternativeCost).toBe(false);
    expect(next.instances[f.id].status.playedViaReclaim).toBe(route === "reclaim");
  });
  it("clones and serializes the known fact and selected option, distinguishing a legacy unknown", () => {
    const f = conditionalFixture(side); const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
    expect(cloneState(paid)).toEqual(deserializeState(serializeState(paid)));
    expect(stateHash(cloneState(paid))).toBe(stateHash(paid));
    const unknown = cloneState(paid); delete unknown.instances[f.id].status.playedViaAlternativeCost;
    const normal = cloneState(paid); normal.instances[f.id].status.playedViaAlternativeCost = false;
    expect(stateHash(unknown)).not.toBe(stateHash(normal)); expect(stateHash(normal)).not.toBe(stateHash(paid));
    const restored = deserializeState(serializeState(unknown));
    expect(restored.instances[f.id].status).not.toHaveProperty("playedViaAlternativeCost");
    expect(stateHash(restored)).toBe(stateHash(unknown)); expect(parseEngineBattleFold(saved(conditionalSlice(restored)), f.engine.catalog)).not.toBeNull();
  });
  it("refuses a physical legacy unknown resolving method without choosing either effect branch", () => {
    const c = conditionalCard(30, { extras: [activated([], ifThen(sourceWasAlternativePlayed(), gainPoints(7), gainPoints(2)))] });
    const f = conditionalFixture(side, c); const played = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
    const entered = passUntil(f.engine, played, s => s.stack.length === 0).state;
    const legacy = cloneState(entered); delete legacy.instances[f.id].status.playedViaAlternativeCost;
    expect(parseEngineBattleFold(saved(conditionalSlice(legacy)), f.engine.catalog)).not.toBeNull();
    const activatedState = f.engine.apply(legacy, side, { kind: "activate", source: f.id, ability: 2 }, NO_PROMPTS).state;
    const fold = createFoldAdapter(createEngine(f.engine.catalog));
    const failure = fold.reduce(conditionalSlice(activatedState), { kind: "battleAction", side: other, action: { kind: "pass" } });
    expect(failure.kind).toBe("applied"); if (failure.kind !== "applied") throw new Error("No resolving failure");
    expect(failure.error).not.toBeNull(); expect(failure.slice.committed).toEqual(activatedState);
    expect(failure.slice.committed.sides[side].score).toBe(entered.sides[side].score);
    expect(failure.slice.committed.instances[f.id].status).not.toHaveProperty("playedViaAlternativeCost");
    for (const route of ["normal", "alternativeCost"] as const) {
      const again = cloneState(legacy); moveToHand(new Context(again, f.engine.catalog, NO_PROMPTS), f.id, side);
      const committed = f.engine.apply(again, side, f.action, conditionalAnswers(route).source).state;
      const replayed = passUntil(f.engine, committed, s => s.stack.length === 0).state;
      const ability = f.engine.apply(replayed, side, { kind: "activate", source: f.id, ability: 2 }, NO_PROMPTS).state;
      const done = passUntil(f.engine, ability, s => s.stack.length === 0).state;
      expect(done.sides[side].score - legacy.sides[side].score).toBe(route === "normal" ? 2 : 7);
      expect(done.instances[f.id].status.playedViaAlternativeCost).toBe(route === "alternativeCost");
    }
  });
  it("validates new method and entry flags throughout saved committed/history/remembered data", () => {
    const f = conditionalFixture(side); const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
    const baseline = conditionalSlice(paid), history = { ...baseline, history: { base: conditionalSlice(f.state), entries: [] } };
    expect(parseEngineBattleFold(saved(history), f.engine.catalog)).not.toBeNull();
    for (const malformed of [null, 1, "true", [], {}]) for (const location of ["committed", "history", "memory"] as const) {
      const data = saved(history); const slice = data.slice;
      if (location === "committed") Object.assign(slice.committed.instances[f.id].status, { playedViaAlternativeCost: malformed });
      else if (location === "history") Object.assign(slice.history!.base.committed.instances[f.id].status, { playedViaAlternativeCost: malformed });
      else {
        const record = slice.committed.rememberedCards?.[side].find(record => record.instance === f.id);
        if (record === undefined) throw new Error("Missing observed source"); Object.assign(record.status, { playedViaAlternativeCost: malformed });
      }
      expect(parseEngineBattleFold(data, f.engine.catalog)).toBeNull();
    }
    const contradictory = saved(baseline); contradictory.slice.committed.instances[f.id].status.playedViaReclaim = true;
    expect(parseEngineBattleFold(contradictory, f.engine.catalog)).toBeNull();
    for (const malformed of [false, null, 1, "true", [], {}]) {
      const data = saved(history); Object.assign(data.slice.committed.stack[0], { materializesAwakened: malformed });
      expect(parseEngineBattleFold(data, f.engine.catalog)).toBeNull();
      const historic = saved({ ...baseline, history: { base: baseline, entries: [] } });
      Object.assign(historic.slice.history!.base.committed.stack[0], { materializesAwakened: malformed });
      expect(parseEngineBattleFold(historic, f.engine.catalog)).toBeNull();
    }
    const pending = createFoldAdapter(f.engine); const opened = conditionalApplied(pending.reduce(conditionalSlice(f.state), { kind: "battleAction", side, action: f.action }));
    expect(parseEngineBattleFold(saved(opened), f.engine.catalog)).not.toBeNull();
  });
});
