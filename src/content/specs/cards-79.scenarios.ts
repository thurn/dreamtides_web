/** D20: a paid departure enables Night; exact hand-source payments stack on one physical card. */
import { expect } from "vitest";
import { contentFigmentDefinitions, engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { opponent, parseFigmentId, type Side } from "../../engine/state/ids";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import mass from "../cards/hungering-mass-cd4d689d";
import vault from "../cards/vaultbreaker-c97b0a5b";
import ethereal from "../figments/ethereal-3eddb1b8";

const MASS = parseCardId(mass.id), VAULT = parseCardId(vault.id), ETHEREAL = parseFigmentId(ethereal.id);
const local = createEngine(testCatalog([engineCardFromContent(mass), engineCardFromContent(vault)], {},
  contentFigmentDefinitions().filter(figment => figment.id === ETHEREAL)));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
const payment = (events: readonly EngineEvent[], side: Side) => events.reduce((n, e) =>
  n + (e.kind === "energyChanged" && e.side === side && e.cause === "payment" ? e.change : 0), 0);
const scenarios: NamedScenario[] = [];

function massSpec(side: Side, amplified: boolean, departure: "own" | "opponent" | "none"): ScenarioSpec {
  const other = opponent(side);
  return {
    board: { active: side, phase: "day", [side]: { hand: [{ cardId: MASS, amplified }, ...(departure === "opponent" ? [v.dissolveVictim.id] : [])],
      back: [v.vanilla1.id, v.vanilla2.id], deck, energy: 10 }, [other]: { back: [v.vanilla3.id], deck } },
    steps: ids => [playFromHand(ids, side),
      ...(departure === "own" ? [{ side, action: { kind: "activate" as const, source: ids[side].hand[0], ability: 1 } }]
        : departure === "opponent" ? [playFromHand(ids, side, 1)] : []),
      { side, action: { kind: "pass" } }, { side: other, action: { kind: "pass" } }],
    answers: ids => departure === "own" ? [[ids[side].back[0]!], [{ card: ids[side].deck[0], to: "void" }]]
      : departure === "opponent" ? [[ids[other].back[0]!]] : [],
  };
}
function figments(result: ScenarioResult, side: Side) {
  return Object.values(result.state.instances).filter(card => card.controller === side && card.zone === "play" &&
    card.printing.kind === "figment" && card.printing.figment === ETHEREAL);
}
function checkMass(result: ScenarioResult, side: Side, amplified: boolean): void {
  const source = result.ids[side].hand[0], victim = result.ids[side].back[0]!;
  expect(payment(result.events, side)).toBe(-(local.view(result.start, side).instances[source].characteristics.cost + 1));
  expect(result.state.turn).toMatchObject({ active: side, phase: "night" });
  expect(result.state.instances[source].zone).toBe("play");
  expect(result.events).toContainEqual({ kind: "abandoned", instance: victim, side });
  expect(result.state.sides[side].void).toContain(victim);
  expect(result.events.filter(e => e.kind === "foresaw")).toEqual([
    { kind: "foresaw", side, kept: [], voided: [result.ids[side].deck[0]] },
  ]);
  expect(result.state.sides[side].deck[0]).toBe(result.ids[side].deck[1]);
  const [made] = figments(result, side); expect(figments(result, side)).toHaveLength(1);
  expect(made.printing).toEqual({ kind: "figment", figment: ETHEREAL, spark: amplified ? 2 : 1 });
  expect(made.owner).toBe(side); expect(result.state.sides[side].backRank).toContain(made.id);
  const left = result.events.findIndex(e => e.kind === "leftPlay" && e.instance === victim);
  const night = result.events.findIndex(e => e.kind === "phaseChanged" && e.phase === "night");
  const entered = result.events.findIndex(e => e.kind === "materialized" && e.instance === made.id);
  expect(left).toBeGreaterThanOrEqual(0); expect(night).toBeGreaterThan(left); expect(entered).toBeGreaterThan(night);
  // Actual same-content controls distinguish an intervening condition from an unconditional Night effect.
  for (const departure of ["none", "opponent"] as const) {
    const control = runScenario(local, massSpec(side, amplified, departure));
    expect(control.state.turn.phase).toBe("night");
    expect(figments(control, side)).toEqual([]);
    if (departure === "opponent") expect(control.events.some(e => e.kind === "leftPlay" && e.side === opponent(side))).toBe(true);
  }
}

function vaultSpec(side: Side): ScenarioSpec {
  return { board: { active: side, phase: "day", [side]: { hand: [VAULT, VAULT], back: [v.vanilla1.id, v.vanilla2.id], energy: 20 },
    [opponent(side)]: { deck } },
  steps: ids => [{ side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } },
    { side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } }, playFromHand(ids, side)],
  answers: ids => [[ids[side].back[0]!]] };
}
function checkVault(result: ScenarioResult, side: Side): void {
  const [source, decoy] = result.ids[side].hand;
  const before = local.view(result.start, side).instances[source].characteristics.cost;
  const after = local.view(result.state, side);
  expect(after.instances[source].characteristics.cost).toBe(before - 2);
  expect(after.instances[decoy].characteristics.cost).toBe(before);
  expect(result.state.instances[source].zone).toBe("play");
  expect(result.state.instances[decoy].zone).toBe("hand");
  expect(result.events.filter(e => e.kind === "revealed")).toEqual([
    { kind: "revealed", side, instances: [source] }, { kind: "revealed", side, instances: [source] },
  ]);
  expect(result.events.filter(e => e.kind === "abandoned").map(e => e.instance)).toEqual(result.ids[side].back);
  expect(result.events.filter(e => e.kind === "effectStarted").map(e => e.change)
    .filter(change => change.kind === "cardCost")).toEqual([
      { kind: "cardCost", instance: source, mode: "reduce", amount: 1 },
      { kind: "cardCost", instance: source, mode: "reduce", amount: 1 },
    ]);
  expect(payment(result.events, side)).toBe(-(before - 2));
  expect(result.events.filter(e => e.kind === "cardPlayed").map(e => e.instance)).toEqual([source]);
}
for (const side of ["player", "enemy"] as const) {
  for (const amplified of [false, true]) scenarios.push({ name: `${MASS} ${side} ${amplified ? "amplified" : "base"} paid departure enables its own Night figment`,
    spec: massSpec(side, amplified, "own"), check: result => checkMass(result, side, amplified) });
  scenarios.push({ name: `${VAULT} ${side} repeated hand payment reduces only its physical source before play`,
    spec: vaultSpec(side), check: result => checkVault(result, side) });
}
export default { slug: "cards-79", scenarios } satisfies ScenarioModule;
