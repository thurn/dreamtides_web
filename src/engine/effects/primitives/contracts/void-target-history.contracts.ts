/** Qualified zone targets use real occurrence producers and the public engine/fold. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, energy, event, fromVoid, keyword, self } from "../../../dsl/builders";
import type { ZoneTargetSpec } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { SIDES, opponent } from "../../../state/ids";
import type { CardId, InstanceId, Side } from "../../../state/ids";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";
import { H, v, deck } from "./turn-history.fixtures";

const make = (index: number, effect: Parameters<typeof event>[0], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x195000 + index), costs: [energy(1)], speed, status: "authored", abilities: () => [event(effect)],
});
const qualified = (thisTurn: ZoneTargetSpec["thisTurn"], options: Parameters<typeof fromVoid>[1] = {}) =>
  fromVoid({ cardType: "character" }, { count: 3, upTo: true, thisTurn, ...options });
const rescue = make(0, p.materialize(qualified("dissolved")));
const ordinary = make(1, p.materialize(fromVoid({ cardType: "character" }, { count: 3, upTo: true })));
const one = make(2, p.materialize(qualified("dissolved", { count: 1 })));
const zero = make(3, p.materialize(qualified("dissolved", { count: 0 })));
const abandoned = make(4, p.materialize(qualified("abandoned")));
const discarded = make(5, p.materialize(qualified("discarded")));
const otherDissolved = make(6, p.materialize(qualified("dissolved", { player: "opponent" })));
const otherAbandoned = make(7, p.materialize(qualified("abandoned", { player: "opponent" })));
const bounded = make(8, p.materialize(qualified("dissolved", { costAtMost: 1 })));
const moveOne = make(9, p.returnFromVoid(fromVoid({ cardType: "character" }, { player: "opponent" })), "interrupt");
const moveAll = make(10, p.returnFromVoid({ ...qualified("dissolved", { player: "opponent" }), count: 3 }), "interrupt");
const failure = make(11, p.sequence(p.materialize(qualified("dissolved")), p.gainAdditionalSpark(self(), 1)));
const killLow = make(12, p.dissolve(all(characterYouControl({ costAtMost: 1 }))));
const untargetable: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x195020), status: "authored", abilities: () => [keyword("cannotBeTargeted")] };
const engine = createEngine(testCatalog([...Object.values(H), rescue, ordinary, one, zero, abandoned, discarded, otherDissolved, otherAbandoned, bounded, moveOne, moveAll, failure, killLow, untargetable]));
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const applied = (out: IntentOutcome) => {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(out)}`);
  return out.slice;
};
const setup = (side: Side, hand: readonly CardId[], back: readonly CardId[] = [], extra: Partial<BoardSetup> = {}) => boardState(engine.catalog, {
  active: side, phase: "day", scoreToWin: 100, [side]: { hand, back, energy: 50, deck }, [opponent(side)]: { deck }, ...extra,
});
function chooser(pick: (prompt: Prompt) => Answer = prompt => {
  if (prompt.kind === "chooseTargets" || prompt.kind === "chooseCards") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected ${prompt.kind}`);
}) { return new InlineSource({ player: pick, enemy: pick }); }
function play(state: BattleState, side: Side, card: InstanceId, source = chooser()) {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, source);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
function pending(state: BattleState, side: Side, card: InstanceId) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const held = applied(fold.reduce(slice(state), { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
  const prompt = fold.pending(held)!.prompt;
  if (prompt.kind !== "chooseTargets") throw new Error(`Expected target choice, got ${prompt.kind}`);
  return { fold, held, prompt };
}
const allTargets = chooser(prompt => {
  if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`Unexpected ${prompt.kind}`);
  return prompt.candidates.slice(0, prompt.max);
});

describe("void targets qualified by current-turn membership", () => {
  it.each(SIDES)("offers genuine dissolved physical members once, excluding stale/discarded/ceased copies for %s", side => {
    const b = setup(side, [H.copy.id, H.kill.id, H.discard.id, v.vanilla1.id, rescue.id, ordinary.id], [v.vanilla0.id, v.vanilla0.id], {
      [side]: { hand: [H.copy.id, H.kill.id, H.discard.id, v.vanilla1.id, rescue.id, ordinary.id], back: [v.vanilla0.id, v.vanilla0.id], void: [v.vanilla0.id], energy: 50, deck },
    });
    const copied = play(b.state, side, b.ids[side].hand[0], allTargets).state;
    const gone = play(copied, side, b.ids[side].hand[1]).state;
    const discards = play(gone, side, b.ids[side].hand[2], chooser(prompt => {
      if (prompt.kind !== "chooseCards") throw new Error("Expected discard");
      return [b.ids[side].hand[3]];
    })).state;
    const actual = [...b.ids[side].back].reverse().filter((id): id is InstanceId => id !== null);
    const selected = pending(discards, side, b.ids[side].hand[4]);
    expect(selected.prompt.candidates).toEqual(actual);
    expect(new Set(selected.prompt.candidates).size).toBe(2);
    expect(discards.turnLog.dissolved?.[side]).toHaveLength(3);
    const unqualified = pending(discards, side, b.ids[side].hand[5]);
    expect(unqualified.prompt.candidates).toContain(b.ids[side].void[0]);
    expect(unqualified.prompt.candidates).toContain(b.ids[side].hand[3]);
    const result = play(discards, side, b.ids[side].hand[4], allTargets);
    expect(result.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(actual);
    for (const id of actual) expect(result.state.instances[id]).toMatchObject({ zone: "play", owner: side, controller: side, status: { exhausted: true } });
  });

  it.each(SIDES)("deduplicates repeat occurrences and offers zero, one, or three chosen targets for %s", side => {
    for (const [definition, selected] of [[zero, 0], [one, 1], [rescue, 3]] as const) {
      const b = setup(side, [H.kill.id, H.wake.id, H.kill.id, definition.id], [v.vanilla0.id, v.vanilla0.id, v.vanilla1.id]);
      let state = play(b.state, side, b.ids[side].hand[0]).state;
      state = play(state, side, b.ids[side].hand[1]).state;
      state = play(state, side, b.ids[side].hand[2]).state;
      expect(state.turnLog.dissolved?.[side]).toHaveLength(6);
      const prompts: Prompt[] = [];
      const result = play(state, side, b.ids[side].hand[3], chooser(prompt => {
        prompts.push(prompt); if (prompt.kind !== "chooseTargets") throw new Error("Expected targets");
        expect(prompt.candidates).toHaveLength(3); return prompt.candidates.slice(0, selected);
      }));
      expect(result.events.filter(e => e.kind === "materialized")).toHaveLength(selected);
      if (selected > 0) expect(prompts[0]).toMatchObject({ kind: "chooseTargets", side, min: 0, max: selected });
    }
    const b = setup(side, [H.kill.id, rescue.id], [v.vanilla0.id]);
    const state = play(b.state, side, b.ids[side].hand[0]).state;
    expect(play(state, side, b.ids[side].hand[1]).events.some(e => e.kind === "materialized")).toBe(false);
  });

  it.each(SIDES)("composes targetability and cost bounds with successful membership for %s", side => {
    const b = setup(side, [H.kill.id, bounded.id], [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, untargetable.id]);
    const gone = play(b.state, side, b.ids[side].hand[0]).state;
    expect(pending(gone, side, b.ids[side].hand[1]).prompt.candidates).toEqual(b.ids[side].back.slice(0, 2).reverse());
  });

  it.each(SIDES)("uses the named current void and preserves dissolved/abandoned controller distinctions for %s", side => {
    for (const departure of [H.kill, H.abandon]) {
      const b = setup(side, [H.gain.id, departure.id, otherDissolved.id, otherAbandoned.id], [], {
        [opponent(side)]: { back: [v.vanilla1.id], deck },
      });
      const victim = b.ids[opponent(side)].back[0]!;
      const borrowed = play(b.state, side, b.ids[side].hand[0]).state;
      expect(borrowed.instances[victim].controller).toBe(side);
      const gone = play(borrowed, side, b.ids[side].hand[1], allTargets).state;
      expect(gone.instances[victim]).toMatchObject({ zone: "void", owner: opponent(side), controller: opponent(side) });
      expect(pending(gone, side, b.ids[side].hand[2]).prompt.candidates).toEqual([victim]);
      expect(pending(gone, side, b.ids[side].hand[3]).prompt.candidates).toEqual([]);
    }
    const b = setup(side, [H.abandon.id, abandoned.id, discarded.id], [v.vanilla1.id]);
    const state = play(b.state, side, b.ids[side].hand[0], allTargets).state;
    expect(pending(state, side, b.ids[side].hand[1]).prompt.candidates).toEqual([b.ids[side].back[0]]);
    expect(pending(state, side, b.ids[side].hand[2]).prompt.candidates).toEqual([]);
    const d = setup(side, [H.discard.id, v.vanilla1.id, discarded.id, rescue.id]);
    const discardedState = play(d.state, side, d.ids[side].hand[0], allTargets).state;
    expect(pending(discardedState, side, d.ids[side].hand[2]).prompt.candidates).toEqual([d.ids[side].hand[1]]);
    expect(pending(discardedState, side, d.ids[side].hand[3]).prompt.candidates).toEqual([]);
  });

  it.each(SIDES)("requires successful dissolution after Veil or reclaimed departure and fresh normal/extra turns for %s", side => {
    const veil = setup(side, [H.killAll.id, otherDissolved.id], [], { [opponent(side)]: { back: [H.veil.id], deck } });
    expect(pending(play(veil.state, side, veil.ids[side].hand[0]).state, side, veil.ids[side].hand[1]).prompt.candidates).toEqual([]);
    const reclaimed = setup(side, [H.kill.id, rescue.id], [v.vanilla1.id]);
    reclaimed.state.instances[reclaimed.ids[side].back[0]!].status.reclaimed = true;
    expect(pending(play(reclaimed.state, side, reclaimed.ids[side].hand[0]).state, side, reclaimed.ids[side].hand[1]).prompt.candidates).toEqual([]);
    for (const extra of [false, true]) {
      const b = setup(side, [H.kill.id, ...(extra ? [H.extra.id] : []), rescue.id], [v.vanilla1.id]);
      let state = play(b.state, side, b.ids[side].hand[0]).state;
      if (extra) state = play(state, side, b.ids[side].hand[1]).state;
      const priorTurn = state.turn.turnNumber;
      state = passUntil(engine, state, next => next.turn.turnNumber > priorTurn && next.turn.active === side && next.turn.phase === "day").state;
      expect(pending(state, side, b.ids[side].hand[extra ? 2 : 1]).prompt.candidates).toEqual([]);
    }
  });

  it.each(SIDES)("revalidates chosen physical targets after a genuine interrupt and preserves partial/zero legal outcomes for %s", side => {
    for (const interrupt of [moveOne, moveAll]) {
      const b = setup(side, [H.kill.id, rescue.id], [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], {
        [opponent(side)]: { hand: [interrupt.id], energy: 50, deck },
      });
      const gone = play(b.state, side, b.ids[side].hand[0]).state;
      const announced = engine.apply(gone, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, allTargets);
      const responded = engine.apply(announced.state, opponent(side), { kind: "play", card: b.ids[opponent(side)].hand[0], from: "hand" }, allTargets);
      const result = passUntil(engine, responded.state, state => state.stack.length === 0, allTargets);
      const survivors = interrupt === moveOne ? b.ids[side].back.slice(0, 2).reverse() : [];
      const events = [...responded.events, ...result.events];
      expect(events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual(survivors);
      expect(events.some(e => e.kind === "noLegalTarget")).toBe(interrupt === moveAll);
      expect(result.state.instances[b.ids[side].back[2]!].zone).toBe("hand");
    }
  });

  it.each(SIDES)("preserves qualified choices through cold save/view/replay and rejects invalid, stale, foreign and concurrent input for %s", side => {
    const b = setup(side, [H.kill.id, rescue.id], [v.vanilla0.id], {
      [side]: { hand: [H.kill.id, rescue.id], back: [v.vanilla0.id], void: [v.vanilla1.id], energy: 50, deck },
    });
    const gone = play(b.state, side, b.ids[side].hand[0]).state;
    const { held, prompt } = pending(gone, side, b.ids[side].hand[1]);
    const saved = parseEngineBattleFold(JSON.parse(JSON.stringify({ init: { seed: gone.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: held })))!;
    expect(saved).not.toBeNull();
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved.slice)!.prompt).toEqual(prompt);
    expect(deserializeState(serializeState(gone))).toEqual(gone);
    expect(engine.view(gone, opponent(side)).sides[side].void).toContain(b.ids[side].back[0]);
    const immutable = JSON.stringify(saved.slice);
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: [b.ids[side].back[0]!] };
    expect(fresh.reduce(saved.slice, { ...answer, side: opponent(side) }).kind).toBe("bounced");
    expect(fresh.reduce(saved.slice, { ...answer, value: [b.ids[side].void[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce({ ...saved.slice, attempt: held.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved.slice, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(JSON.stringify(saved.slice)).toBe(immutable);
    const cancelled = applied(fresh.reduce(saved.slice, { kind: "cancel", side, promptId: prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(gone));
    const retry = applied(fresh.reduce(cancelled, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[1], from: "hand" } }));
    const retryPrompt = fresh.pending(retry)!.prompt;
    expect(retryPrompt.id).not.toBe(prompt.id);
    expect(fresh.reduce(retry, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const selected = applied(fresh.reduce(saved.slice, answer));
    const replay = applied(fresh.reduce(JSON.parse(JSON.stringify(held)) as BattleSlice, answer));
    expect(stateHash(selected.committed)).toBe(stateHash(replay.committed));
    const resolved = passUntil(engine, selected.committed, next => next.stack.length === 0).state;
    expect(resolved.instances[b.ids[side].back[0]!].zone).toBe("play");
    if (retryPrompt.kind !== "chooseTargets") throw new Error("Expected qualified retry");
    expect(retryPrompt.candidates).toEqual(prompt.candidates);
    expect(fresh.reduce(selected, answer).kind).toBe("bounced");
  });

  it.each(SIDES)("keeps capacity and rollback atomic after qualified selection for %s", side => {
    const b = setup(side, [killLow.id, v.vanilla8.id, rescue.id], [v.vanilla0.id, v.vanilla1.id, ...Array.from({ length: 8 }, () => v.vanilla8.id)]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    const result = play(state, side, b.ids[side].hand[2], allTargets);
    expect(result.events.filter(e => e.kind === "materialized")).toHaveLength(1);
    expect(result.state.instances[b.ids[side].back[1]!].zone).toBe("play");
    expect(result.state.instances[b.ids[side].back[0]!].zone).toBe("void");
    const f = setup(side, [H.kill.id, failure.id], [v.vanilla1.id]);
    const gone = play(f.state, side, f.ids[side].hand[0]).state;
    const held = pending(gone, side, f.ids[side].hand[1]);
    const before = stateHash(held.held.committed);
    const failed = held.fold.reduce(held.held, { kind: "answer", side, promptId: held.prompt.id, value: held.prompt.candidates });
    expect(failed.kind).toBe("applied");
    if (failed.kind !== "applied") throw new Error("Expected failed resolution");
    expect(failed.error).not.toBeNull();
    expect(failed.slice.committed.instances[f.ids[side].back[0]!].zone).toBe("void");
    expect(failed.slice.committed.turnLog.materialized?.[side]).toEqual(gone.turnLog.materialized?.[side]);
    expect(stateHash(held.held.committed)).toBe(before);
  });
});
