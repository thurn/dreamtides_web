import { describe, expect, it } from "vitest";
import { additionalCost, discardCostFilter, energy, energyX, event, optionalCost, reclaim, stackItem, staticAbility } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { SIDES, opponent } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import * as p from "../index";
import { reclaimCard, reclaimFixture, reclaimSettle } from "./cost-modifier-reclaim-support";

const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-reclaim-modifier"), siteId: parseSiteId("site-reclaim-modifier"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-reclaim-modifier"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "reclaim-modifier", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as BattleSlice } };
}

for (const side of SIDES) describe(`${side} Reclaim cost modifier recovery`, () => {
  it("cancels without payment, reloads a suspended cost, rejects foreign/stale/competing answers, and replays once", () => {
    const source = reclaimCard(200, { ...v.vanilla0, id: reclaimCard(200).id, status: "authored", abilities: () => [staticAbility(p.costModifierReclaim("you", { reduce: 1 }))] });
    const subject = reclaimCard(201, { abilities: () => [reclaim(energy(2)), additionalCost(optionalCost(energy(1)), discardCostFilter({ cardType: "character" }))] });
    const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id], hand: [v.vanilla1.id, v.vanilla2.id], energy: 3 });
    const logs: EngineLogRecord[] = [];
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true, log: record => logs.push(record) });
    const original = sliceOf(f.state), id = f.ids[side].void[0];
    const play: BattleIntent = { kind: "battleAction", side, action: { kind: "play", card: id, from: "void" } };
    const opened = applied(fold.reduce(original, play));
    const pending = fold.pending(opened)!;
    expect(pending.prompt.purpose.role).toBe("optionalCost");
    const cancel: BattleIntent = { kind: "cancel", side, promptId: pending.prompt.id };
    const cancelled = applied(fold.reduce(opened, cancel));
    expect(stateHash(cancelled.committed)).toBe(stateHash(f.state));
    const reopened = applied(fold.reduce(cancelled, play));
    const serialized = parseJourneyBattleFoldState(saved(reopened));
    expect(serialized).not.toBeNull();
    const loaded = serialized!.engine.slice;
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const current = cold.pending(loaded)!;
    expect(current.prompt).toEqual(fold.pending(reopened)!.prompt);
    expect(cold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: current.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(loaded, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const accept: BattleIntent = { kind: "answer", side, promptId: current.prompt.id, value: true };
    const selecting = applied(cold.reduce(loaded, accept));
    const choice = cold.pending(selecting)!;
    expect(choice.prompt.purpose.role).toBe("discardCost");
    expect(cold.reduce(selecting, { kind: "answer", side, promptId: choice.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const pay: BattleIntent = { kind: "answer", side, promptId: choice.prompt.id, value: [f.ids[side].hand[1]] };
    const paid = applied(cold.reduce(selecting, pay));
    expect(paid.committed.sides[side].currentEnergy).toBe(1);
    expect(paid.committed.instances[id].status.playedViaReclaim).toBe(true);
    expect(paid.committed.instances[f.ids[side].hand[1]].zone).toBe("void");
    expect(paid.committed.turnLog.played[side].map(record => record.instance)).toEqual([id]);
    expect(cold.reduce(paid, pay).kind).toBe("bounced");
    const replay = [play, cancel, play, accept, pay].reduce((slice, intent) => applied(fold.reduce(slice, intent)), original);
    expect(stateHash(replay.committed)).toBe(stateHash(paid.committed));
    expect(logs.some(record => record.event === "engine.action" && record.action.kind === "play" && record.action.card === id)).toBe(true);
    expect(logs.some(record => record.event === "engine.promptOpened" && record.cardId === subject.id)).toBe(true);
    expect(invariantViolations(paid.committed, f.engine.catalog)).toEqual([]);
  });

  it("an answer error before commitment preserves resources, source membership and the original state", () => {
    const source = reclaimCard(202, { ...v.vanilla0, id: reclaimCard(202).id, status: "authored", abilities: () => [staticAbility(p.costModifierReclaim("you", { set: 0 }))] });
    const subject = reclaimCard(203, { abilities: () => [reclaim(energy(4), energyX(0))] });
    const f = reclaimFixture(side, [source, subject], { back: [source.id], void: [subject.id], energy: 2 });
    const before = stateHash(f.state);
    expect(() => f.engine.apply(f.state, side, { kind: "play", card: f.ids[side].void[0], from: "void" }, { answer() { throw new Error("synthetic answer failure"); } })).toThrow("synthetic answer failure");
    expect(stateHash(f.state)).toBe(before);
    expect(f.state.turnLog.played[side]).toEqual([]);
    expect(f.state.floating).toEqual([]);
  });

  it("pays before an Interrupt can Prevent the reclaimed event, without a refund", () => {
    const source = reclaimCard(204, { ...v.vanilla0, id: reclaimCard(204).id, status: "authored", abilities: () => [staticAbility(p.costModifierReclaim("you", { reduce: 1 }))] });
    const subject = reclaimCard(205, { abilities: () => [reclaim(energy(3)), event(p.gainPoints(1))] });
    const prevent = reclaimCard(206, { costs: [energy(0)], speed: "interrupt", abilities: () => [event(p.prevent(stackItem({ controller: "opponent", cardType: "event" })))] });
    const f = reclaimFixture(side, [source, subject, prevent], { back: [source.id], void: [subject.id], energy: 2 }, { hand: [prevent.id] });
    const id = f.ids[side].void[0];
    const played = f.engine.apply(f.state, side, { kind: "play", card: id, from: "void" }, NO_PROMPTS);
    expect(played.state.stack).toContainEqual(expect.objectContaining({ kind: "card", instance: id }));
    expect(played.state.sides[side].currentEnergy).toBe(0);
    const answers = new ScriptedSource([]);
    const prevented = f.engine.apply(played.state, opponent(side), { kind: "play", card: f.ids[opponent(side)].hand[0], from: "hand" }, answers);
    const done = reclaimSettle(f.engine, prevented.state);
    expect(done.sides[side].currentEnergy).toBe(0);
    expect(done.sides[side].score).toBe(10);
    expect(done.instances[id].zone).toBe("banished");
  });

  it("rejects a saved floating Reclaim modifier rather than persisting a static instruction", () => {
    const f = reclaimFixture(side, [], { back: [v.vanilla1.id] });
    const raw = saved(sliceOf(f.state));
    expect(parseJourneyBattleFoldState(raw)).not.toBeNull();
    raw.engine.slice.committed.nextEffect = 2;
    raw.engine.slice.committed.floating.push({ id: "e1", source: f.ids[side].back[0]!, controller: side, timestamp: 0,
      expiry: { at: "never" }, change: { kind: "reclaimCost", player: side, mode: "set", amount: 0 } });
    expect(parseJourneyBattleFoldState(raw)).toBeNull();
  });
});
