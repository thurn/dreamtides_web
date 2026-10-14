/** Public effect/payment consumers and transactional, saved, privacy contracts. */
import { describe, expect, it } from "vitest";
import { parseCardSubtype } from "../../../../types/card-identity";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { NO_DECK_MODS } from "../../../dsl/types";
import { createFoldAdapter } from "../../../fold/slice";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type Side, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import { boardState } from "../../../testing/board";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { D, engine, v, deck, run, answers, slice, applied } from "./discarded-turn-membership.fixtures";
const setup = (side: Side, hand: readonly typeof v.vanilla0.id[], voids: readonly typeof v.vanilla0.id[] = []) => {
  const b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { hand, void: voids, energy: 20, deck }, [opponent(side)]: { hand: [v.interruptEvent.id], energy: 20, deck } });
  return { ...b, state: { ...b.state, config: { ...b.state.config, handLimit: 10, turnLimit: null } } };
};
const play = (state: BattleState, side: Side, card: InstanceId, accept = true) => run(state, side, { kind: "play", card, from: "hand" }, accept);
const physical = (state: BattleState, side: Side) => state.turnLog.discardedCards?.[side] ?? [];
const saved = (committed: BattleState) => ({ init: { seed: committed.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(committed) });
const decks = (state: BattleState) => {
  const owned = (side: Side) => Object.values(state.instances).flatMap(card =>
    card.owner === side && card.printing.kind === "card" ? [{ cardId: card.printing.cardId, ...card.variant }] : []);
  return { player: owned("player"), enemy: owned("enemy") };
};
const entered = (out: ReturnType<typeof run>) => out.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);

