/** Permanent first-occasion grants preserve committed, anonymous physical-member fidelity. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { enginePrintedKeywords, engineStatuses } from "../../../../screens/cumulus_adapters/engine-battle-view-model";
import { withHistory } from "../../../debug/debug-actions";
import type { Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { passUntil } from "../../../testing/trigger-harness";
import type { Decklists } from "../../../view/determinize";
import { cards, engine, grants, keyword, play, provider, signId, v, world } from "./first-materialization-keyword-support";

const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const saved = (s: BattleSlice) => ({ init: { seed: s.committed.seed, scoreToWin: 10000, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: s });
function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(JSON.stringify(out));
  return out.slice;
}
function lists(state: BattleState): Decklists {
  const entries = (side: Side) => Object.values(state.instances).flatMap(instance =>
    instance.owner === side && instance.printing.kind === "card" && !instance.status.created
      ? [{ cardId: instance.printing.cardId, ...instance.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}
const seed = battleSeed("first-materialization-keyword-fidelity");
const matches = (state: BattleState, decklists: Decklists, subject = engine) =>
  expect(determinizationDivergences(subject, state, decklists, seed, 0)).toEqual([]);

for (const side of SIDES) describe(`${side} first materialization fidelity`, () => {
  it("keeps duplicate grants on one anonymous member after both source and subject become concealed", () => {
    const b = world(side, [v.vanilla0.id, cards.leave.id, cards.hide.id, cards.create.id], { dreamsigns: [signId], back: [provider.id] });
    const decklists = lists(b.state);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    expect(grants(state)).toHaveLength(2);
    for (const viewer of SIDES) {
      const badges = engineStatuses(engine.view(state, viewer), viewer, enginePrintedKeywords(engine.catalog));
      expect(badges.cards.get(b.ids[side].hand[0])?.map(e => e.kind)).toEqual(["keyword"]);
    }
    state = play(state, side, b.ids[side].hand[1]).state;
    state = play(state, side, b.ids[side].hand[2]).state;
    matches(state, decklists);
    const seen = engine.view(state, opponent(side));
    expect(JSON.stringify(seen)).not.toContain(`"${b.ids[side].hand[0]}"`);
    const shown = seen.floating.flatMap(e => e.change.kind === "firstMaterializationKeyword" ? [{ ...e, change: e.change }] : []);
    expect(shown).toHaveLength(2);
    expect(shown[0].change.instance).toEqual(shown[1].change.instance);
    expect(shown.find(e => e.source === null)).toBeDefined();
    const sampled = engine.determinize(seen, decklists, () => 0.37);
    const ids = grants(sampled).map(e => e.change.instance);
    expect(ids[0]).toBe(ids[1]);
    expect(engine.view(sampled, opponent(side))).toEqual(seen);
    expect(engineStatuses(seen, opponent(side), enginePrintedKeywords(engine.catalog)).cards.has(b.ids[side].hand[0])).toBe(false);
    const ownView = engine.view(state, side);
    const ownSample = engine.determinize(ownView, decklists, () => 0.37);
    expect(engine.view(ownSample, side)).toEqual(ownView);
    const hiddenSource = grants(ownSample).find(e => typeof e.source === "string")!.source;
    if (typeof hiddenSource !== "string") throw new Error("Missing reserved source");
    expect(ownSample.instances[hiddenSource]).toBeUndefined();
    expect(Number(hiddenSource.slice(1))).toBeLessThan(ownSample.nextInstance);
    const made = play(ownSample, side, b.ids[side].hand[3]);
    const created = made.events.flatMap(e => e.kind === "cardCreated" ? [e.instance] : []);
    expect(created.length).toBeGreaterThan(0);
    expect(created).not.toContain(hiddenSource);
    expect(engine.view(made.state, side).floating.find(e => e.id === grants(ownSample).find(g => g.source === hiddenSource)!.id)?.source).toBeNull();
    const bad = structuredClone(seen);
    const member = bad.floating.find(e => e.change.kind === "firstMaterializationKeyword")!.change;
    if (member.kind !== "firstMaterializationKeyword" || typeof member.instance !== "object" || member.instance === null) throw new Error("Missing anonymous member");
    Object.assign(member.instance, { member: -1 });
    expect(() => engine.determinize(bad, decklists, () => 0.37)).toThrow();
  });

  it("retains independent same-printing first members from different turns and detects missing or collapsed bindings", () => {
    const b = world(side, [v.vanilla0.id, v.vanilla0.id, cards.leave.id, cards.hide.id]);
    const decklists = lists(b.state);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, s => s.turn.turnNumber > turn && s.turn.active === side && s.turn.phase === "day").state;
    state = play(state, side, b.ids[side].hand[1]).state;
    state = play(state, side, b.ids[side].hand[2]).state;
    state = play(state, side, b.ids[side].hand[3]).state;
    matches(state, decklists);
    for (const corruption of ["missing", "collapsed", "expiry", "player", "keyword"] as const) {
      const faulty: Engine = { ...engine, determinize: (...args) => {
        const result = cloneState(engine.determinize(...args));
        const [a, b] = grants(result);
        if (corruption === "missing") result.floating = result.floating.filter(e => e.id !== a.id);
        else if (corruption === "collapsed") Object.assign(b.change, { instance: a.change.instance });
        else if (corruption === "expiry") Object.assign(a, { expiry: { at: "endOfTurn" } });
        else if (corruption === "player") Object.assign(a.change, { player: opponent(side) });
        else Object.assign(a.change, { keyword: "vengeful" });
        return result;
      } };
      expect(determinizationDivergences(faulty, state, decklists, seed, 0).length).toBeGreaterThan(0);
    }
  });

  it("validates physical permanent grants at current, pending and independent history-base boundaries", () => {
    const b = world(side, [v.vanilla0.id, cards.pay.id], { back: [v.vanilla0.id, v.vanilla1.id] });
    const state = play(b.state, side, b.ids[side].hand[0]).state;
    const json = deserializeState(serializeState(state));
    expect(stateHash(json)).toBe(stateHash(state));
    expect(stateHash(cloneState(state))).toBe(stateHash(state));
    const settled = slice(json), history = withHistory(settled), fold = createFoldAdapter(engine);
    const pending = applied(fold.reduce(history, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[1], from: "hand" } }));
    expect(fold.pending(pending)?.prompt.cancellable).toBe(true);
    for (const current of [settled, history, pending]) {
      expect(parseEngineBattleFold(saved(current))).not.toBeNull();
      for (const location of current.history === undefined ? ["committed"] as const : ["committed", "base"] as const) {
        for (const mutation of [{ keyword: "vengeful" }, { player: "invalid" }, { instance: null }, { instance: "invalid" }]) {
          const bad = structuredClone(saved(current));
          const target = location === "committed" ? bad.slice.committed : bad.slice.history!.base.committed;
          Object.assign(grants(target)[0].change, mutation);
          expect(parseEngineBattleFold(bad)).toBeNull();
        }
        for (const expiry of [{ at: "endOfTurn" }, { at: "turnStart", side }, { at: "nextDay" }, { at: "sourceLeavesPlay", source: b.ids[side].hand[0] }]) {
          const bad = structuredClone(saved(current));
          const target = location === "committed" ? bad.slice.committed : bad.slice.history!.base.committed;
          Object.assign(grants(target)[0], { expiry });
          expect(parseEngineBattleFold(bad)).toBeNull();
        }
      }
    }
  });

  it("replays an actual suspended entry step from its committed boundary exactly once", () => {
    const b = world(side, [cards.pause.id], { void: [v.vanilla0.id] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } });
    const held = applied(opened);
    const prompt = fold.pending(held)!.prompt;
    expect(prompt.kind).toBe("confirm");
    expect(grants(held.committed)).toEqual([]);
    const restored = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(held))))!;
    expect(restored).not.toBeNull();
    expect(fold.reduce(restored.slice, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(restored.slice, { kind: "answer", side, promptId: prompt.id, value: 99 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: false };
    const direct = fold.reduce(held, answer), replay = createFoldAdapter(engine, { checkEventPrefix: true }).reduce(restored.slice, answer);
    const committed = applied(direct);
    expect(stateHash(applied(replay).committed)).toBe(stateHash(committed.committed));
    expect(grants(committed.committed)).toHaveLength(1);
    if (direct.kind !== "applied" || opened.kind !== "applied") throw new Error("Unexpected replay bounce");
    expect([...opened.published, ...direct.published].filter(e => e.kind === "effectStarted" && e.change.kind === "firstMaterializationKeyword")).toHaveLength(1);
    expect(fold.reduce(committed, answer).kind).toBe("bounced");
  });

  it("cancels and restores precommit prompts without consuming first; stale, foreign and duplicate answers bounce", () => {
    const b = world(side, [cards.pay.id], { back: [v.vanilla0.id, v.vanilla1.id] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const held = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(held)!.prompt;
    const restored = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(held))))!;
    expect(restored).not.toBeNull();
    expect(grants(held.committed)).toEqual([]);
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: [b.ids[side].back[0]!] };
    expect(fold.reduce(restored.slice, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const cancelled = applied(fold.reduce(restored.slice, { kind: "cancel", side, promptId: prompt.id }));
    expect(grants(cancelled.committed)).toEqual([]);
    const retry = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    expect(fold.reduce(retry, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const complete = applied(fold.reduce(restored.slice, answer));
    const replay = applied(createFoldAdapter(engine).reduce(JSON.parse(JSON.stringify(held)) as BattleSlice, answer));
    expect(stateHash(complete.committed)).toBe(stateHash(replay.committed));
    expect(grants(complete.committed)).toHaveLength(1);
    expect(fold.reduce(complete, answer).kind).toBe("bounced");
    const id = grants(complete.committed)[0].change.instance;
    if (id === null) throw new Error("Missing physical grant");
    expect(keyword(complete.committed, id)).toBe(true);
  });
});
