import { describe, expect, it } from "vitest";
import { characteristics } from "../../../continuous/characteristics";
import { createCopyInHand } from "../../../rules/copies";
import { addFloating } from "../../../rules/floating";
import { routeCosts, playRoutes, routePayable } from "../../../rules/timing";
import { gainControl, moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, SIDES } from "../../../state/ids";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { cards, definitions, E, Payments, play, sign, avatar, step, v, world } from "./offering-discard-support";

describe("offeringDiscardPayment functional", () => {
  it.each(SIDES)("offers %s two genuine idempotent alternatives while retaining the default banish", side => {
    for (const copies of [0, 1, 2]) for (const mode of [0, 1]) {
      const w = world(side, { back: [], dreamsigns: Array.from({ length: copies }, () => sign) });
      const [source, payer, sameUuid] = w.ids[side].hand;
      const answers = new Payments(1, mode);
      const result = play(w.state, source, answers);
      expect(payer).not.toBe(sameUuid);
      expect(w.state.instances[payer].printing).toEqual(w.state.instances[sameUuid].printing);
      const choice = answers.prompts.find(p => p.purpose.role === "chooseCost");
      if (copies === 0) expect(choice).toBeUndefined();
      else expect(choice).toMatchObject({ kind: "chooseMode", costOptions: [[{ cost: "banishFromHand", count: 1 }], [{ cost: "discard", count: 1, filter: {} }]], options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
      const discard = copies > 0 && mode === 1;
      expect(result.state.instances[payer].zone).toBe(discard ? "void" : "banished");
      expect(result.state.instances[sameUuid].zone).toBe("hand");
      expect(result.events.filter(e => e.kind === "discarded")).toHaveLength(discard ? 1 : 0);
      expect(result.state.instances[source].status).toMatchObject({ offering: true });
      expect(result.state.stack[0]).toMatchObject({ x: 0 });
      expect(result.state.sides[side].currentEnergy).toBe(9);
      expect(invariantViolations(result.state, E.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("binds %s live permission to controller, functional zone, condition and emblems", side => {
    for (const [definition, zone, expected] of [[cards.holder, "back", true], [cards.holder, "hand", false], [cards.holder, "void", false], [definitions.hand, "hand", true]] as const) {
      const w = world(side, { back: [], [zone]: zone === "hand" ? [cards.offered.id, v.event0.id, definition.id] : [definition.id] });
      expect(characteristics(w.state, E.catalog).offeringDiscardPaymentAllowed(side)).toBe(expected);
      expect(characteristics(w.state, E.catalog).offeringDiscardPaymentAllowed(opponent(side))).toBe(false);
    }
    for (const condition of [false, true]) {
      const w = world(side, { back: [definitions.conditional.id], void: condition ? [v.event0.id] : [] });
      expect(characteristics(w.state, E.catalog).offeringDiscardPaymentAllowed(side)).toBe(condition);
    }
    for (const emblem of [{ avatar }, { dreamsigns: [sign] }]) {
      const w = world(side, { back: [], ...emblem });
      expect(play(w.state, w.ids[side].hand[0]).state.instances[w.ids[side].hand[1]].zone).toBe("void");
    }
    const w = world(side, { back: [] }, { back: [cards.holder.id] });
    gainControl(new Context(w.state, E.catalog, NO_PROMPTS), w.ids[opponent(side)].back[0]!, side);
    expect(characteristics(w.state, E.catalog).offeringDiscardPaymentAllowed(side)).toBe(true);
    expect(characteristics(w.state, E.catalog).offeringDiscardPaymentAllowed(opponent(side))).toBe(false);
  });

  it.each(SIDES)("uses %s held hand rather than original ownership and replaces created discard", side => {
    const other = opponent(side);
    const w = world(side, { hand: [] }, { hand: [cards.offered.id, v.event0.id, v.event0.id] });
    const ctx = new Context(w.state, E.catalog, NO_PROMPTS);
    for (const id of w.ids[other].hand) moveToHand(ctx, id, side);
    const [source, payer] = w.ids[other].hand;
    const result = play(w.state, source);
    expect(result.state.instances[payer]).toMatchObject({ owner: other, zone: "void" });
    expect(result.state.sides[other].void).toContain(payer);
    expect(result.state.instances[source]).toMatchObject({ controller: side, owner: other, status: { offering: true } });
    const created = world(side);
    const copy = createCopyInHand(new Context(created.state, E.catalog, NO_PROMPTS), created.ids[side].hand[1], side, true)!;
    const paid = play(created.state, created.ids[side].hand[0], new Payments(1, 1, false, [copy]));
    expect(paid.state.instances[copy]).toBeUndefined();
    expect(paid.events).toContainEqual({ kind: "discarded", side, instance: copy });
    expect(paid.events.some(e => e.kind === "ceasedToExist" && e.instance === copy)).toBe(true);
  });

  it.each(SIDES)("preserves %s aggregate X, tax, additional mandatory and optional costs", side => {
    for (const mode of [0, 1]) for (const optional of [false, true]) {
      const w = world(side, { hand: [definitions.costly.id, v.event0.id, v.event0.id, v.event0.id], back: [cards.holder.id, definitions.tax.id], score: 5 });
      const answers = new Payments(1, mode, optional);
      const result = play(w.state, w.ids[side].hand[0], answers);
      expect(result.state.sides[side].currentEnergy).toBe(6 - Number(optional));
      expect(result.state.sides[side].score).toBe(4);
      expect(result.state.instances[w.ids[side].hand[0]].status).toMatchObject({ offering: true });
      expect(result.state.instances[w.ids[side].hand[1]].zone).toBe(mode === 0 ? "banished" : "void");
      expect(result.state.instances[w.ids[side].hand[2]].zone).toBe("void");
      expect(result.state.instances[w.ids[side].hand[3]].zone).toBe("hand");
      expect(result.state.stack[0]).toMatchObject({ x: 0, optionalPaid: [optional] });
      const cardPrompts = answers.prompts.filter(p => p.kind === "chooseCards");
      expect(cardPrompts).toHaveLength(2);
      expect(cardPrompts[0].candidates).not.toContain(w.ids[side].hand[0]);
      expect(cardPrompts[1].candidates).not.toContain(w.ids[side].hand[1]);
    }
    const short = world(side, { hand: [definitions.costly.id, v.event0.id], score: 0 });
    const before = stateHash(short.state);
    expect(() => play(short.state, short.ids[side].hand[0])).toThrow();
    expect(stateHash(short.state)).toBe(before);
    const onlySelf = world(side, { hand: [cards.offered.id] });
    expect(routePayable(onlySelf.state, E.catalog, side, onlySelf.ids[side].hand[0], "offering")).toBe(false);
  });

  it.each(SIDES)("retains %s Offering after the permission source pays an additional cost, and cleans it up", side => {
    for (const mode of [0, 1]) {
      const w = world(side, { hand: [definitions.abandon.id, v.event0.id, v.event0.id], back: [cards.holder.id, v.vanilla1.id] });
      const offered = w.ids[side].hand[0];
      const played = play(w.state, offered, new Payments(1, mode));
      expect(played.state.instances[w.ids[side].back[0]!].zone).toBe("void");
      expect(characteristics(played.state, E.catalog).offeringDiscardPaymentAllowed(side)).toBe(false);
      const resolved = step(played.state, { kind: "resolveTop" }).state;
      expect(resolved.instances[offered].status.offering).toBe(true);
      const returned = new Context(resolved, E.catalog, NO_PROMPTS);
      moveToHand(returned, offered, side);
      const replayed = play(resolved, offered, new Payments(0)).state;
      expect(replayed.instances[offered].status.offering).toBe(true);
      const board = step(replayed, { kind: "resolveTop" }).state;
      const ended = step({ ...board, turn: { ...board.turn, phase: "challenge", challengeLane: null } }, { kind: "advancePhase" });
      expect(ended.state.instances[offered].zone).toBe("banished");
    }
  });

  it.each(SIDES)("keeps %s ordinary hand, void/Reclaim and arbitrary banish routes independent", side => {
    const w = world(side);
    const answers = new Payments(0);
    const normal = play(w.state, w.ids[side].hand[0], answers);
    expect(answers.prompts.some(p => p.purpose.role === "chooseCost")).toBe(false);
    expect(normal.state.sides[side].currentEnergy).toBe(7);
    expect(normal.state.instances[w.ids[side].hand[0]].status.offering).toBe(false);
    expect(normal.state.sides[side].hand).toContain(w.ids[side].hand[1]);
    const voidWorld = world(side, { void: [definitions.void.id] });
    const source = voidWorld.ids[side].void[0];
    expect(playRoutes(voidWorld.state, E.catalog, source, "void")).toEqual(["permission", "reclaim"]);
    for (const route of [0, 1]) {
      const answer = new Payments(route);
      const result = step(voidWorld.state, { kind: "play", card: source, from: "void" }, answer);
      expect(answer.prompts.some(p => p.purpose.role === "chooseCost")).toBe(false);
      expect(result.state.instances[source].status.offering).toBe(false);
      expect(result.state.sides[side].currentEnergy).toBe(route === 0 ? 10 : 8);
    }
    const unrelated = world(side, { back: [cards.holder.id, definitions.banisher.id] });
    const payer = unrelated.ids[side].hand[0];
    const activated = step(unrelated.state, { kind: "activate", source: unrelated.ids[side].back[1]!, ability: 0 }, new Payments());
    expect(activated.state.instances[payer].zone).toBe("banished");
    expect(activated.events.some(e => e.kind === "discarded")).toBe(false);
    expect(routeCosts(w.state, E.catalog, w.ids[side].hand[0], "hand")).toEqual([...cards.offered.costs, { cost: "energy", amount: 1 }]);
  });

  it("stops the permission after source departure or ability loss, without granting the keyword", () => {
    const w = world("player");
    const returned = step(w.state, { kind: "activate", source: w.ids.player.back[0]!, ability: 1 }).state;
    const resolved = step(returned, { kind: "resolveTop" }).state;
    expect(characteristics(resolved, E.catalog).offeringDiscardPaymentAllowed("player")).toBe(false);
    const lose = world("player");
    addFloating(new Context(lose.state, E.catalog, NO_PROMPTS), { source: lose.ids.player.back[0]!, controller: "player", expiry: { at: "never" }, change: { kind: "loseAbilities", instance: lose.ids.player.back[0]! } });
    expect(characteristics(lose.state, E.catalog).offeringDiscardPaymentAllowed("player")).toBe(false);
    expect(playRoutes(w.state, E.catalog, w.ids.player.hand[1], "hand")).toEqual(["hand"]);
  });
});
