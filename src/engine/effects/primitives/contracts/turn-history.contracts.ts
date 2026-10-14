/** Named current-turn counts and physical membership, through real actions, views and cold LOAD. */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { characteristicsOf } from "../../../continuous/characteristics";
import { costModifier } from "../../../continuous/costs";
import { event, playedThisTurn, charactersPlayedThisTurn, eventsPlayedThisTurn, discardedThisTurn, leftPlayThisTurn, dissolvedThisTurn, abandonedThisTurn, materializedThisTurn, thisTurn } from "../../../dsl/builders";
import { conditionHoldsWith } from "../../../dsl/conditions";
import { NO_DECK_MODS } from "../../../dsl/types";
import type { CurrentTurnCountValue } from "../../../dsl/types";
import { evaluateValue } from "../../../dsl/values";
import { createEngine } from "../../../engine";
import { createCard } from "../create-card";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { createFoldAdapter } from "../../../fold/slice";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, battleSeed, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { H, engine, deck, v, run, applied, slice, answers } from "./turn-history.fixtures";

const counts = [playedThisTurn, charactersPlayedThisTurn, eventsPlayedThisTurn, discardedThisTurn, leftPlayThisTurn, dissolvedThisTurn, abandonedThisTurn, materializedThisTurn] as const;
const read = (state: BattleState, side: Side, value: CurrentTurnCountValue) => evaluateValue(state, value, {
  controller: side, source: { kind: "avatar", side }, x: null, count: () => 0, countCards: () => 0,
});
const play = (state: BattleState, side: Side, card: InstanceId) => run(state, side, { kind: "play", card, from: "hand" });
const setup = (side: Side, hand: readonly typeof H.kill.id[], back: readonly typeof H.kill.id[] = []) => boardState(engine.catalog, {
  active: side, phase: "day", scoreToWin: 100, [side]: { hand, back, energy: 20, deck }, [opponent(side)]: { deck },
});
const saved = (committed: BattleState) => ({ init: { seed: committed.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(committed) });
const decks = (state: BattleState) => Object.fromEntries(SIDES.map(side => [side,
  Object.values(state.instances).flatMap(card => card.owner === side && card.printing.kind === "card" ? [{ cardId: card.printing.cardId }] : []),
])) as Record<Side, { cardId: typeof H.kill.id }[]>;

// Consumers use these public observations without reading private historical printing or controller guesses.
describe("exact current-turn history", () => {
  it.each(SIDES)("reads empty named counts and no-play/no-character conditions for %s", side => {
    const b = setup(side, [v.event0.id, v.vanilla0.id]);
    for (const count of counts) expect(read(b.state, side, count())).toBe(0);
    const holds = (state: BattleState, count: CurrentTurnCountValue) => conditionHoldsWith(state, engine.catalog,
      id => characteristicsOf(state, engine.catalog, id), thisTurn(count, 0, 0), { controller: side, source: { kind: "avatar", side }, optionalPaid: [] });
    expect(holds(b.state, playedThisTurn())).toBe(true);
    const one = play(b.state, side, b.ids[side].hand[0]).state;
    expect(holds(one, playedThisTurn())).toBe(false);
    expect(holds(one, charactersPlayedThisTurn())).toBe(true);
    expect(read(one, side, eventsPlayedThisTurn())).toBe(1);
    const two = play(one, side, b.ids[side].hand[1]).state;
    expect(read(two, side, playedThisTurn())).toBe(2);
    expect(read(two, side, charactersPlayedThisTurn())).toBe(1);
    expect(read(two, side, eventsPlayedThisTurn())).toBe(1);
    expect(read(two, opponent(side), eventsPlayedThisTurn("opponent"))).toBe(1);
    expect(read(two, side, eventsPlayedThisTurn("opponent"))).toBe(0);
    expect(holds(two, charactersPlayedThisTurn())).toBe(false);
    expect(read(two, opponent(side), playedThisTurn("opponent"))).toBe(2);
    expect(read(two, side, playedThisTurn("opponent"))).toBe(0);
    expect(read(two, side, materializedThisTurn())).toBe(1);
    expect(read(two, side, materializedThisTurn("you", false))).toBe(1);
  });

  it.each(SIDES)("captures actual played character type through changed characteristics and cessation for %s", side => {
    const b = setup(side, [v.vanilla0.id, H.types.id, H.kill.id]);
    const source = b.ids[side].hand[0]; b.state.instances[source].status.created = true;
    let state = play(b.state, side, source).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(characteristicsOf(state, engine.catalog, source).allTypes).toBe(true);
    expect(read(state, side, charactersPlayedThisTurn())).toBe(1);
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(state.instances[source]).toBeUndefined();
    expect(read(state, side, playedThisTurn())).toBe(3);
    expect(read(state, side, eventsPlayedThisTurn())).toBe(2);
    expect(read(state, side, charactersPlayedThisTurn())).toBe(1);
    expect(engine.view(state, opponent(side)).turnLog.played[side][0]?.instance).toBeNull();
  });

  it.each(SIDES)("counts the effective played kind instead of catalog printing for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: {
      hand: [{ cardId: v.event0.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } }, H.kill.id], deck,
    }, [opponent(side)]: { deck } });
    const source = b.ids[side].hand[0]; b.state.instances[source].status.created = true;
    expect(engine.catalog.card(v.event0.id).cardType).toBe("event");
    let state = play(b.state, side, source).state;
    expect(characteristicsOf(state, engine.catalog, source).cardType).toBe("character");
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(state.instances[source]).toBeUndefined();
    expect(read(state, side, charactersPlayedThisTurn())).toBe(1);
    expect(read(state, side, playedThisTurn())).toBe(2);
    expect(read(state, side, eventsPlayedThisTurn())).toBe(1);
  });

  it.each(SIDES)("counts an actual figment independently of figment copies for %s", side => {
    const b = setup(side, [H.figment.id, H.kill.id]);
    const entered = play(b.state, side, b.ids[side].hand[0]).state;
    expect(read(entered, side, materializedThisTurn("you", true))).toBe(1);
    expect(read(entered, side, materializedThisTurn("you", false))).toBe(0);
    const gone = play(entered, side, b.ids[side].hand[1]).state;
    expect(read(gone, side, materializedThisTurn())).toBe(1);
    expect(read(gone, side, dissolvedThisTurn())).toBe(1);
  });

  it.each(SIDES)("counts genuine stack copies as materializations but never plays for %s", side => {
    const b = setup(side, [v.vanilla0.id], [H.mirror.id]);
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(out.events.filter(event => event.kind === "cardCopied")).toHaveLength(1);
    expect(read(out.state, side, playedThisTurn())).toBe(1);
    expect(read(out.state, side, charactersPlayedThisTurn())).toBe(1);
    expect(read(out.state, side, materializedThisTurn())).toBe(2);
    expect(read(out.state, side, materializedThisTurn("you", true))).toBe(0);
  });

  it.each(SIDES)("counts one committed Event despite a separately resolving stack copy for %s", side => {
    const b = setup(side, [v.event0.id], [H.mirror.id]);
    const out = play(b.state, side, b.ids[side].hand[0]);
    expect(out.events.filter(event => event.kind === "cardCopied")).toHaveLength(1);
    expect(out.events.filter(event => event.kind === "resolved")).toHaveLength(2);
    expect(read(out.state, side, eventsPlayedThisTurn())).toBe(1);
    expect(read(out.state, side, charactersPlayedThisTurn())).toBe(0);
  });

  it.each(SIDES)("retains a genuinely created Event play after that physical Event ceases for %s", side => {
    const creator = { ...v.event0, id: syntheticId(0x100225), abilities: () => [event(createCard(v.event0.id))] };
    const local = createEngine(testCatalog([creator]));
    const b = boardState(local.catalog, { active: side, phase: "day", [side]: { hand: [creator.id], deck }, [opponent(side)]: { deck } });
    const made = local.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, answers());
    const ready = passUntil(local, made.state, state => state.stack.length === 0, answers()).state;
    const created = ready.sides[side].hand[0];
    expect(ready.instances[created]).toMatchObject({ printing: { kind: "card", cardId: v.event0.id }, status: { created: true } });
    const played = local.apply(ready, side, { kind: "play", card: created, from: "hand" }, answers());
    const done = passUntil(local, played.state, state => state.stack.length === 0, answers());
    expect([...played.events, ...done.events]).toContainEqual({ kind: "ceasedToExist", side, instance: created, from: "stack" });
    expect(done.state.instances[created]).toBeUndefined();
    expect(read(done.state, side, eventsPlayedThisTurn())).toBe(2);
    expect(read(done.state, side, charactersPlayedThisTurn())).toBe(0);
  });

  it.each(SIDES)("cancels an uncommitted prepared play without incrementing history for %s", side => {
    const b = setup(side, [H.copy.id], [v.vanilla0.id, v.vanilla1.id]);
    const fold = createFoldAdapter(engine), start = slice(b.state);
    const pending = applied(fold.reduce(start, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(pending)!;
    expect(read(prompt.display, side, playedThisTurn())).toBe(0);
    const cancelled = applied(fold.reduce(pending, { kind: "cancel", side, promptId: prompt.prompt.id }));
    for (const count of counts) expect(read(cancelled.committed, side, count())).toBe(0);
    expect(cancelled.committed.sides[side].hand).toContain(b.ids[side].hand[0]);
  });

  it.each(SIDES)("counts the actual hand-limit discard before next-turn reset for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "night", scoreToWin: 100,
      [side]: { hand: Array.from({ length: 13 }, () => v.vanilla0.id), deck }, [opponent(side)]: { deck } });
    b.state = { ...b.state, config: { ...b.state.config, handLimit: 10 } };
    const observed: number[] = [];
    engine.apply(b.state, side, { kind: "pass" }, answers(), (state, _step, events) => {
      if (events.some(event => event.kind === "discardBatch")) observed.push(read(state, side, discardedThisTurn()));
    });
    expect(observed).toContain(3);
  });

  it.each(SIDES)("counts actual discards and applies a live physical-source discount for %s", side => {
    const b = setup(side, [H.discard.id, v.vanilla0.id, H.sleep.id], [H.payer.id]);
    const sleeper = b.ids[side].hand[2];
    expect(costModifier(b.state, engine.catalog, sleeper, side).reduction).toBe(0);
    const one = play(b.state, side, b.ids[side].hand[0]).state;
    expect(read(one, side, discardedThisTurn())).toBe(1);
    expect(costModifier(one, engine.catalog, sleeper, side).reduction).toBe(3);
    const two = run(one, side, { kind: "activate", source: b.ids[side].back[0]!, ability: 0 }).state;
    expect(read(two, side, discardedThisTurn())).toBe(2);
    expect(read(two, side, playedThisTurn())).toBe(1);
  });

  it.each(SIDES)("counts created cessation and replaced discard without requiring current void membership for %s", side => {
    for (const flag of ["created", "reclaimed"] as const) {
      const b = setup(side, [H.discard.id, v.vanilla0.id]);
      const victim = b.ids[side].hand[1]; b.state.instances[victim].status[flag] = true;
      const out = play(b.state, side, b.ids[side].hand[0]);
      expect(read(out.state, side, discardedThisTurn())).toBe(1);
      expect(out.events.filter(event => event.kind === "discarded")).toHaveLength(1);
      expect(out.state.instances[victim]?.zone).toBe(flag === "created" ? undefined : "banished");
    }
  });

  it.each(SIDES)("counts each physical dissolve but materializes each current-zone member once for %s", side => {
    const b = setup(side, [H.kill.id, H.wake.id, H.kill.id, H.wake.id, H.fortune.id], [v.vanilla0.id, v.vanilla0.id]);
    const [kill1, wake1, kill2, wake2, fortune] = b.ids[side].hand;
    const victims = b.ids[side].back;
    let state = play(b.state, side, kill1).state;
    expect(read(state, side, dissolvedThisTurn())).toBe(2);
    expect(read(state, side, leftPlayThisTurn())).toBe(2);
    state = play(state, side, wake1).state;
    expect(state.sides[side].backRank.filter(id => id !== null)).toEqual([...victims].reverse());
    expect(read(state, side, materializedThisTurn())).toBe(2);
    state = play(state, side, kill2).state;
    expect(read(state, side, dissolvedThisTurn())).toBe(4);
    const before = state.sides[side].hand.length;
    state = play(state, side, fortune).state;
    expect(state.sides[side].hand.length).toBe(before - 1 + 4);
    state = play(state, side, wake2).state;
    expect(state.sides[side].backRank.filter(id => id !== null)).toEqual(victims);
    expect(read(state, side, materializedThisTurn())).toBe(4);
    expect(read(state, side, dissolvedThisTurn())).toBe(4);
  });

  it.each(SIDES)("reads abandoned physical membership and distinguishes other departures for %s", side => {
    const b = setup(side, [H.abandon.id, H.wakeAbandoned.id, H.leave.id], [v.vanilla0.id]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    expect(read(state, side, abandonedThisTurn())).toBe(1);
    expect(read(state, side, dissolvedThisTurn())).toBe(1);
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(state.instances[b.ids[side].back[0]!].zone).toBe("play");
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(read(state, side, leftPlayThisTurn())).toBe(2);
    expect(read(state, side, dissolvedThisTurn())).toBe(1);
    expect(read(state, side, abandonedThisTurn())).toBe(1);
  });

  it.each(SIDES)("counts an ordinary banishment as departure without dissolution for %s", side => {
    const b = setup(side, [H.banish.id], [v.vanilla0.id]);
    const out = play(b.state, side, b.ids[side].hand[0]).state;
    expect(out.instances[b.ids[side].back[0]!].zone).toBe("banished");
    expect(read(out, side, leftPlayThisTurn())).toBe(1);
    expect(read(out, side, dissolvedThisTurn())).toBe(0);
    expect(read(out, side, abandonedThisTurn())).toBe(0);
  });

  it.each(SIDES)("captures predeparture controller rather than the owner's void for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [H.gain.id, H.kill.id, H.wake.id], energy: 5, deck }, [opponent(side)]: { back: [v.vanilla0.id], deck } });
    const victim = b.ids[opponent(side)].back[0]!;
    const controlled = play(b.state, side, b.ids[side].hand[0]).state;
    expect(controlled.instances[victim].controller).toBe(side);
    const gone = play(controlled, side, b.ids[side].hand[1]).state;
    expect(gone.instances[victim].controller).toBe(opponent(side));
    expect(read(gone, side, dissolvedThisTurn())).toBe(1);
    expect(read(gone, opponent(side), dissolvedThisTurn())).toBe(0);
    expect(read(gone, side, leftPlayThisTurn())).toBe(1);
    const wake = play(gone, side, b.ids[side].hand[2]).state;
    expect(wake.instances[victim].zone).toBe("void");
  });

  it.each(SIDES)("requires the abandoning actor as well as current-zone holder for %s", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [H.gain.id, H.abandon.id, H.otherAbandoned.id, H.otherDissolved.id], deck },
      [opponent(side)]: { back: [v.vanilla0.id], deck } });
    const victim = b.ids[opponent(side)].back[0]!;
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    expect(read(state, side, abandonedThisTurn())).toBe(1);
    expect(read(state, opponent(side), abandonedThisTurn())).toBe(0);
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(state.instances[victim].zone).toBe("void");
    state = play(state, side, b.ids[side].hand[3]).state;
    expect(state.instances[victim].zone).toBe("play");
    expect(state.instances[victim].controller).toBe(side);
  });

  it.each(SIDES)("excludes prevented/replaced dissolutions while retaining reclaimed abandonment for %s", side => {
    const b = setup(side, [H.kill.id, H.abandon.id], [v.vanilla0.id]);
    const victim = b.ids[side].back[0]!; b.state.instances[victim].status.reclaimed = true;
    const killed = play(b.state, side, b.ids[side].hand[0]).state;
    expect(read(killed, side, dissolvedThisTurn())).toBe(0);
    expect(read(killed, side, leftPlayThisTurn())).toBe(1);
    const a = setup(side, [H.abandon.id], [v.vanilla0.id]);
    a.state.instances[a.ids[side].back[0]!].status.reclaimed = true;
    const abandoned = play(a.state, side, a.ids[side].hand[0]).state;
    expect(read(abandoned, side, abandonedThisTurn())).toBe(1);
    expect(read(abandoned, side, dissolvedThisTurn())).toBe(0);
    const veil = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [H.killAll.id], deck }, [opponent(side)]: { back: [H.veil.id], deck } });
    const stopped = play(veil.state, side, veil.ids[side].hand[0]).state;
    expect(read(stopped, opponent(side), leftPlayThisTurn())).toBe(0);
    expect(read(stopped, opponent(side), dissolvedThisTurn())).toBe(0);
  });

  it.each(SIDES)("retains repeated materializations and ceased figment-copy provenance for %s", side => {
    const b = setup(side, [v.vanilla0.id, H.again.id, H.copy.id, H.kill.id]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    state = play(state, side, b.ids[side].hand[2]).state;
    expect(read(state, side, materializedThisTurn())).toBe(3);
    expect(read(state, side, materializedThisTurn("you", true))).toBe(1);
    expect(read(state, side, materializedThisTurn("you", false))).toBe(2);
    const gone = play(state, side, b.ids[side].hand[3]).state;
    expect(read(gone, side, dissolvedThisTurn())).toBe(2);
    expect(read(gone, side, leftPlayThisTurn())).toBe(2);
    expect(read(gone, side, materializedThisTurn("you", true))).toBe(1);
    expect(engine.view(gone, opponent(side)).turnLog.materialized[side].filter(card => card.figment).map(card => card.instance)).toEqual([null]);
  });

  it.each(SIDES)("preserves counts and safe membership through save/view/hidden sampling for %s", side => {
    const b = setup(side, [H.kill.id, H.conceal.id], [v.vanilla0.id, v.vanilla0.id]);
    const dissolved = play(b.state, side, b.ids[side].hand[0]).state;
    const loaded = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(dissolved))));
    expect(loaded).not.toBeNull();
    expect(read(loaded!.slice.committed, side, dissolvedThisTurn())).toBe(2);
    expect(read(loaded!.slice.committed, side, eventsPlayedThisTurn())).toBe(1);
    expect(deserializeState(serializeState(dissolved))).toEqual(dissolved);
    expect(determinizationDivergences(engine, dissolved, decks(dissolved), battleSeed("history-public"), 0)).toEqual([]);
    const hidden = play(dissolved, side, b.ids[side].hand[1]).state;
    const view = engine.view(hidden, opponent(side));
    expect(view.turnLog.dissolved?.[side].map(card => card.instance)).toEqual([null, null]);
    expect(read(hidden, side, dissolvedThisTurn())).toBe(2);
    expect(determinizationDivergences(engine, hidden, decks(hidden), battleSeed("history-hidden"), 0)).toEqual([]);
    const sampled = engine.determinize(view, decks(hidden), () => 0.5);
    const hiddenIds = new Set([...sampled.sides[side].deck, ...sampled.sides[side].hand]);
    expect(sampled.turnLog.dissolved?.[side].some(card => hiddenIds.has(card.instance))).toBe(false);
    expect(read(sampled, side, dissolvedThisTurn())).toBe(2);
    expect(read(sampled, side, eventsPlayedThisTurn())).toBe(2);
  });

  it("loads legacy absent counts conservatively and rejects invalid own fields through public LOAD", () => {
    const b = setup("player", [v.vanilla0.id]);
    const played = play(b.state, "player", b.ids.player.hand[0]).state;
    const old = deserializeState(serializeState(played));
    delete old.turnLog.discarded; delete old.turnLog.leftPlay; delete old.turnLog.dissolved; delete old.turnLog.abandoned;
    for (const card of old.turnLog.materialized?.player ?? []) delete (card as { figment?: boolean }).figment;
    const restored = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(old))));
    expect(restored).not.toBeNull();
    expect(read(restored!.slice.committed, "player", materializedThisTurn())).toBe(1);
    expect(read(restored!.slice.committed, "player", materializedThisTurn("you", true))).toBe(0);
    expect(read(restored!.slice.committed, "player", materializedThisTurn("you", false))).toBe(0);
    expect(read(restored!.slice.committed, "player", dissolvedThisTurn())).toBe(0);
    for (const field of ["leftPlay", "dissolved", "abandoned"] as const) {
      const bad = JSON.parse(JSON.stringify(saved(played))) as ReturnType<typeof saved>;
      Object.assign(bad.slice.committed.turnLog, { [field]: { player: [{ instance: "not-instance", cardType: "character" }], enemy: [] } });
      expect(parseEngineBattleFold(bad)).toBeNull();
    }
    for (const invalid of [-1, 0.5, "1"]) {
      const bad = JSON.parse(JSON.stringify(saved(played))) as ReturnType<typeof saved>;
      Object.assign(bad.slice.committed.turnLog, { discarded: { player: invalid, enemy: 0 } });
      expect(parseEngineBattleFold(bad)).toBeNull();
    }
  });

  it.each(SIDES)("resets both sides' current history at a real next or extra turn for %s", side => {
    for (const extra of [false, true]) {
      const b = setup(side, [H.kill.id, ...(extra ? [H.extra.id] : [])], [v.vanilla0.id]);
      let state = play(b.state, side, b.ids[side].hand[0]).state;
      if (extra) state = play(state, side, b.ids[side].hand[1]).state;
      const turn = state.turn.turnNumber;
      for (let guard = 0; state.turn.turnNumber === turn && guard < 25; guard++) {
        const decision = engine.decision(state); if (decision === null) throw new Error("Missing next-turn decision");
        state = engine.apply(state, decision.side, { kind: "pass" }, answers()).state;
      }
      expect(state.turn.turnNumber).toBeGreaterThan(turn);
      expect(state.turn.active).toBe(extra ? side : opponent(side));
      for (const target of SIDES) for (const count of counts) expect(read(state, target, count())).toBe(0);
    }
  });

  it("preserves current counts at a suspended fold and settles once after LOAD/invalid/stale/wrong-side answers", () => {
    const b = setup("player", [H.pause.id, v.vanilla0.id, v.vanilla1.id], [v.vanilla0.id]);
    const fold = createFoldAdapter(engine);
    const cast = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: { kind: "play", card: b.ids.player.hand[0], from: "hand" } }));
    let pending = cast;
    if (fold.pending(pending) === null) pending = applied(fold.reduce(pending, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const discard = fold.pending(pending)!;
    pending = applied(fold.reduce(pending, { kind: "answer", side: "player", promptId: discard.prompt.id, value: [b.ids.player.hand[1]] }));
    const choice = fold.pending(pending)!;
    expect(read(choice.display, "player", discardedThisTurn())).toBe(1);
    expect(read(choice.display, "player", dissolvedThisTurn())).toBe(1);
    expect(read(pending.committed, "player", dissolvedThisTurn())).toBe(0);
    const envelope = { ...saved(pending.committed), slice: pending };
    const loaded = parseEngineBattleFold(JSON.parse(JSON.stringify(envelope)))!;
    expect(loaded).not.toBeNull();
    const frozen = JSON.stringify(loaded.slice);
    expect(fold.reduce(loaded.slice, { kind: "answer", side: "enemy", promptId: choice.prompt.id, value: true }).kind).toBe("bounced");
    expect(fold.reduce(loaded.slice, { kind: "answer", side: "player", promptId: discard.prompt.id, value: true }).kind).toBe("bounced");
    expect(fold.reduce(loaded.slice, { kind: "answer", side: "player", promptId: choice.prompt.id, value: [] }).kind).toBe("bounced");
    expect(fold.reduce(loaded.slice, { kind: "battleAction", side: "player", action: { kind: "pass" } }).kind).toBe("bounced");
    expect(JSON.stringify(loaded.slice)).toBe(frozen);
    const done = applied(fold.reduce(loaded.slice, { kind: "answer", side: "player", promptId: choice.prompt.id, value: true }));
    expect(read(done.committed, "player", discardedThisTurn())).toBe(1);
    expect(read(done.committed, "player", dissolvedThisTurn())).toBe(1);
    expect(done.committed.sides.player.hand).toHaveLength(2);
    expect(fold.reduce(done, { kind: "answer", side: "player", promptId: choice.prompt.id, value: true }).kind).toBe("bounced");
  });

  it("rolls back a failed resolving effect's occurrence writes, preserving original committed history", () => {
    const b = setup("player", [H.fail.id, v.vanilla0.id, v.vanilla1.id], [v.vanilla0.id]);
    const before = stateHash(b.state), fold = createFoldAdapter(engine);
    let pending = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: { kind: "play", card: b.ids.player.hand[0], from: "hand" } }));
    if (fold.pending(pending) === null) pending = applied(fold.reduce(pending, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const prompt = fold.pending(pending)!;
    const failed = fold.reduce(pending, { kind: "answer", side: "player", promptId: prompt.prompt.id, value: [b.ids.player.hand[1]] });
    expect(failed.kind).toBe("applied");
    if (failed.kind !== "applied") throw new Error("Expected engine failure");
    expect(failed.error).not.toBeNull();
    expect(read(failed.slice.committed, "player", eventsPlayedThisTurn())).toBe(read(pending.committed, "player", eventsPlayedThisTurn()));
    expect(read(failed.slice.committed, "player", discardedThisTurn())).toBe(0);
    expect(read(failed.slice.committed, "player", dissolvedThisTurn())).toBe(0);
    expect(stateHash(b.state)).toBe(before);
  });
});
