/** D20: held-copy turn allowances compose with cost matching and discard feedback. */
import { expect } from "vitest";
import { activated, energy, event, staticAbility } from "../../engine/dsl/builders";
import { NO_DECK_MODS } from "../../engine/dsl/types";
import { costModifier, createCard, discard, sequence } from "../../engine/effects/primitives";
import { contentDreamsignDefinitions } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import { boardState } from "../../engine/testing/board";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseDreamsignId } from "../../types/identifiers";
import redPin from "../dreamsigns/red-pin-62e1a588";
import leafBundle from "../dreamsigns/leaf-bundle-9d134dfc";

const RED = parseDreamsignId(redPin.id), LEAF = parseDreamsignId(leafBundle.id);
const deck = Array.from({ length: 20 }, () => v.event0.id);
const costTwoEvent = { ...v.event0, id: syntheticId(0x65901), costs: [energy(2)] };
const reducer = { ...v.vanilla0, id: syntheticId(0x65902), abilities: () => [staticAbility(costModifier("you", { cardType: "character" }, -1))] };
const creator = { ...v.vanilla0, id: syntheticId(0x65903), abilities: () => [activated([], createCard(v.vanilla1.id))] };
const discardBoth = { ...v.event0, id: syntheticId(0x65904), abilities: () => [event(sequence(discard(1, "opponent"), discard(1)))] };
const local = createEngine(testCatalog([costTwoEvent, reducer, creator, discardBoth], {
  dreamsigns: contentDreamsignDefinitions().filter((entry) => entry.id === RED || entry.id === LEAF),
}));
const scenarios: NamedScenario[] = [];
const triggers = (events: readonly EngineEvent[], side: Side) => events.filter((e): e is Extract<EngineEvent, { kind: "triggerResolved" }> => e.kind === "triggerResolved" &&
  typeof e.source === "object" && e.source !== null && e.source.kind === "dreamsign" && e.source.side === side);
const draws = (events: readonly EngineEvent[], side: Side) => events.filter((e) => e.kind === "cardDrawn" && e.side === side);

