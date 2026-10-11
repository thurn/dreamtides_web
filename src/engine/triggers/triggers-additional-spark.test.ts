/**
 * Additional spark (C17): "when a character gains ✦, it gains N additional
 * ✦" and the gains it follows.
 */
import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../events";
import { effectiveSpark } from "../rules/spark";
import { deserializeState, stateHash } from "../state/hash";
import type { AbilitySource } from "../state/ids";
import type { BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { DSL } from "../testing/dsl-cards";
import { TRIGGER_DREAMSIGN } from "../testing/trigger-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { v, t, deck, L, BOUNCE_GAINER_SIGN, BOUNCE_SMALL_SIGN, STEAL_SIGN, C, engine, board, play, queuedCount } from "./triggers.fixtures";

describe("additional spark (C17)", () => {
  const gains = (events: readonly EngineEvent[]) => events.flatMap((entry) => (entry.kind === "sparkGained" ? [entry] : []));

  it("adds 1✦ to each permanent gain once per source, stacking two sources without retriggering", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpPermanently.id], dreamsigns: [TRIGGER_DREAMSIGN.additionalSpark.id], energy: 1, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const sign: AbilitySource = { kind: "dreamsign", side: "player", index: 0 };
    const result = play(state, "player", ids.player.hand[0], [[ally]]);
    expect(result.state.instances[ally]?.status.gainedSpark).toBe(3);
    expect(gains(result.events).map((entry) => [entry.instance, entry.amount, entry.expiry, entry.additional])).toEqual([
      [ally, 1, { at: "never" }, false],
      [ally, 1, { at: "never" }, true],
      [ally, 1, { at: "never" }, true],
    ]);
    const queued = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [[entry.source, entry.subject, entry.gain]] : []));
    expect(queued).toEqual([
      [sign, ally, { amount: 1, expiry: { at: "never" } }],
      [ids.player.back[0], ally, { amount: 1, expiry: { at: "never" } }],
    ]);
    expect(result.state.triggerQueue).toEqual([]);
  });

  it("triggers no 'when … gains ✦' ability with an additional gain", () => {
    const { state, ids } = board({ player: { back: [L.additionalOnce.id, L.gainWatcher.id, v.vanilla1.id], hand: [DSL.pumpPermanently.id], energy: 1, deck }, enemy: { deck } });
    const ally = ids.player.back[2]!;
    const result = play(state, "player", ids.player.hand[0], [[ally]]);
    expect(result.state.instances[ally]?.status.gainedSpark).toBe(2);
    expect(queuedCount(result.events, ids.player.back[1]!)).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(1);
  });

  it("gives each gain with a duration its additional ✦ with the same expiry, ending with it", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpUntilEndOfTurn.id], energy: 1, deck }, enemy: { deck } });
    const ally = ids.player.back[1]!;
    const pumped = play(state, "player", ids.player.hand[0], [[ally]]).state;
    expect(pumped.floating.map((effect) => [effect.change, effect.expiry])).toEqual([
      [{ kind: "spark", instance: ally, amount: 3 }, { at: "endOfTurn" }],
      [{ kind: "spark", instance: ally, amount: 1 }, { at: "endOfTurn" }],
    ]);
    expect(effectiveSpark(pumped, engine.catalog, ally)).toBe(5);
    const after = passUntil(engine, pumped, at(engine, "enemy", "day")).state;
    expect(after.floating).toEqual([]);
    expect(effectiveSpark(after, engine.catalog, ally)).toBe(1);
  });

  it("ends the additional ✦ of a 'while this is in play' gain as that gain's source leaves play", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla2.id], hand: [t.whilePresentPump.id, L.sweep.id], energy: 2, deck }, enemy: { deck } });
    const ally = ids.player.back[1]!;
    const source = ids.player.hand[0];
    const pumped = play(state, "player", source, [[ally]]).state;
    expect(pumped.floating.map((effect) => effect.expiry)).toEqual([
      { at: "sourceLeavesPlay", source },
      { at: "sourceLeavesPlay", source },
    ]);
    expect(effectiveSpark(pumped, engine.catalog, ally)).toBe(5);
    const swept = play(pumped, "player", ids.player.hand[1]).state;
    expect(swept.instances[source]?.zone).toBe("void");
    expect(swept.floating).toEqual([]);
    expect(effectiveSpark(swept, engine.catalog, ally)).toBe(2);
  });

  it("links the additional ✦ of an 'until the opponent pays' gain to the same payable effect", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [L.pumpUntilPays.id], deck }, enemy: { energy: 1, deck } });
    const ally = ids.player.back[1]!;
    let current = play(state, "player", ids.player.hand[0], [[ally]]).state;
    const [payable] = current.payable;
    expect(current.payable).toHaveLength(1);
    expect(current.floating.map((effect) => effect.expiry)).toEqual([
      { at: "paid", effect: payable.id },
      { at: "paid", effect: payable.id },
    ]);
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(3);
    current = passUntil(engine, current, at(engine, "enemy", "day")).state;
    current = engine.apply(current, "enemy", { kind: "payToEnd", effect: payable.id }, NO_PROMPTS).state;
    expect(current.floating).toEqual([]);
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(1);
  });

  it("does not trigger on spark a character has from anthems, Support, or a resolving 'have' effect", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id], front: [v.vanilla1.id], hand: [C.warriorAnthem.id, C.supporter.id, C.spiritBond.id], energy: 5, deck },
      enemy: { deck },
    });
    const events: EngineEvent[] = [];
    let current = state;
    for (const card of ids.player.hand) {
      const result = play(current, "player", card);
      events.push(...result.events);
      current = result.state;
    }
    expect(effectiveSpark(current, engine.catalog, ids.player.front[0]!)).toBeGreaterThan(1);
    expect(effectiveSpark(current, engine.catalog, ids.player.back[0]!)).toBeGreaterThan(2);
    expect(gains(events)).toEqual([]);
    expect(queuedCount(events, ids.player.back[0]!)).toBe(0);
  });

  it("does not trigger on a gain of +0✦ or −1✦", () => {
    const { state, ids } = board({ player: { back: [t.additionalSpark.id, v.vanilla2.id], hand: [L.gainZero.id, L.shrinkAlly.id], deck }, enemy: { deck } });
    const ally = ids.player.back[1]!;
    const zero = play(state, "player", ids.player.hand[0], [[ally]]);
    const shrunk = play(zero.state, "player", ids.player.hand[1], [[ally]]);
    expect(gains([...zero.events, ...shrunk.events]).map((entry) => entry.amount)).toEqual([0, -1]);
    expect(queuedCount([...zero.events, ...shrunk.events], ids.player.back[0]!)).toBe(0);
    expect(shrunk.state.instances[ally]?.status.gainedSpark).toBe(-1);
  });

  it("does nothing when the character leaves play before the trigger resolves, and keeps the original gain", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpPermanently.id], dreamsigns: [BOUNCE_GAINER_SIGN.id], energy: 1, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const result = play(state, "player", ids.player.hand[0], [[ally]]);
    expect(queuedCount(result.events, ids.player.back[0]!)).toBe(1);
    expect(result.state.instances[ally]?.zone).toBe("hand");
    expect(result.state.instances[ally]?.status.gainedSpark).toBe(1);
    expect(gains(result.events).filter((entry) => entry.additional)).toEqual([]);
  });

  it("does nothing when the gain's duration ends before the trigger resolves", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla2.id], hand: [t.whilePresentPump.id], dreamsigns: [BOUNCE_SMALL_SIGN.id], energy: 2, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const source = ids.player.hand[0];
    const result = play(state, "player", source, [[ally]]);
    expect(queuedCount(result.events, ids.player.back[0]!)).toBe(1);
    expect(result.state.instances[source]?.zone).toBe("hand");
    expect(result.state.floating).toEqual([]);
    expect(gains(result.events).filter((entry) => entry.additional)).toEqual([]);
    expect(effectiveSpark(result.state, engine.catalog, ally)).toBe(2);
  });

  it("still adds the additional ✦ when the character changes control before the trigger resolves", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [L.opponentPlaysPump.id, t.additionalSpark.id], deck },
      enemy: { hand: [v.event0.id], dreamsigns: [STEAL_SIGN.id], deck },
    });
    const pump = ids.player.back[0]!;
    const result = play(state, "enemy", ids.enemy.hand[0]);
    expect(result.state.instances[pump]?.controller).toBe("enemy");
    expect(result.state.instances[pump]?.status.gainedSpark).toBe(2);
    expect(gains(result.events).map((entry) => entry.additional)).toEqual([false, true]);
  });

  it("replays a queued additional-spark trigger identically after a reload, and shows its gain", () => {
    const { state, ids } = board({
      player: { back: [t.additionalSpark.id, v.vanilla1.id], hand: [DSL.pumpUntilEndOfTurn.id], dreamsigns: [TRIGGER_DREAMSIGN.additionalSpark.id], energy: 1, deck },
      enemy: { deck },
    });
    const ally = ids.player.back[1]!;
    const committed: BattleState[] = [];
    engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ally]]), (next) => {
      committed.push(next);
    });
    const queued = committed.find((next) => next.triggerQueue.length === 2);
    if (queued === undefined) throw new Error("no queued triggers observed");
    const gain = { amount: 3, expiry: { at: "endOfTurn" } };
    expect(queued.triggerQueue.map((trigger) => trigger.gain)).toEqual([gain, gain]);
    expect(engine.view(queued, "enemy").triggerQueue.map((trigger) => trigger.gain)).toEqual([gain, gain]);
    const reloaded = deserializeState(JSON.stringify(queued));
    const first = runStep(queued, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
    const again = runStep(reloaded, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
    if (first.kind !== "done" || again.kind !== "done") throw new Error("suspended");
    expect(stateHash(again.state)).toBe(stateHash(first.state));
    expect(again.state.floating).toEqual(first.state.floating);
  });

  it("throws, leaving the committed state alone, when an additional gain resolves outside a gain trigger", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [L.strayAdditional.id], deck }, enemy: { deck } });
    const before = stateHash(state);
    expect(() => play(state, "player", ids.player.hand[0], [[ids.player.back[0]!]])).toThrow();
    expect(stateHash(state)).toBe(before);
  });
});