describe("current-zone discarded physical membership", () => {
  it.each(SIDES)("retains discarded %s physical membership after leaving and re-entering the void by erosion", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
      [side]: { hand: [D.one.id, v.vanilla0.id, D.hide.id, D.wake.id, D.erodeTwo.id, D.wake.id, D.wake.id], deck: [v.vanilla0.id], energy: 20 },
      [opponent(side)]: { hand: [v.interruptEvent.id], deck, energy: 20 } });
    const victim = b.ids[side].hand[1], unrelated = b.ids[side].deck[0];
    expect(victim).not.toBe(unrelated);
    const initial = { ...b.state, config: { ...b.state.config, handLimit: 10, turnLimit: null } };
    const discarded = play(initial, side, b.ids[side].hand[0]);
    expect(discarded.events.flatMap(e => e.kind === "discarded" ? [e.instance] : [])).toEqual([victim]);
    expect(discarded.state.sides[side].void).toContain(victim);
    const shuffled = play(discarded.state, side, b.ids[side].hand[2]);
    expect(new Set(shuffled.state.sides[side].deck)).toEqual(new Set([victim, unrelated]));
    expect(shuffled.state.sides[side].void).not.toContain(victim);
    const absent = play(shuffled.state, side, b.ids[side].hand[3]);
    expect(entered(absent)).toEqual([]);
    expect(absent.state.instances[victim].zone).toBe("deck");
    // Eroding the complete declared deck puts both physical copies in the void,
    // independently of the shuffle order; only one was discarded this turn.
    const eroded = play(absent.state, side, b.ids[side].hand[4]);
    expect(new Set(eroded.events.flatMap(e => e.kind === "eroded" ? [e.instance] : []))).toEqual(new Set([victim, unrelated]));
    expect(eroded.state.sides[side].deck).toEqual([]);
    expect(eroded.state.sides[side].void).toEqual(expect.arrayContaining([victim, unrelated]));
    expect(eroded.events.some(e => e.kind === "discarded" || e.kind === "discardBatch" || e.kind === "fatigue")).toBe(false);
    const out = play(eroded.state, side, b.ids[side].hand[5]);
    expect(entered(out)).toEqual([victim]);
    expect(out.state.instances[victim]).toMatchObject({ owner: side, controller: side, zone: "play" });
    expect(out.state.sides[side].void).toContain(unrelated);
    const again = play(out.state, side, b.ids[side].hand[6]);
    expect(entered(again)).toEqual([]);
    expect(again.state.sides[side].void).toContain(unrelated);
    expect(again.state.turn.turnNumber).toBe(initial.turn.turnNumber);
    expect(invariantViolations(again.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("materializes only actual discarded %s physical cards, preserving zone order and distinct copies", side => {
    const b = setup(side, [D.two.id, v.vanilla0.id, v.vanilla0.id, D.wake.id], [v.vanilla0.id]);
    const discarded = play(b.state, side, b.ids[side].hand[0]);
    const cohort = b.ids[side].hand.slice(1, 3);
    expect(physical(discarded.state, side)).toEqual(cohort);
    expect(discarded.state.turnLog.discarded?.[side]).toBe(2);
    const expected = discarded.state.sides[side].void.filter(id => cohort.includes(id));
    const out = play(discarded.state, side, b.ids[side].hand[3]);
    expect(entered(out)).toEqual(expected);
    expect(out.state.sides[side].void).toContain(b.ids[side].void[0]);
    expect(new Set(entered(out)).size).toBe(2);
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
    expect(out.state.turnLog.dissolved?.[side]).toEqual([]);
    expect(out.state.turnLog.abandoned?.[side]).toEqual([]);
  });

  it.each(SIDES)("retains repeated %s discard occurrences but names a current member once", side => {
    const b = setup(side, [D.one.id, v.vanilla0.id, D.wake.id, D.return.id, D.one.id, D.wake.id]);
    const victim = b.ids[side].hand[1];
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[2]).state;
    state = play(state, side, b.ids[side].hand[3]).state;
    const selected = new InlineSource({
      player: prompt => prompt.kind === "chooseCards" ? [victim] : true,
      enemy: prompt => prompt.kind === "chooseCards" ? [victim] : true,
    });
    const cast = engine.apply(state, side, { kind: "play", card: b.ids[side].hand[4], from: "hand" }, selected);
    const decision = engine.decision(cast.state)!;
    state = cast.state.stack.length === 0 ? cast.state : engine.apply(cast.state, decision.side, { kind: "pass" }, selected).state;
    expect(physical(state, side)).toEqual([victim, victim]);
    expect(state.turnLog.discarded?.[side]).toBe(2);
    const out = play(state, side, b.ids[side].hand[5]);
    expect(entered(out)).toEqual([victim]);
  });

  it.each(SIDES)("uses completed %s payment cohorts and excludes refusal, zero and non-discard void entries", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [D.payer.id], hand: [v.vanilla0.id], void: [v.vanilla0.id], deck }, [opponent(side)]: { deck } });
    const paid = run(b.state, side, { kind: "activate", source: b.ids[side].back[0]!, ability: 0 });
    expect(entered(paid)).toEqual([b.ids[side].hand[0]]);
    expect(physical(paid.state, side)).toEqual([b.ids[side].hand[0]]);
    expect(paid.state.sides[side].void).toContain(b.ids[side].void[0]);
    for (const form of [D.mayPay, D.zero]) {
      const may = setup(side, [form.id, v.vanilla0.id, D.wake.id]);
      const declined = play(may.state, side, may.ids[side].hand[0], false);
      expect(physical(declined.state, side)).toEqual([]);
      expect(entered(play(declined.state, side, may.ids[side].hand[2]))).toEqual([]);
      expect(declined.events.some(e => e.kind === "discardBatch")).toBe(false);
    }
    const may = setup(side, [D.mayPay.id, v.vanilla0.id]);
    expect(entered(play(may.state, side, may.ids[side].hand[0]))).toEqual([may.ids[side].hand[1]]);
  });

  it.each(SIDES)("includes %s hand-limit discards before real next-turn reset", side => {
    const b = boardState(engine.catalog, { active: side, phase: "night", scoreToWin: 100,
      [side]: { back: [D.handLimit.id], hand: [v.vanilla0.id, v.vanilla0.id, v.vanilla0.id], deck }, [opponent(side)]: { deck } });
    const state = { ...b.state, config: { ...b.state.config, handLimit: 1, turnLimit: null } };
    const out = engine.apply(state, side, { kind: "pass" }, answers());
    expect(out.events.filter(e => e.kind === "discardBatch")).toEqual([{ kind: "discardBatch", side, count: 2 }]);
    expect(out.events.flatMap(e => e.kind === "materialized" ? [e.instance] : [])).toEqual(b.ids[side].hand.slice(0, 2).reverse());
    expect(out.state.turn.turnNumber).toBeGreaterThan(state.turn.turnNumber);
    expect(physical(out.state, side)).toEqual([]);
  });

  it.each(SIDES)("scans both discarding actors while the %s reader selects a foreign owner's void", side => {
    const other = opponent(side);
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [D.take.id, D.one.id, D.otherWake.id], deck }, [other]: { hand: [v.vanilla0.id], deck } });
    const victim = b.ids[other].hand[0];
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    expect(state.instances[victim]).toMatchObject({ owner: other, controller: side, zone: "hand" });
    const chosen = new InlineSource({ player: () => [victim], enemy: () => [victim] });
    const first = engine.apply(state, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, chosen);
    state = first.state;
    if (state.stack.length > 0) state = engine.apply(state, engine.decision(state)!.side, { kind: "pass" }, chosen).state;
    expect(physical(state, side)).toEqual([victim]);
    expect(physical(state, other)).toEqual([]);
    expect(state.sides[other].void).toContain(victim);
    const out = play(state, side, b.ids[side].hand[2]);
    expect(entered(out)).toEqual([victim]);
    expect(out.state.instances[victim].controller).toBe(side);
  });

  it.each(SIDES)("keeps %s created cessation and Reclaim replacement outside current void membership", side => {
    for (const flag of ["created", "reclaimed"] as const) {
      const b = setup(side, [D.one.id, v.vanilla0.id, D.wake.id]);
      const victim = b.ids[side].hand[1]; b.state.instances[victim].status[flag] = true;
      const discarded = play(b.state, side, b.ids[side].hand[0]);
      expect(physical(discarded.state, side)).toEqual([victim]);
      expect(discarded.state.turnLog.discarded?.[side]).toBe(1);
      expect(discarded.state.instances[victim]?.zone).toBe(flag === "created" ? undefined : "banished");
      expect(entered(play(discarded.state, side, b.ids[side].hand[2]))).toEqual([]);
      if (flag === "created") expect(engine.view(discarded.state, opponent(side)).turnLog.discardedCards?.[side]).toEqual([null]);
    }
  });

  it("filters current effective characteristics and copiable cost rather than the historical printing", () => {
    const modified = { cardId: v.event0.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character" as const, subtype: parseCardSubtype("Warrior") } } };
    const b = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [D.two.id, modified, v.vanilla2.id, D.filter.id], deck }, enemy: { deck } });
    const state = play(b.state, "player", b.ids.player.hand[0]).state;
    expect(entered(play(state, "player", b.ids.player.hand[3]))).toEqual([b.ids.player.hand[1]]);
    expect(engine.catalog.card(v.event0.id).cardType).toBe("event");
  });

  it.each(SIDES)("retains %s same-physical membership in another current zone and through save", side => {
    const b = setup(side, [D.one.id, v.vanilla0.id, D.wake.id, D.return.id, D.handWake.id, D.hide.id, D.deckWake.id]);
    const victim = b.ids[side].hand[1];
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[2]).state;
    state = play(state, side, b.ids[side].hand[3]).state;
    const loaded = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(state))));
    expect(loaded).not.toBeNull();
    const out = play(loaded!.slice.committed, side, b.ids[side].hand[4]);
    expect(entered(out)).toEqual([victim]);
    expect(deserializeState(serializeState(out.state))).toEqual(out.state);
    // The void form sees no card currently in play.
    expect(entered(play(out.state, side, out.state.sides[side].hand.find(id => out.state.instances[id].printing.kind === "card" && out.state.instances[id].printing.cardId === D.deckWake.id)!))).toEqual([]);
  });

  it.each(SIDES)("redacts %s unknown historical identities and reserves independent anonymous sampled IDs", side => {
    const b = setup(side, [D.two.id, v.vanilla0.id, v.vanilla0.id, D.hide.id, D.deckWake.id]);
    const discarded = play(b.state, side, b.ids[side].hand[0]).state;
    expect(determinizationDivergences(engine, discarded, decks(discarded), battleSeed("discard-members-visible"), 0)).toEqual([]);
    const knownView = engine.view(discarded, side);
    const knownSample = engine.determinize(knownView, decks(discarded), () => 0.5);
    expect(comparableView(engine.view(knownSample, side))).toEqual(comparableView(knownView));
    const hidden = play(discarded, side, b.ids[side].hand[3]).state;
    const seen = engine.view(hidden, opponent(side));
    expect(seen.turnLog.discardedCards?.[side]).toEqual([null, null]);
    const sample = engine.determinize(seen, decks(hidden), () => 0.5);
    expect(new Set(physical(sample, side)).size).toBe(2);
    expect(physical(sample, side).some(id => sample.instances[id] !== undefined)).toBe(false);
    expect(comparableView(engine.view(sample, opponent(side)))).toEqual(comparableView(seen));
    // Authoritative physical history stays with the same cards after a blind shuffle.
    const real = play(hidden, side, b.ids[side].hand[4]);
    expect(new Set(entered(real))).toEqual(new Set(b.ids[side].hand.slice(1, 3)));
  });

  it("accepts missing legacy membership and rejects malformed optional IDs through public LOAD", () => {
    const b = setup("player", [D.one.id, v.vanilla0.id, D.wake.id]);
    const state = play(b.state, "player", b.ids.player.hand[0]).state;
    const legacy = deserializeState(serializeState(state)); delete legacy.turnLog.discardedCards;
    const old = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(legacy))));
    expect(old).not.toBeNull();
    expect(entered(play(old!.slice.committed, "player", b.ids.player.hand[2]))).toEqual([]);
    expect(old!.slice.committed.turnLog.discarded?.player).toBe(1);
    for (const invalid of [{ player: ["bad-id"], enemy: [] }, { player: [null], enemy: [] }, { player: [], enemy: 1 }, []]) {
      const bad = JSON.parse(JSON.stringify(saved(state))) as ReturnType<typeof saved>;
      Object.assign(bad.slice.committed.turnLog, { discardedCards: invalid });
      expect(parseEngineBattleFold(bad)).toBeNull();
    }
  });

  it.each(SIDES)("resets %s membership at normal and extra turns", side => {
    for (const extra of [false, true]) {
      const b = setup(side, [D.one.id, v.vanilla0.id, ...(extra ? [D.extra.id] : [])]);
      let state = play(b.state, side, b.ids[side].hand[0]).state;
      if (extra) state = play(state, side, b.ids[side].hand[2]).state;
      const turn = state.turn.turnNumber;
      for (let guard = 0; state.turn.turnNumber === turn && guard < 25; guard++) state = engine.apply(state, engine.decision(state)!.side, { kind: "pass" }, answers()).state;
      expect(state.turn.turnNumber).toBeGreaterThan(turn);
      expect(state.turn.active).toBe(extra ? side : opponent(side));
      for (const actor of SIDES) expect(physical(state, actor)).toEqual([]);
    }
  });
});

