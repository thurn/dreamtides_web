import { describe, expect, it } from "vitest";
import { characteristics } from "../../../continuous/characteristics";
import { playPermission } from "../../../continuous/permissions";
import { createEngine } from "../../../engine";
import { everyIn, staticAbility } from "../../../dsl/builders";
import { playRoutes } from "../../../rules/timing";
import { cloneState } from "../../../state/clone";
import { boardState } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { syntheticId } from "../../../testing/synthetic-cards";
import { zoneCatalog } from "../../../testing/zone-cards";
import { playFromZone } from "../play-from-zone";
import { v } from "./cards-support";
import { activate, Answering, filler, fromVoid, PERMIT, zoneOf } from "./play-from-zone-support";
import { act, BANISH, engine, payers, placed, PREVENTER, resolveStack, SELF, voidPlays } from "./play-self-from-zone-support";

describe("playSelfFromZone", () => {
  it("lets its source alone be played from the void it owns, for its normal and additional costs, never banishing itself to pay", () => {
    const { state, ids } = placed({ void: [SELF.abomination.id, ...payers(BANISH), v.vanilla2.id], energy: 2 });
    const [abomination, ...others] = ids.player.void;
    expect(voidPlays(state)).toEqual([abomination]);
    expect(engine.legalActions(state, "player")).toContainEqual(fromVoid(abomination));
    for (const other of others) expect(playPermission(state, engine.catalog, other, "player")).toBeNull();

    const played = act(state, "player", fromVoid(abomination));
    expect(played.prompts).toHaveLength(1);
    expect(played.prompts[0]).toMatchObject({ kind: "chooseCards", purpose: { role: "banishCost" }, min: BANISH, max: BANISH });
    const [banishPrompt] = played.prompts;
    if (banishPrompt.kind !== "chooseCards") throw new Error("expected a card choice");
    expect([...banishPrompt.candidates].sort()).toEqual([...others].sort());
    expect(played.state.sides.player.currentEnergy).toBe(1);
    expect(played.state.sides.player.banished.sort()).toEqual(others.slice(0, BANISH).sort());
    expect(played.state.sides.player.void).toEqual([others[BANISH]]);
    const resolved = resolveStack(played.state);
    expect(resolved.instances[abomination]).toMatchObject({ zone: "play", status: { reclaimed: false, playedViaReclaim: false } });
    // A static permission stores nothing.
    expect(resolved.floating).toEqual([]);
  });

  it("is unplayable from the void without enough other void cards to banish, and covers nothing outside the void", () => {
    const short = placed({ void: [SELF.abomination.id, ...payers(BANISH - 1)], energy: 5 });
    expect(voidPlays(short.state)).toEqual([]);
    expect(() => act(short.state, "player", fromVoid(short.ids.player.void[0]))).toThrow();

    // In hand it is played from hand as any card is; it grants no void permission from there or from play.
    const held = placed({ hand: [SELF.abomination.id], back: [SELF.abomination.id], void: payers(BANISH), energy: 5 });
    expect(engine.legalActions(held.state, "player")).toContainEqual({ kind: "play", card: held.ids.player.hand[0], from: "hand" });
    expect(voidPlays(held.state)).toEqual([]);
    expect(characteristics(held.state, engine.catalog).changes(6)).toEqual([]);
    expect(engine.view(held.state, "player").staticPlayPermissions).toEqual([]);
  });

  it("goes where it normally would once it leaves play: dissolved to the void, not banished, and playable from there again", () => {
    const { state, ids } = placed({ void: [SELF.abomination.id, ...payers(2 * BANISH)], hand: [v.dissolveVictim.id], energy: 5 });
    const [abomination] = ids.player.void;
    const inPlay = resolveStack(act(state, "player", fromVoid(abomination)).state);
    expect(zoneOf(inPlay, abomination)).toBe("play");
    const dissolved = resolveStack(act(inPlay, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new Answering(() => [abomination])).state);
    expect(zoneOf(dissolved, abomination)).toBe("void");
    expect(dissolved.instances[abomination]?.status.reclaimed).toBe(false);
    expect(voidPlays(dissolved)).toEqual([abomination]);
    expect(zoneOf(resolveStack(act(dissolved, "player", fromVoid(abomination)).state), abomination)).toBe("play");
  });

  it("belongs to its owner: the opponent never plays it, and plays its own copy only on its own turn", () => {
    const { state, ids } = placed(
      { void: [SELF.abomination.id, ...payers(BANISH)], energy: 5 },
      { void: [SELF.abomination.id, ...payers(BANISH)], energy: 5 },
    );
    const [mine] = ids.player.void;
    const [theirs] = ids.enemy.void;
    expect(playPermission(state, engine.catalog, mine, "enemy")).toBeNull();
    expect(playPermission(state, engine.catalog, theirs, "player")).toBeNull();
    expect(playRoutes(state, engine.catalog, theirs, "void")).toEqual(["permission"]);
    expect(voidPlays(state, "player")).toEqual([mine]);
    expect(voidPlays(state, "enemy")).toEqual([]);
    const enemyTurn = placed({ void: [SELF.abomination.id, ...payers(BANISH)] }, { void: [SELF.abomination.id, ...payers(BANISH)], energy: 5 }, "enemy");
    expect(voidPlays(enemyTurn.state, "enemy")).toEqual([enemyTurn.ids.enemy.void[0]]);
    expect(voidPlays(enemyTurn.state, "player")).toEqual([]);
  });

  it("leaves the opponent's response window unchanged, and covers the card only while it is in the void, not on the stack", () => {
    const { state, ids } = placed({ void: [SELF.abomination.id, ...payers(BANISH)], energy: 5 }, { hand: [v.interruptEvent.id], energy: 5 });
    const [abomination] = ids.player.void;
    const played = act(state, "player", fromVoid(abomination)).state;
    expect(played.priority).toBe("enemy");
    expect(engine.legalActions(played, "enemy")).toContainEqual({ kind: "play", card: ids.enemy.hand[0], from: "hand" });
    expect(zoneOf(played, abomination)).toBe("stack");
    expect(playPermission(played, engine.catalog, abomination, "player")).toBeNull();
    expect(voidPlays(played, "enemy")).toEqual([]);
    expect(voidPlays(played, "player")).toEqual([]);
    expect(zoneOf(resolveStack(played), abomination)).toBe("play");
  });

  it("goes to the void unreclaimed when an opponent's interrupt prevents it, and is playable from there again", () => {
    const { state, ids } = placed({ void: [SELF.abomination.id, ...payers(2 * BANISH)], energy: 5 }, { hand: [PREVENTER.id], energy: 5 });
    const [abomination] = ids.player.void;
    const played = act(state, "player", fromVoid(abomination)).state;
    const interrupted = act(played, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, new Answering(() => [abomination])).state;
    const prevented = resolveStack(interrupted);
    expect(prevented.stack).toEqual([]);
    expect(zoneOf(prevented, abomination)).toBe("void");
    expect(prevented.sides.player.banished).toHaveLength(BANISH);
    expect(prevented.instances[abomination]?.status).toMatchObject({ reclaimed: false, playedViaReclaim: false });
    expect(voidPlays(prevented)).toEqual([abomination]);
    const replayed = act(prevented, "player", fromVoid(abomination));
    expect(replayed.state.sides.player.banished).toHaveLength(2 * BANISH);
    expect(replayed.state.sides.player.banished).not.toContain(abomination);
    expect(zoneOf(resolveStack(replayed.state), abomination)).toBe("play");
  });

  it("is a lasting permission: a one-play permission covering the card is not used up, and Reclaim stays a second route", () => {
    const { state, ids } = placed({ back: [PERMIT.technician.id], void: [SELF.reclaimable.id, ...payers(2 * BANISH)], energy: 5 });
    const [card] = ids.player.void;
    const granted = resolveStack(act(state, "player", activate(ids.player.back[0])).state);
    expect(granted.floating).toHaveLength(1);
    expect(playPermission(granted, engine.catalog, card, "player")).toEqual({ consumes: null });
    expect(playRoutes(granted, engine.catalog, card, "void")).toEqual(["permission", "reclaim"]);

    const permitted = act(granted, "player", fromVoid(card), new Answering((candidates) => candidates.slice(0, BANISH), 0));
    expect(permitted.prompts[0]).toMatchObject({ kind: "chooseMode", purpose: { role: "voidRoute" } });
    expect(permitted.state.floating).toEqual(granted.floating);
    expect(permitted.state.sides.player.currentEnergy).toBe(4);
    expect(permitted.state.instances[card]?.status.reclaimed).toBe(false);

    // By Reclaim: its reclaim cost replaces the energy cost, the additional cost still applies, and it is reclaimed.
    const reclaimed = act(granted, "player", fromVoid(card), new Answering((candidates) => candidates.slice(0, BANISH), 1)).state;
    expect(reclaimed.sides.player.currentEnergy).toBe(5);
    expect(reclaimed.sides.player.banished).toHaveLength(BANISH);
    expect(reclaimed.instances[card]?.status).toMatchObject({ reclaimed: true, playedViaReclaim: true });
  });

  it("shows the permission to both players on the card in the void, and nothing while the card is hidden", () => {
    const { state, ids } = placed({ void: [SELF.abomination.id], energy: 5 }, { hand: [SELF.abomination.id, v.vanilla1.id] });
    const [abomination] = ids.player.void;
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(state, viewer).staticPlayPermissions).toEqual([{ kind: "playFrom", player: "player", zone: "void", instance: abomination, filter: {}, next: false }]);
    }
    // The enemy's copy in hand works from the void only: the player's view is the same whichever hidden card it is.
    const visible = engine.view(state, "player");
    expect(JSON.stringify(visible)).not.toContain(`"${ids.enemy.hand[0]}"`);
    const swapped = cloneState(state);
    swapped.sides.enemy.hand.reverse();
    expect(comparableView(engine.view(swapped, "player"))).toEqual(comparableView(visible));
  });

  it("names its own source only: a static permission naming other void cards is rejected", () => {
    const naming = { ...SELF.abomination, id: syntheticId(0x7c4f), abilities: () => [staticAbility(playFromZone("void", {}, { cards: everyIn("void") }), { zone: "void" })] };
    const broken = createEngine(zoneCatalog([naming]));
    const { state } = boardState(broken.catalog, { active: "player", phase: "day", player: { deck: filler, void: [naming.id, v.vanilla1.id] }, enemy: { deck: filler } });
    expect(() => characteristics(state, broken.catalog).changes(6)).toThrow(/own source/);
  });
});