function witness(id: typeof RED, side: Side): ScenarioSpec {
  return { board: { active: side, phase: "day", [side]: {
    dreamsigns: [id], energy: 10, back: [v.discardOne.id], hand: [v.vanilla2.id, v.vanilla1.id], deck,
  }, [opponent(side)]: { deck } },
  steps: (ids) => id === RED ? [playFromHand(ids, side)] : [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
  ...(id === LEAF ? { answers: (ids: ScenarioResult["ids"]) => [[ids[side].hand[0]]] } : {}),
  };
}
function checkDraw(result: ScenarioResult, side: Side): void {
  expect(draws(result.events, side)).toEqual([{ kind: "cardDrawn", side, instance: result.ids[side].deck[0] }]);
  expect(triggers(result.events, side)).toHaveLength(1);
  expect(result.state.sides[side].hand).toContain(result.ids[side].deck[0]);
}
function add(id: typeof RED, side: Side, description: string, check: () => void): void {
  // The shared catalog exercises the actual emblem witness; the private catalog supplies inline synthetic interactions.
  scenarios.push({ name: `${id} ${side} ${description}`, spec: witness(id, side), check: (result) => { checkDraw(result, side); check(); } });
}
for (const side of ["player", "enemy"] as const) {
  scenarios.push({ name: `${RED} ${side} exact cost character draws the physical deck head`, spec: witness(RED, side), check: (r) => checkDraw(r, side) });
  scenarios.push({ name: `${LEAF} ${side} paid discard draws the physical deck head`, spec: witness(LEAF, side), check: (r) => checkDraw(r, side) });
}
for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  add(RED, side, "nonmatching costs and Event preserve the first qualifying play", () => {
    const r = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [RED], energy: 20, hand: [v.vanilla0.id, v.vanilla1.id, v.vanilla3.id, costTwoEvent.id, v.vanilla2.id, v.vanilla2.id], deck,
    }, [other]: { deck } }, steps: (ids) => [0, 1, 2, 3, 4, 5].map((i) => playFromHand(ids, side, i)) });
    expect(draws(r.events, side)).toEqual([{ kind: "cardDrawn", side, instance: r.ids[side].deck[0] }]);
    expect(r.events.filter((e) => e.kind === "triggerQueued")).toEqual([expect.objectContaining({ subject: r.ids[side].hand[4], controller: side })]);
    expect(r.state.sides[side].hand).toEqual([r.ids[side].deck[0]]);
  });
  add(RED, side, "copiable cost differs from discounted payment", () => {
    const r = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [RED], back: [reducer.id], energy: 10, hand: [v.vanilla3.id, v.vanilla2.id], deck,
    }, [other]: { deck } }, steps: (ids) => [playFromHand(ids, side), playFromHand(ids, side, 1)] });
    expect(r.events.filter((e) => e.kind === "energyChanged" && e.cause === "payment").map((e) => e.kind === "energyChanged" ? e.change : null)).toEqual([-2, -1]);
    expect(r.state.turnLog.played[side].map((e) => e.cost)).toEqual([3, 2]);
    expect(r.events.filter((e) => e.kind === "triggerQueued")).toEqual([expect.objectContaining({ subject: r.ids[side].hand[1] })]);
    expect(draws(r.events, side)).toHaveLength(1);
  });
  add(RED, side, "deck modification changes copiable cost", () => {
    const r = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [RED], energy: 10, hand: [{ cardId: v.vanilla3.id, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }], deck,
    }, [other]: { deck } }, steps: (ids) => [playFromHand(ids, side)] });
    checkDraw(r, side);
    expect(r.state.turnLog.played[side][0].cost).toBe(2);
  });
  add(RED, side, "duplicate held copies remain used after serialization and renew next turn", () => {
    const r = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [RED, RED], energy: 10, hand: [v.vanilla2.id, v.vanilla2.id, v.vanilla2.id], deck,
    }, [other]: { deck } }, steps: (ids) => [playFromHand(ids, side)] });
    expect(draws(r.events, side)).toHaveLength(2);
    expect(triggers(r.events, side).map((e) => e.source)).toEqual([0, 1].map((index) => ({ kind: "dreamsign", side, index })));
    const loaded = deserializeState(serializeState(r.state));
    expect(stateHash(loaded)).toBe(stateHash(r.state));
    const again = local.apply(loaded, side, { kind: "play", card: r.ids[side].hand[1], from: "hand" }, new ScriptedSource([]));
    expect(draws(again.events, side)).toEqual([]);
    const away = passUntil(local, again.state, at(local, other, "day"));
    const next = passUntil(local, away.state, at(local, side, "day"));
    const renewed = local.apply(next.state, side, { kind: "play", card: r.ids[side].hand[2], from: "hand" }, new ScriptedSource([]));
    expect(triggers(renewed.events, side)).toHaveLength(2);
    expect(draws(renewed.events, side)).toHaveLength(2);
  });
  add(RED, side, "opposing controller play leaves holder allowance available", () => {
    const r = runScenario(local, { board: { active: other, phase: "day", [other]: { hand: [v.vanilla2.id], energy: 10, deck },
      [side]: { dreamsigns: [RED], hand: [v.vanilla2.id], energy: 10, deck } }, steps: (ids) => [playFromHand(ids, other)] });
    expect(triggers(r.events, side)).toEqual([]);
    expect(draws(r.events, side)).toEqual([]);
    const next = passUntil(local, r.state, at(local, side, "day"));
    const played = local.apply(next.state, side, { kind: "play", card: r.ids[side].hand[0], from: "hand" }, new ScriptedSource([]));
    expect(triggers(played.events, side)).toHaveLength(1);
  });
  add(LEAF, side, "paid discard of its drawn card does not renew duplicate copies", () => {
    const r = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [LEAF, LEAF], back: [v.discardOne.id], hand: [v.vanilla1.id, v.vanilla2.id], deck,
    }, [other]: { deck } }, steps: (ids) => [0, 1].map(() => ({ side, action: { kind: "activate" as const, source: ids[side].back[0]!, ability: 0 } })),
      answers: (ids) => [[ids[side].hand[0]], [ids[side].deck[0]]] });
    expect(r.events.filter((e) => e.kind === "discarded").map((e) => e.kind === "discarded" ? e.instance : null)).toEqual([r.ids[side].hand[0], r.ids[side].deck[0]]);
    expect(draws(r.events, side).map((e) => e.kind === "cardDrawn" ? e.instance : null)).toEqual(r.ids[side].deck.slice(0, 2));
    expect(triggers(r.events, side).map((e) => e.source)).toEqual([0, 1].map((index) => ({ kind: "dreamsign", side, index })));
    const loaded = deserializeState(serializeState(r.state));
    expect(stateHash(loaded)).toBe(stateHash(r.state));
    const again = local.apply(loaded, side, { kind: "activate", source: r.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[r.ids[side].deck[1]]]));
    expect(triggers(again.events, side)).toEqual([]);
    const away = passUntil(local, again.state, at(local, other, "day"));
    const next = passUntil(local, away.state, at(local, side, "day"));
    const renewed = local.apply(next.state, side, { kind: "activate", source: r.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[r.ids[side].hand[1]]]));
    expect(draws(renewed.events, side)).toHaveLength(2);
    expect(triggers(renewed.events, side)).toHaveLength(2);
  });
  add(LEAF, side, "opponent and own effect discards consume only holder occasion", () => {
    const r = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [LEAF], hand: [discardBoth.id, v.vanilla1.id, v.vanilla2.id], deck,
    }, [other]: { hand: [v.event0.id, v.event1.id], deck } }, steps: (ids) => [playFromHand(ids, side)],
      answers: (ids) => [[ids[other].hand[0]], [ids[side].hand[1]]] });
    expect(r.events.filter((e) => e.kind === "discarded").map((e) => e.kind === "discarded" ? e.side : null)).toEqual([other, side]);
    expect(r.events.filter((e) => e.kind === "triggerQueued")).toEqual([expect.objectContaining({ subject: r.ids[side].hand[1], controller: side })]);
    expect(draws(r.events, side)).toHaveLength(1);
    expect(draws(r.events, other)).toEqual([]);
  });
  add(LEAF, side, "created card payment ceases but announces a qualifying discard", () => {
    const initial = runScenario(local, { board: { active: side, phase: "day", [side]: {
      dreamsigns: [LEAF], back: [creator.id, v.discardOne.id], hand: [v.event0.id], deck,
    }, [other]: { deck } }, steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }] });
    const created = initial.events.find((e) => e.kind === "cardCreated");
    if (created?.kind !== "cardCreated") throw new Error("Creation did not announce an instance");
    expect(initial.state.instances[created.instance].status.created).toBe(true);
    const paid = local.apply(initial.state, side, { kind: "activate", source: initial.ids[side].back[1]!, ability: 0 }, new ScriptedSource([[created.instance]]));
    expect(paid.events).toContainEqual({ kind: "discarded", side, instance: created.instance });
    expect(paid.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: created.instance }));
    expect(paid.state.instances[created.instance]).toBeUndefined();
    expect(paid.state.sides[side].void).not.toContain(created.instance);
    expect(draws(paid.events, side)).toHaveLength(1);
    expect(triggers(paid.events, side)).toHaveLength(1);
  });
  add(LEAF, side, "hand limit discard draws before the next turn", () => {
    const setup = boardState(local.catalog, { active: side, phase: "night", [side]: {
      dreamsigns: [LEAF], hand: Array.from({ length: 11 }, () => v.vanilla1.id), deck,
    }, [other]: { deck } });
    const configured = { ...setup.state, config: { ...setup.state.config, handLimit: 10 } };
    const r = local.apply(configured, side, { kind: "pass" }, new ScriptedSource([[setup.ids[side].hand[0]]]));
    const discarded = r.events.findIndex((e) => e.kind === "discarded" && e.instance === setup.ids[side].hand[0]);
    const drawn = r.events.findIndex((e) => e.kind === "cardDrawn" && e.instance === setup.ids[side].deck[0]);
    const turn = r.events.findIndex((e) => e.kind === "turnStarted" && e.side === other);
    expect(discarded).toBeGreaterThanOrEqual(0); expect(drawn).toBeGreaterThan(discarded); expect(turn).toBeGreaterThan(drawn);
    expect(triggers(r.events, side)).toHaveLength(1);
    expect(r.state.sides[side].hand).toHaveLength(11);
  });
  for (const id of [RED, LEAF]) add(id, side, "empty draw uses existing Fatigue and still consumes the allowance", () => {
    const spec = witness(id, side);
    const setup = spec.board[side]!;
    const r = runScenario(local, { ...spec, board: { ...spec.board, [side]: { ...setup, hand: [v.vanilla2.id, v.vanilla2.id, v.vanilla1.id], deck: [] } },
      steps: (ids) => id === RED ? [playFromHand(ids, side), playFromHand(ids, side, 1)] : [0, 1].map(() => ({ side,
        action: { kind: "activate" as const, source: ids[side].back[0]!, ability: 0 } })),
      ...(id === LEAF ? { answers: (ids: ScenarioResult["ids"]) => [[ids[side].hand[0]], [ids[side].hand[1]]] } : {}),
    });
    expect(draws(r.events, side)).toEqual([]);
    expect(r.events.filter((e) => e.kind === "fatigue" && e.side === side)).toHaveLength(1);
    expect(r.events.filter((e) => e.kind === (id === RED ? "cardPlayed" : "discarded"))).toHaveLength(2);
    expect(triggers(r.events, side)).toHaveLength(1);
  });
}
export default { slug: "dreamsigns-ready-238", scenarios } satisfies ScenarioModule;