describe("discarded membership transaction and recovery", () => {
  it("cancels an uncommitted payment without history", () => {
    const b = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [D.payer.id], hand: [v.vanilla0.id, v.vanilla1.id], deck }, enemy: { deck } });
    const fold = createFoldAdapter(engine), start = slice(b.state);
    const opened = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "activate", source: b.ids.player.back[0]!, ability: 0 } }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt.cancellable).toBe(true);
    const done = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(stateHash(done.committed)).toBe(stateHash(start.committed));
    expect(physical(done.committed, "player")).toEqual([]);
  });

  it("retains a completed work-prefix once after cold reload and rejects stale, invalid or concurrent actors", () => {
    const b = setup("player", [D.pause.id, v.vanilla0.id, v.vanilla1.id]);
    const fold = createFoldAdapter(engine), start = slice(b.state);
    let pending = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: b.ids.player.hand[0], from: "hand" } }));
    if (fold.pending(pending) === null) pending = applied(fold.reduce(pending, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const discard = fold.pending(pending)!;
    pending = applied(fold.reduce(pending, { kind: "answer", side: "player", promptId: discard.prompt.id, value: [b.ids.player.hand[1]] }));
    const confirm = fold.pending(pending)!;
    expect(physical(confirm.display, "player")).toEqual([b.ids.player.hand[1]]);
    expect(physical(pending.committed, "player")).toEqual([]);
    const loaded = parseEngineBattleFold(JSON.parse(JSON.stringify({ ...saved(pending.committed), slice: pending })))!;
    expect(loaded).not.toBeNull();
    const fresh = createFoldAdapter(engine), original = JSON.stringify(loaded.slice);
    expect(fresh.pending(loaded.slice)!.prompt.id).toBe(confirm.prompt.id);
    const accept = { kind: "answer", side: "player", promptId: confirm.prompt.id, value: true } as const;
    for (const intent of [{ ...accept, side: "enemy" as const }, { ...accept, promptId: discard.prompt.id }, { ...accept, value: [] }, { kind: "battleAction" as const, side: "player" as const, action: { kind: "pass" as const } }]) expect(fresh.reduce(loaded.slice, intent).kind).toBe("bounced");
    expect(JSON.stringify(loaded.slice)).toBe(original);
    const done = applied(fresh.reduce(loaded.slice, accept));
    expect(physical(done.committed, "player")).toEqual([b.ids.player.hand[1]]);
    expect(done.committed.turnLog.discarded?.player).toBe(1);
    expect(stateHash(done.committed)).toBe(stateHash(applied(fold.reduce(pending, accept)).committed));
    expect(fresh.reduce(done, accept).kind).toBe("bounced");
  });

  it("rolls back post-discard failure and rejects invalid cohorts before movement", () => {
    for (const source of [D.fail, D.invalid]) {
      const b = setup("player", [source.id, v.vanilla0.id, v.vanilla1.id]);
      const fold = createFoldAdapter(engine);
      let start = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: { kind: "play", card: b.ids.player.hand[0], from: "hand" } }));
      if (fold.pending(start) === null && start.committed.stack.length > 0) {
        const out = fold.reduce(start, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
        if (source === D.invalid) {
          expect(out.kind).toBe("applied"); if (out.kind !== "applied") throw new Error("Expected failed resolution");
          expect(out.error).not.toBeNull(); expect(physical(out.slice.committed, "player")).toEqual([]);
          expect(out.slice.committed.sides.player.hand).toEqual(start.committed.sides.player.hand); continue;
        }
        start = applied(out);
      }
      const prompt = fold.pending(start)!, before = stateHash(start.committed);
      const failed = fold.reduce(start, { kind: "answer", side: "player", promptId: prompt.prompt.id, value: [b.ids.player.hand[1]] });
      if (failed.kind !== "applied") throw new Error("Expected recoverable failure");
      expect(failed.error).not.toBeNull(); expect(stateHash(failed.slice.committed)).toBe(before);
      expect(physical(failed.slice.committed, "player")).toEqual([]);
      expect(failed.slice.committed.turnLog.discarded?.player).toBe(0);
    }
  });

  it("aborts a mid-cohort error without publishing a completed physical cohort", () => {
    const b = setup("player", [D.mid.id, v.vanilla0.id, v.vanilla1.id]);
    const cast = engine.apply(b.state, "player", { kind: "play", card: b.ids.player.hand[0], from: "hand" }, answers());
    const before = stateHash(cast.state); const observations: InstanceId[][] = [];
    expect(() => runStep(cast.state, { kind: "resolveTop" }, answers(), engine.catalog, { observeEvent(event, state) {
      if (event.kind === "discarded") {
        observations.push([...physical(state(), "player")]);
      }
    } })).toThrow("Synthetic failure during discard cohort");
    expect(observations).toEqual([[]]); expect(stateHash(cast.state)).toBe(before);
    expect(physical(cast.state, "player")).toEqual([]);
  });
});
