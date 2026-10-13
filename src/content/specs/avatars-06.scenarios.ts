/** D20: Avatar play ordinals compose with choice order, one-shot costs and turn-limited grants. */
import { expect } from "vitest";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { hasKeyword } from "../../engine/rules/keywords";
import { routeCosts } from "../../engine/rules/timing";
import { opponent, type Side } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseAvatarId } from "../../types/identifiers";
import demetrios from "../avatars/demetrios-2c53b1b9";
import kragg from "../avatars/kragg-16b579fe";
import seraveth from "../avatars/seraveth-6488452d";
import tessa from "../avatars/tessa-ba973428";
import { SYNTHETIC_ABANDONER as abandoner } from "./abandonment-fixture";

const engine = createEngine(testCatalog([abandoner], { avatars: [kragg, tessa, demetrios, seraveth].map((avatar) => ({
  id: parseAvatarId(avatar.id), status: "authored", abilities: avatar.abilities!,
})) }));
const deck = Array.from({ length: 12 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];
const sourceOf = (side: Side) => ({ kind: "avatar", side } as const);
const resolutions = (events: readonly EngineEvent[], side: Side) => events.filter((event) => event.kind === "triggerResolved" &&
  typeof event.source === "object" && event.source !== null && event.source.kind === "avatar" && event.source.side === side);

function add(name: string, spec: ScenarioSpec, check: (result: ScenarioResult) => void): void {
  // A private synthetic catalog makes this composition independent of production filler cards.
  scenarios.push({ name, spec: { board: { active: "player", phase: "day" }, steps: () => [] },
    check: () => check(runScenario(engine, spec)) });
}

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  add(`${kragg.id} ${side} grants one next-character discount after two abandonments`, {
    board: { active: side, phase: "day", [side]: {
      avatar: parseAvatarId(kragg.id), back: [abandoner.id, v.vanilla0.id, v.vanilla0.id],
      hand: [v.event0.id, v.vanilla3.id, v.vanilla3.id], energy: 6, deck,
    }, [other]: { deck } },
    steps: (ids) => [
      ...[0, 1].map(() => ({ side, action: { kind: "activate" as const, source: ids[side].back[0]!, ability: 0 } })),
      ...[0, 1, 2].map((index) => playFromHand(ids, side, index)),
    ],
    answers: (ids) => [[ids[side].back[1]!], [ids[side].back[2]!]],
  }, ({ state, ids, events }) => {
    const grants = events.filter((event) => event.kind === "effectStarted");
    expect(resolutions(events, side)).toHaveLength(1);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ source: sourceOf(side), controller: side, expiry: { at: "endOfTurn" },
      change: { kind: "cost", player: side, amount: -2, next: true, filter: { cardType: "character" } } });
    const end = events.findIndex((event) => event.kind === "effectEnded" && event.effect === grants[0].effect);
    const nonmatching = events.findIndex((event) => event.kind === "cardPlayed" && event.instance === ids[side].hand[0]);
    const matching = events.findIndex((event) => event.kind === "cardPlayed" && event.instance === ids[side].hand[1]);
    expect(end).toBeGreaterThan(nonmatching);
    expect(end).toBeLessThan(matching);
    expect(state.sides[side].currentEnergy).toBe(2);
    expect(state.floating).toEqual([]);
    for (const id of ids[side].hand.slice(1)) expect(state.instances[id].zone).toBe("play");
  });
  add(`${kragg.id} ${side} expires an unused discount and renews only on its controller's abandonment`, {
    board: { active: side, phase: "day", [side]: {
      avatar: parseAvatarId(kragg.id), back: [abandoner.id, v.vanilla0.id], hand: [v.vanilla3.id], energy: 5, deck,
    }, [other]: { back: [abandoner.id, v.vanilla0.id], deck } },
    steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
    answers: (ids) => [[ids[side].back[1]!]],
  }, ({ state, ids, events }) => {
    const started = events.find((event) => event.kind === "effectStarted");
    if (started?.kind !== "effectStarted") throw new Error("Discount not announced");
    const away = passUntil(engine, state, at(engine, other, "day"));
    expect(away.events).toContainEqual(expect.objectContaining({ kind: "effectEnded", effect: started.effect }));
    expect(away.state.floating).toEqual([]);
    const opposing = engine.apply(away.state, other, { kind: "activate", source: ids[other].back[0]!, ability: 0 },
      new ScriptedSource([[ids[other].back[1]!]]));
    expect(resolutions(opposing.events, side)).toEqual([]);
    const next = passUntil(engine, opposing.state, at(engine, side, "day"));
    const renewed = engine.apply(next.state, side, { kind: "activate", source: ids[side].back[0]!, ability: 0 },
      new ScriptedSource([[ids[side].back[0]!]]));
    expect(resolutions(renewed.events, side)).toHaveLength(1);
    expect(renewed.state.floating).toHaveLength(1);
    const played = engine.apply(renewed.state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new ScriptedSource([]));
    expect(played.state.sides[side].currentEnergy).toBe(4);
    expect(played.state.floating).toEqual([]);
  });
  add(`${tessa.id} ${side} counts cards, draws before discard and triggers again next turn`, {
    board: { active: side, phase: "day", [side]: {
      avatar: parseAvatarId(tessa.id), hand: [v.event0.id, v.vanilla0.id, v.event0.id, v.event0.id], deck,
    }, [other]: { deck } },
    steps: (ids) => [0, 1, 2].map((index) => playFromHand(ids, side, index)),
    answers: (ids) => [[ids[side].deck[0]]],
  }, ({ state, ids, events }) => {
    expect(resolutions(events, side)).toHaveLength(1);
    const draw = events.findIndex((event) => event.kind === "cardDrawn" && event.instance === ids[side].deck[0]);
    const discard = events.findIndex((event) => event.kind === "discarded" && event.instance === ids[side].deck[0]);
    const secondPlay = events.findIndex((event) => event.kind === "cardPlayed" && event.instance === ids[side].hand[1]);
    const third = events.findIndex((event) => event.kind === "cardPlayed" && event.instance === ids[side].hand[2]);
    expect(draw).toBeGreaterThan(secondPlay);
    expect(draw).toBeLessThan(third);
    expect(discard).toBeGreaterThan(draw);
    expect(state.instances[ids[side].deck[0]].zone).toBe("void");
    expect(events.filter((event) => event.kind === "cardDrawn")).toHaveLength(1);
    const away = passUntil(engine, state, at(engine, other, "day"));
    const next = passUntil(engine, away.state, at(engine, side, "day"));
    const [first, second] = next.state.sides[side].hand;
    expect(first).toBeDefined(); expect(second).toBeDefined();
    const one = engine.apply(next.state, side, { kind: "play", card: first, from: "hand" }, new ScriptedSource([]));
    expect(resolutions(one.events, side)).toEqual([]);
    const drawn = one.state.sides[side].deck[0];
    const two = engine.apply(one.state, side, { kind: "play", card: second, from: "hand" }, new ScriptedSource([[drawn]]));
    expect(resolutions(two.events, side)).toHaveLength(1);
    expect(two.state.instances[drawn].zone).toBe("void");
  });
  add(`${demetrios.id} ${side} counts characters across an event and banishes its unplayed Ephemeral draw`, {
    board: { active: side, phase: "day", [side]: {
      avatar: parseAvatarId(demetrios.id), hand: [v.vanilla0.id, v.event0.id, v.vanilla0.id, v.vanilla0.id], deck,
    }, [other]: { deck } },
    steps: (ids) => [0, 1, 2, 3].map((index) => playFromHand(ids, side, index)),
  }, ({ state, ids, events }) => {
    expect(resolutions(events, side)).toHaveLength(1);
    const second = events.findIndex((event) => event.kind === "cardPlayed" && event.instance === ids[side].hand[2]);
    const draw = events.findIndex((event) => event.kind === "cardDrawn");
    expect(draw).toBeGreaterThan(second);
    expect(events.filter((event) => event.kind === "cardDrawn")).toHaveLength(1);
    expect(state.instances[ids[side].deck[0]]).toMatchObject({ zone: "hand", status: { ephemeral: true } });
    const ended = passUntil(engine, state, at(engine, other, "day"));
    expect(ended.state.instances[ids[side].deck[0]]).toMatchObject({ zone: "banished", status: { ephemeral: false } });
  });
  for (const reclaim of [true, false]) add(`${seraveth.id} ${side} grants the chosen void character Reclaim 2 and ${reclaim ? "plays it for the granted cost" : "expires it at Ending"}`, {
    board: { active: side, phase: "day", [side]: {
      avatar: parseAvatarId(seraveth.id), hand: [v.vanilla0.id, v.event0.id, v.vanilla0.id],
      void: [v.vanilla3.id, v.vanilla5.id, v.event0.id], energy: 5, deck,
    }, [other]: { void: [v.vanilla3.id], deck } },
    steps: (ids) => [0, 1].map((index) => playFromHand(ids, side, index)),
  }, (result) => {
    const { ids } = result;
    const chosen = ids[side].void[0];
    const third = engine.apply(result.state, side, { kind: "play", card: ids[side].hand[2], from: "hand" }, {
      answer(prompt) {
        expect(prompt).toMatchObject({ side, candidates: ids[side].void.slice(0, 2) });
        return [chosen];
      },
    });
    const state = third.state, events = [...result.events, ...third.events];
    expect(resolutions(events, side)).toHaveLength(1);
    expect(third.answers).toHaveLength(1);
    expect(hasKeyword(state, engine.catalog, chosen, "reclaim")).toBe(true);
    expect(routeCosts(state, engine.catalog, chosen, "reclaim")).toEqual([{ cost: "energy", amount: 2 }]);
    for (const id of [...ids[side].void.slice(1), ...ids[other].void]) expect(hasKeyword(state, engine.catalog, id, "reclaim")).toBe(false);
    const grants = events.filter((event) => event.kind === "effectStarted");
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ source: sourceOf(side), expiry: { at: "endOfTurn" },
      change: { kind: "keyword", instance: chosen, keyword: "reclaim", reclaimCosts: [{ cost: "energy", amount: 2 }] } });
    if (reclaim) {
      const played = engine.apply(state, side, { kind: "play", card: chosen, from: "void" }, new ScriptedSource([]));
      expect(played.state.sides[side].currentEnergy).toBe(3);
      expect(played.state.instances[chosen]).toMatchObject({ zone: "play", status: { reclaimed: true, playedViaReclaim: true } });
      expect(played.events).toContainEqual({ kind: "cardPlayed", side, instance: chosen });
    } else {
      const ended = passUntil(engine, state, at(engine, other, "day"));
      expect(ended.events).toContainEqual(expect.objectContaining({ kind: "effectEnded", effect: grants[0].effect }));
      expect(hasKeyword(ended.state, engine.catalog, chosen, "reclaim")).toBe(false);
      const next = passUntil(engine, ended.state, at(engine, side, "day"));
      expect(engine.legalActions(next.state, side).some((action) => action.kind === "play" && action.card === chosen)).toBe(false);
    }
  });
  add(`${seraveth.id} ${side} resolves its second-character trigger with an empty character void`, {
    board: { active: side, phase: "day", [side]: {
      avatar: parseAvatarId(seraveth.id), hand: [v.vanilla0.id, v.vanilla0.id], void: [v.event0.id], deck,
    }, [other]: { void: [v.vanilla3.id], deck } },
    steps: (ids) => [0, 1].map((index) => playFromHand(ids, side, index)),
  }, ({ state, events, answers }) => {
    expect(resolutions(events, side)).toHaveLength(1);
    expect(events.some((event) => event.kind === "effectStarted")).toBe(false);
    expect(state.floating).toEqual([]);
    expect(answers).toEqual([]);
  });
}

export default { slug: "avatars-06", scenarios } satisfies ScenarioModule;
