import { createEngine } from "../../../engine";
import { testCatalog, syntheticId } from "../../../testing/synthetic-cards";
import { STACK } from "../../../testing/stack-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { event } from "../../../dsl/builders";
import { erode } from "../erode";
import { describe, expect, it } from "vitest";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { resolveEffect } from "../../interpreter";
import { instanceOrigin } from "../../../rules/activation";
import { gainControl } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { eventSeenBy } from "../../../events";
import { lookAtTopBanish, putLinkedBanishedInHand } from "../linked-banish";
import { F, engine, picking, play, setup, five } from "./linked-banish-support";

describe("linkedBanish", () => {
  it.each(["player", "enemy"] as const)("%s chooses a non-top card publicly, retains the rest privately in order, and takes without drawing", (side) => {
    const other = side === "player" ? "enemy" : "player";
    const { state, ids } = setup(side === "player" ? { hand: [F.pair.id, F.kill.id] } : {}, side === "enemy" ? { hand: [F.pair.id], deck: five } : {});
    state.turn.active = side;
    const entered = play(state, ids[side].hand[0], picking, side);
    const chosen = ids[side].deck[3];
    expect(entered.state.sides[side].banished).toEqual([chosen]);
    expect(entered.state.sides[side].deck).toEqual(ids[side].deck.filter((id) => id !== chosen));
    expect(entered.state.turnLog.drawn[side]).toBe(0);
    expect(entered.events.some((event) => event.kind === "cardDrawn")).toBe(false);
    const look = entered.events.find((event) => event.kind === "lookedAtTop")!;
    expect(eventSeenBy(look, other, entered.state)).toMatchObject({ cards: [null, null, null, chosen] });
    expect(ids[side].deck.slice(0, 3).every((id) => !engine.view(entered.state, other).instances[id])).toBe(true);
    const ctx = new Context(cloneState(entered.state), engine.catalog, NO_PROMPTS);
    const source = ids[side].hand[0];
    // Actual zone departure and matcher queue, with the enemy/source recipient checked too.
    const { dissolve } = requireZones;
    dissolve(ctx, source, null);
    const { resolveQueuedTrigger } = requireTriggers;
    resolveQueuedTrigger(ctx, ctx.state.triggerQueue.shift()!);
    expect(ctx.state.sides[side].hand).toContain(chosen);
    expect(ctx.state.sides[other].hand).not.toContain(chosen);
    expect(ctx.events.filter((event) => event.kind === "cardTaken")).toEqual([expect.objectContaining({ instance: chosen, side, from: "banished" })]);
    expect(ctx.events.some((event) => event.kind === "cardDrawn")).toBe(false);
  });

  it("forgets an opponent's ambiguous known position inside the selection window and retains a known tail", () => {
    const { state, ids } = setup({ hand: [F.pair.id] });
    state.knownTo.enemy = [ids.player.deck[1], ids.player.deck[4]];
    const done = play(state, ids.player.hand[0], picking);
    const seen = engine.view(done.state, "enemy");
    expect(seen.instances[ids.player.deck[1]]).toBeUndefined();
    expect(seen.instances[ids.player.deck[4]]).toBeDefined();
    expect(done.state.sides.player.deck.indexOf(ids.player.deck[4])).toBe(3);
  });

  it("looks at the resolution-time deck after an Interrupt, and creates no linkage when prevented", () => {
    const erosion = { ...F.kill, id: syntheticId(0xb48630), speed: "interrupt" as const,
      abilities: () => [event(erode(1, "opponent"))], synthetic: undefined };
    const responding = createEngine(testCatalog([...Object.values(F), erosion, STACK.preventCharacterToDeck]));
    for (const response of [erosion, STACK.preventCharacterToDeck]) {
      const { state, ids } = requireBoard.boardState(responding.catalog, { active: "player", phase: "day", player: { hand: [F.pair.id], deck: five },
        enemy: { hand: [response.id], energy: 8, deck: five } });
      const announced = responding.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, picking);
      expect(announced.events.some((event) => event.kind === "lookedAtTop")).toBe(false);
      const interrupted = responding.apply(announced.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, picking);
      const done = passUntil(responding, interrupted.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0, picking);
      if (response === erosion) {
        expect([...interrupted.events, ...done.events].filter((event) => event.kind === "lookedAtTop")).toEqual([expect.objectContaining({ cards: ids.player.deck.slice(1) })]);
        expect(done.state.sides.player.banished).toEqual([ids.player.deck[4]]);
      } else {
        expect([...interrupted.events, ...done.events].some((event) => event.kind === "lookedAtTop")).toBe(false);
        expect(done.state.linkedBanished).toBeUndefined();
      }
    }
  });

  it("gives a created copy its own link without consuming its original's member", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.createAndKill.id] });
    const first = play(state, ids.player.hand[0], picking);
    const done = play(first.state, ids.player.hand[1], picking);
    expect(done.state.sides.player.banished).toEqual([ids.player.deck[3]]);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[4]]);
  });

  it("a reclaimed source's replacement banishment does not fire its Dissolved consumer", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.kill.id] });
    const first = play(state, ids.player.hand[0], picking);
    first.state.instances[ids.player.hand[0]].status.reclaimed = true;
    const done = play(first.state, ids.player.hand[1]);
    expect(done.state.sides.player.banished).toContain(ids.player.deck[3]);
    expect(done.state.sides.player.banished).toContain(ids.player.hand[0]);
    expect(done.events.some((event) => event.kind === "dissolved" || event.kind === "cardTaken")).toBe(false);
  });

  it.each([0, 1, 2, 3])("looks at a %i-card deck without Fatigue or extra candidates", (count) => {
    const { state, ids } = setup({ hand: [F.pair.id], deck: five.slice(0, count) });
    const done = play(state, ids.player.hand[0], picking);
    expect(done.state.sides.player.deck).toHaveLength(Math.max(0, count - 1));
    expect(done.state.sides.player.banished).toHaveLength(count === 0 ? 0 : 1);
    expect(done.state.sides.player.fatigueCount).toBe(0);
    expect(done.events.filter((event) => event.kind === "lookedAtTop")).toHaveLength(count === 0 ? 0 : 1);
  });

  it("appends repeated producer results, takes every linked card, and excludes a later Banished visit", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.repeat.id, F.invalidate.id, F.kill.id] });
    const first = play(state, ids.player.hand[0], picking);
    const repeated = play(first.state, ids.player.hand[1], picking);
    const firstCard = ids.player.deck[3], secondCard = ids.player.deck[4];
    expect(repeated.state.sides.player.banished).toEqual([secondCard, firstCard]);
    const invalidated = play(repeated.state, ids.player.hand[2]);
    const done = play(invalidated.state, ids.player.hand[3]);
    expect(done.state.sides.player.hand).toContain(firstCard);
    expect(done.state.sides.player.banished).toContain(secondCard);
    expect(done.events.filter((event) => event.kind === "cardTaken").map((event) => event.instance)).toEqual([firstCard]);
  });

  it("puts every repeated member into hand in producer order", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.repeat.id, F.kill.id] });
    const first = play(state, ids.player.hand[0], picking);
    const repeated = play(first.state, ids.player.hand[1], picking);
    const done = play(repeated.state, ids.player.hand[2]);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3], ids.player.deck[4]]);
  });

  it("starts fresh on source reentry, preserving the prior unreturned card", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.blink.id, F.kill.id] });
    const first = play(state, ids.player.hand[0], picking);
    const reentered = play(first.state, ids.player.hand[1], picking);
    const done = play(reentered.state, ids.player.hand[2]);
    expect(done.state.sides.player.banished).toContain(ids.player.deck[3]);
    expect(done.state.sides.player.hand).toContain(ids.player.deck[4]);
    expect(done.state.sides.player.hand).not.toContain(ids.player.deck[3]);
  });

  it("lets a producer queued before departure populate the old object that the FIFO consumer reads", () => {
    const { state, ids } = setup({ void: [F.pair.id], hand: [F.enterAndKill.id] });
    const done = play(state, ids.player.hand[0], picking);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3]]);
    expect(done.state.sides.player.banished).toEqual([]);
    expect(done.state.instances[ids.player.void[0]]?.zone).toBe("void");
  });

  it("a queued old consumer retrieves its own link before the reentered object's producer resolves", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.reenterBeforeReturn.id, F.kill.id] });
    const first = play(state, ids.player.hand[0], picking);
    const reentered = play(first.state, ids.player.hand[1], picking);
    expect(reentered.state.sides.player.hand).toContain(ids.player.deck[3]);
    expect(reentered.state.sides.player.banished).toContain(ids.player.deck[4]);
    const done = play(reentered.state, ids.player.hand[2]);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3], ids.player.deck[4]]);
  });

  it("keeps a ceased created source's owed producer and consumer, with independent empty copy linkage", () => {
    const { state, ids } = setup({ hand: [F.createAndKill.id] });
    const done = play(state, ids.player.hand[0], picking);
    expect(done.events.some((event) => event.kind === "ceasedToExist")).toBe(true);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3]]);
    expect(done.state.sides.player.banished).toEqual([]);
  });

  it("returns the original member to the stolen source's last controller", () => {
    const { state, ids } = setup({ hand: [F.pair.id] });
    const first = play(state, ids.player.hand[0], picking);
    const ctx = new Context(first.state, engine.catalog, NO_PROMPTS);
    expect(gainControl(ctx, ids.player.hand[0], "enemy")).toBe(true);
    requireZones.dissolve(ctx, ids.player.hand[0], null);
    requireTriggers.resolveQueuedTrigger(ctx, ctx.state.triggerQueue.shift()!);
    expect(ctx.state.sides.enemy.hand).toContain(ids.player.deck[3]);
    expect(ctx.state.instances[ids.player.deck[3]].owner).toBe("player");
  });

  it("keeps two acquired copies independent after an earlier group expires and another is acquired", () => {
    const { state, ids } = setup({ back: [F.plain.id], hand: [F.gain.id, F.gain.id, F.repeat.id, F.expireFirst.id, F.gain.id, F.repeat.id, F.kill.id] });
    let current = state;
    for (const index of [0, 1, 2, 3, 4, 5]) current = play(current, ids.player.hand[index], picking).state;
    const done = play(current, ids.player.hand[6]);
    // The first acquired pair's member remains Banished. The second pair survives index shifting,
    // while the newly acquired pair receives its own later member.
    expect(done.state.sides.player.banished).toEqual([ids.player.deck[3]]);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[4], ids.player.deck[2], ids.player.deck[1]]);
  });

  it("returns a created copy's acquired-pair member to hand when the copy dissolves and ceases to exist", () => {
    const { state, ids } = setup({ hand: [F.createGained.id, F.repeat.id, F.kill.id] });
    let current = state;
    for (const index of [0, 1]) current = play(current, ids.player.hand[index], picking).state;
    expect(current.sides.player.banished).toEqual([ids.player.deck[3]]);
    const done = play(current, ids.player.hand[2]);
    expect(done.events.some((event) => event.kind === "ceasedToExist")).toBe(true);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3]]);
    expect(done.state.sides.player.banished).toEqual([]);
  });

  it("resolves a created copy's acquired producer and consumer both queued before it ceases to exist", () => {
    const { state, ids } = setup({ hand: [F.createGainedLookAndKill.id] });
    const done = play(state, ids.player.hand[0], picking);
    expect(done.events.some((event) => event.kind === "ceasedToExist")).toBe(true);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3]]);
    expect(done.state.sides.player.banished).toEqual([]);
  });

  it("links a reentered source's newly acquired pair to the new object, not the departed one", () => {
    const { state, ids } = setup({ back: [F.plain.id], hand: [F.gain.id, F.repeat.id, F.reenterGainedLook.id, F.kill.id] });
    let current = state;
    for (const index of [0, 1]) current = play(current, ids.player.hand[index], picking).state;
    const reentered = play(current, ids.player.hand[2], picking).state;
    expect(reentered.sides.player.hand).toContain(ids.player.deck[3]);
    expect(reentered.sides.player.banished).toEqual([ids.player.deck[4]]);
    const done = play(reentered, ids.player.hand[3]);
    expect(done.state.sides.player.hand).toEqual([ids.player.deck[3], ids.player.deck[4]]);
    expect(done.state.sides.player.banished).toEqual([]);
  });

  it("keeps a created copy's acquired-pair look private and its public link visible only while the copy exists", () => {
    const { state, ids } = setup({ hand: [F.createGained.id, F.repeat.id, F.kill.id] });
    const gained = play(state, ids.player.hand[0], picking).state;
    const looked = play(gained, ids.player.hand[1], picking);
    const chosen = ids.player.deck[3];
    const look = looked.events.find((event) => event.kind === "lookedAtTop")!;
    expect(eventSeenBy(look, "enemy", looked.state)).toMatchObject({ cards: [null, null, null, chosen] });
    for (const side of ["player", "enemy"] as const) {
      expect(engine.view(looked.state, side).linkedBanished?.flatMap((record) => record.cards.map((card) => card.instance))).toEqual([chosen]);
    }
    const done = play(looked.state, ids.player.hand[2]);
    for (const side of ["player", "enemy"] as const) expect(engine.view(done.state, side).linkedBanished).toEqual([]);
    for (const state of [looked.state, done.state]) {
      expect(ids.player.deck.slice(0, 3).every((id) => !engine.view(state, "enemy").instances[id])).toBe(true);
    }
  });

  it("rejects a consumer offset outside an earlier ability, and requires a source object", () => {
    for (const value of [0, 1, -0.5, Number.NaN]) expect(() => putLinkedBanishedInHand(value)).toThrow();
    const { state, ids } = setup({ hand: [F.plain.id] });
    const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    expect(() => resolveEffect(ctx, lookAtTopBanish(4), { source: ids.player.hand[0], origin: instanceOrigin(state.instances[ids.player.hand[0]]), ability: 0, controller: "player", x: null, optionalPaid: [], choices: { modes: [], targets: [] } })).toThrow();
  });
});

import * as requireZones from "../../../rules/zones";
import * as requireTriggers from "../../../triggers/resolve";

import * as requireBoard from "../../../testing/board";
