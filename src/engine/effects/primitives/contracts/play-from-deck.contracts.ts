import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { energy, keyword, staticAbility } from "../../../dsl/builders";
import { boardState } from "../../../testing/board";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { BACK_RANK_SIZE } from "../../../state/ids";
import { Context } from "../../../steps/context";
import { addFloating } from "../../../rules/floating";
import { NO_PROMPTS } from "../../../steps/sources";
import { playPermission } from "../../../continuous/permissions";
import { cloneState } from "../../../state/clone";
import { canPlay, playRoutes } from "../../../rules/timing";
import { revealToBoth } from "../../../view/knowledge";
import { ScriptedSource } from "../../../steps/sources";
import { playFromZone } from "../play-from-zone";
import { DECK_TOP, engine, placed, resolve, v } from "./deck-top-support";

describe("playFromZone deck", () => {
  it("requires an identified matching current top owned by its player, before filter evaluation", () => {
    const { state, ids } = placed({ player: { back: [DECK_TOP.permit.id], deck: [v.vanilla1.id, v.vanilla2.id], energy: 5 } });
    const [top, deeper] = ids.player.deck;
    expect(playPermission(state, engine.catalog, top, "player")).toBeNull();
    expect(engine.legalActions(state, "player").filter((action) => action.kind === "play" && action.from === "deck")).toEqual([]);
    const known = cloneState(state);
    revealToBoth(known, [top, deeper]);
    expect(playPermission(known, engine.catalog, top, "player")).toEqual({ consumes: null });
    expect(playPermission(state, engine.catalog, deeper, "player")).toBeNull();
    expect(playPermission(state, engine.catalog, top, "enemy")).toBeNull();
    const wrongOwner = cloneState(known); wrongOwner.instances[top] = { ...wrongOwner.instances[top], owner: "enemy" };
    expect(playPermission(wrongOwner, engine.catalog, top, "player")).toBeNull();
    expect(canPlay(wrongOwner, engine.catalog, "player", top, "deck")).toBe(false);
    expect(() => playFromZone("deck", {}, { cards: { kind: "subject" } })).toThrow();
  });

  it("pays normal and additional costs, moves to the stack, and reveals its replacement only after cardPlayed", () => {
    const { state, ids } = placed();
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.deck[0], from: "deck" }, new ScriptedSource([[ids.player.hand[0]]]));
    expect(result.state.sides.player.currentEnergy).toBe(7);
    expect(result.state.instances[ids.player.hand[0]].zone).toBe("void");
    expect(result.events.findIndex((event) => event.kind === "cardPlayed")).toBeLessThan(result.events.findIndex((event) => event.kind === "revealed"));
    expect(result.state.instances[ids.player.deck[0]].status.playedViaReclaim).toBe(false);
    expect(result.state.instances[ids.player.deck[0]].status.offering).toBe(false);
    expect(resolve(result.state).state.instances[ids.player.deck[0]].zone).toBe("play");
  });

  it("keeps permission independent from an inactive reveal, and cannot play the next unknown top", () => {
    const { state, ids } = placed({ player: { back: [DECK_TOP.keeper.id], deck: [v.vanilla1.id, v.vanilla2.id], energy: 5 } });
    revealToBoth(state, [ids.player.deck[0]]);
    const result = engine.apply(state, "player", { kind: "play", from: "deck", card: ids.player.deck[0] }, new ScriptedSource([]));
    expect(result.events.some((event) => event.kind === "revealed")).toBe(false);
    expect(playPermission(result.state, engine.catalog, ids.player.deck[1], "player")).toBeNull();
  });

  it("obeys restrictions and battlefield capacity through its normal play contract", () => {
    const full = placed({ player: { back: Array.from({ length: BACK_RANK_SIZE }, (_row, index) => index === 0 ? DECK_TOP.keeper.id : v.vanilla1.id), deck: [v.vanilla1.id], energy: 8 } });
    expect(canPlay(full.state, engine.catalog, "player", full.ids.player.deck[0], "deck")).toBe(false);
    const { state, ids } = placed();
    addFloating(new Context(state, engine.catalog, NO_PROMPTS), { source: ids.player.back[0]!, controller: "player", expiry: { at: "never" }, change: { kind: "cannotPlay", player: "player", instance: null, filter: {} } });
    expect(canPlay(state, engine.catalog, "player", ids.player.deck[0], "deck")).toBe(false);
  });

  it("supports a normal Interrupt response but excludes Offering and Reclaim from the deck", () => {
    const permit = { ...DECK_TOP.permit, id: syntheticId(0x51540), abilities: () => [staticAbility(playFromZone("deck"))] };
    const interrupt = { ...DECK_TOP.draw, id: syntheticId(0x51541), speed: "interrupt" as const, costs: [energy(1)], abilities: () => [keyword("offering"), keyword("reclaim")] };
    const response = createEngine(testCatalog([permit, interrupt, DECK_TOP.revealer]));
    const { state, ids } = boardState(response.catalog, { active: "enemy", phase: "day", player: { back: [permit.id, DECK_TOP.revealer.id], deck: [interrupt.id], energy: 4 }, enemy: { hand: [v.vanilla1.id], energy: 5 } });
    expect(playRoutes(state, response.catalog, ids.player.deck[0], "deck")).toEqual(["permission"]);
    expect(canPlay(state, response.catalog, "player", ids.player.deck[0], "deck")).toBe(false);
    const started = response.apply(state, "enemy", { kind: "play", from: "hand", card: ids.enemy.hand[0] }, NO_PROMPTS);
    expect(response.legalActions(started.state, "player")).toContainEqual({ kind: "play", from: "deck", card: ids.player.deck[0] });
    const played = response.apply(started.state, "player", { kind: "play", from: "deck", card: ids.player.deck[0] }, NO_PROMPTS);
    expect(played.events).toContainEqual({ kind: "cardPlayed", side: "player", instance: ids.player.deck[0] });
    expect(played.state.sides.player.currentEnergy).toBe(3);
  });

  it("consumes a dynamic next-top floating permission only on its committed play", () => {
    const { state, ids } = placed({ player: { back: [DECK_TOP.revealer.id], deck: [v.vanilla1.id, v.vanilla2.id], energy: 4 } });
    const effect = addFloating(new Context(state, engine.catalog, NO_PROMPTS), { source: ids.player.back[0]!, controller: "player", expiry: { at: "never" }, change: { kind: "playFrom", player: "player", zone: "deck", instance: null, filter: { cardType: "character" }, next: true } });
    expect(playPermission(state, engine.catalog, ids.player.deck[0], "player")).toEqual({ consumes: effect });
    const played = engine.apply(state, "player", { kind: "play", from: "deck", card: ids.player.deck[0] }, NO_PROMPTS);
    expect(played.events).toContainEqual({ kind: "effectEnded", effect });
    expect(playPermission(played.state, engine.catalog, ids.player.deck[1], "player")).toBeNull();
  });

  it("does not offer nonmatching events or bypass capacity, costs, and timing", () => {
    const event = placed({ player: { back: [DECK_TOP.keeper.id, v.vanilla1.id, v.vanilla2.id], deck: [DECK_TOP.draw.id] } });
    expect(playRoutes(event.state, engine.catalog, event.ids.player.deck[0], "deck")).toEqual([]);
    const costly = placed({ player: { back: [DECK_TOP.keeper.id, v.vanilla1.id, v.vanilla2.id], deck: [DECK_TOP.payable.id], hand: [], energy: 0 } });
    expect(canPlay(costly.state, engine.catalog, "player", costly.ids.player.deck[0], "deck")).toBe(false);
    const night = placed({ phase: "night" });
    expect(canPlay(night.state, engine.catalog, "player", night.ids.player.deck[0], "deck")).toBe(false);
  });
});
