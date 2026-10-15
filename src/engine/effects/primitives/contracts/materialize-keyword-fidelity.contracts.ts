/** Public materialization grants retain independent anonymous physical-member fidelity. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, characterYouControl, energy, event, everyIn } from "../../../dsl/builders";
import { whenDraw } from "../../../dsl/triggers";
import type { Engine } from "../../../engine";
import { createEngine } from "../../../engine";
import { cloneState } from "../../../state/clone";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingEffect } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import type { Decklists } from "../../../view/determinize";
import type { BattleView } from "../../../view/view";
import * as p from "../index";

const spell = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x70300 + index), costs: [energy(0)], status: "authored", abilities: () => [event(effect)],
});
const spells = {
  enable: spell(0, p.materializeKeywordModifier()),
  again: spell(1, p.rematerialize(all(characterYouControl()))),
  back: spell(2, p.returnToHand(all(characterYouControl()))),
  hide: spell(3, p.shuffleInto([everyIn("hand", { cardType: "character" })])),
  draw: spell(4, p.draw(1)),
  capture: spell(5, p.withMaterialized(p.materialize(everyIn("hand", { cardType: "character" })),
    p.floating(whenDraw(), p.gainPoints(1)))),
  create: spell(6, p.sequence(p.createCard(v.vanilla0.id), p.materialize(everyIn("hand", { cardType: "character" })))),
};
const engine = createEngine(testCatalog(Object.values(spells)));
const seed = battleSeed("materialize-keyword-member-fidelity");
type Stage = "play" | "returned hand" | "anonymous deck" | "drawn hand";
interface Witness {
  readonly state: BattleState;
  readonly decklists: Decklists;
  readonly members: readonly InstanceId[];
}

function ownedLists(state: BattleState): Decklists {
  const entries = (side: Side) => Object.values(state.instances).flatMap(instance =>
    instance.owner === side && instance.printing.kind === "card" && !instance.status.created
      ? [{ cardId: instance.printing.cardId, ...instance.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}
function play(state: BattleState, side: Side, card: InstanceId): BattleState {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  return passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0).state;
}
function witness(side: Side, stage: Stage = "anonymous deck", count = 1, mixed = false, amplified = false): Witness {
  const defs = Object.values(spells);
  const initial = boardState(engine.catalog, {
    active: side, phase: "day", scoreToWin: 10000,
    [side]: { energy: 50, hand: [...defs.map(card => card.id),
      ...Array.from({ length: count }, () => ({ cardId: v.vanilla0.id, amplified }))] },
    [opponent(side)]: { deck: [v.vanilla0.id, v.event0.id] },
  });
  const decklists = ownedLists(initial.state);
  const members = initial.ids[side].hand.slice(defs.length);
  const run = (state: BattleState, key: keyof typeof spells) => play(state, side, initial.ids[side].hand[defs.indexOf(spells[key])]);
  let state = run(initial.state, "enable");
  if (mixed) state = run(state, "capture");
  else for (const id of members) state = play(state, side, id);
  state = run(state, "again");
  if (stage !== "play") state = run(state, "back");
  if (stage === "anonymous deck" || stage === "drawn hand") state = run(state, "hide");
  if (stage === "drawn hand") state = run(state, "draw");
  expect(invariantViolations(state, engine.catalog)).toEqual([]);
  return { state, decklists, members };
}
const physical = (state: BattleState) => state.floating.filter((effect): effect is FloatingEffect & {
  readonly change: Extract<FloatingEffect["change"], { readonly kind: "materializeKeyword" }> & { readonly instance: InstanceId };
} => effect.change.kind === "materializeKeyword" && effect.change.instance !== null);
const shownGrants = (seen: BattleView) => seen.floating.flatMap(effect =>
  effect.change.kind === "materializeKeyword" && effect.change.instance !== null ? [effect.change.instance] : []);
function matches(w: Witness): void {
  expect(determinizationDivergences(engine, w.state, w.decklists, seed, 0)).toEqual([]);
}
function detects(w: Witness, mutate: (sampled: BattleState) => void, viewers: readonly Side[] = SIDES): void {
  const corrupted: Engine = {
    ...engine,
    determinize: (...args) => {
      const sampled = cloneState(engine.determinize(...args));
      mutate(sampled);
      return sampled;
    },
  };
  const problems = determinizationDivergences(corrupted, w.state, w.decklists, seed, 0);
  for (const viewer of viewers) expect(problems.some(problem =>
    problem.startsWith(`${viewer}'s determinization: floating effect`))).toBe(true);
}

describe.each(SIDES)("materialization member fidelity for %s", side => {
  it.each(["play", "returned hand", "anonymous deck", "drawn hand"] as const)("preserves public grants in %s", stage => {
    const w = witness(side, stage, 1, false, true);
    matches(w);
    expect(physical(w.state)).toHaveLength(2);
    for (const viewer of SIDES) {
      const seen = engine.view(w.state, viewer);
      const grants = shownGrants(seen);
      expect(grants).toHaveLength(2);
      expect(grants[0]).toEqual(grants[1]);
      const hidden = stage === "anonymous deck" || (stage === "drawn hand" && viewer !== side);
      if (hidden) {
        expect(grants[0]).toEqual({ member: 0, owner: side, printing: { kind: "card", cardId: v.vanilla0.id }, variant: { amplified: true } });
        for (const id of w.members) expect(JSON.stringify(seen)).not.toContain(`"${id}"`);
      } else expect(grants).toEqual([w.members[0], w.members[0]]);
      const sampled = engine.determinize(seen, w.decklists, () => 0.37);
      const ids = physical(sampled).map(effect => effect.change.instance);
      expect(new Set(ids).size).toBe(1);
      expect(sampled.instances[ids[0]]).toMatchObject({ owner: side, printing: { kind: "card", cardId: v.vanilla0.id }, variant: { amplified: true } });
    }
  });

  it("keeps distinct same-UUID members and their trigger captures coherent", () => {
    const w = witness(side, "anonymous deck", 2, true);
    matches(w);
    for (const viewer of SIDES) {
      const seen = engine.view(w.state, viewer);
      const grants = shownGrants(seen);
      const trigger = seen.floating.find(effect => effect.change.kind === "trigger");
      if (trigger?.change.kind !== "trigger") throw new Error("Missing public captured trigger");
      expect(trigger.change.captured).toEqual(grants.slice(0, 2));
      expect(grants.slice(2)).toEqual(grants.slice(0, 2));
      expect(grants[0]).not.toEqual(grants[1]);
      const sampled = engine.determinize(seen, w.decklists, () => 0.37);
      const ids = physical(sampled).map(effect => effect.change.instance);
      expect(new Set(ids).size).toBe(2);
      const copied = sampled.floating.find(effect => effect.change.kind === "trigger");
      expect(copied?.change.kind === "trigger" ? copied.change.captured : null).toEqual(ids.slice(0, 2));
    }
  });

  it.each(["missing grant", "timestamp", "expiry", "controller", "player", "keyword", "source", "owner", "printing", "variant", "missing target", "missing player"] as const)(
    "detects independently corrupted %s", field => {
      const w = witness(side);
      matches(w);
      detects(w, sampled => {
        const grant = physical(sampled)[0];
        const target = sampled.instances[grant.change.instance];
        switch (field) {
          case "missing grant": sampled.floating = sampled.floating.filter(effect => effect.id !== grant.id); break;
          case "timestamp": Object.assign(grant, { timestamp: grant.timestamp + 1 }); break;
          case "expiry": Object.assign(grant, { expiry: { at: "turnStart", side } }); break;
          case "controller": Object.assign(grant, { controller: opponent(grant.controller) }); break;
          case "player": Object.assign(grant.change, { player: opponent(grant.change.player) }); break;
          case "keyword": Object.assign(grant.change, { keyword: "vengeful" }); break;
          case "source": Object.assign(grant, { source: { kind: "avatar", side: opponent(side) } }); break;
          case "owner": Object.assign(target, { owner: opponent(target.owner) }); break;
          case "printing": Object.assign(target, { printing: { kind: "card", cardId: v.vanilla1.id } }); break;
          case "variant": Object.assign(target, { variant: { amplified: true } }); break;
          case "missing target": Object.assign(grant.change, { instance: null }); break;
          case "missing player": Reflect.deleteProperty(grant.change, "player"); break;
        }
      });
    },
  );

  it.each(["split repeated grants", "collapse distinct members", "split trigger binding"] as const)("detects %s with equal-printing cards", corruption => {
    const w = witness(side, "anonymous deck", 2, corruption === "split trigger binding");
    matches(w);
    detects(w, sampled => {
      const grants = physical(sampled);
      const first = grants[0].change.instance;
      const second = grants[1].change.instance;
      expect(first).not.toBe(second);
      if (corruption === "split repeated grants") Object.assign(grants[2].change, { instance: second });
      else if (corruption === "collapse distinct members") {
        for (const grant of grants) if (grant.change.instance === second) Object.assign(grant.change, { instance: first });
      } else {
        const trigger = sampled.floating.find(effect => effect.change.kind === "trigger");
        if (trigger?.change.kind !== "trigger") throw new Error("Missing sampled captured trigger");
        Object.assign(trigger.change, { captured: [second, first] });
      }
    });
  });

  it("keeps null enabling windows and expires the real hidden grants at Ending", () => {
    const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [spells.enable.id] } });
    const enabled = play(initial.state, side, initial.ids[side].hand[0]);
    expect(enabled.floating).toHaveLength(1);
    expect(enabled.floating[0].change).toMatchObject({ kind: "materializeKeyword", instance: null });
    matches({ state: enabled, decklists: ownedLists(initial.state), members: [] });
    const w = witness(side);
    const expired = passUntil(engine, w.state, next => next.turn.turnNumber > w.state.turn.turnNumber).state;
    expect(expired.floating.some(effect => effect.change.kind === "materializeKeyword")).toBe(false);
    matches({ ...w, state: expired });
  });

  it("drops genuine ceased created members while retaining the null window", () => {
    const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [spells.enable.id, spells.create.id, spells.back.id] } });
    let state = play(initial.state, side, initial.ids[side].hand[0]);
    state = play(state, side, initial.ids[side].hand[1]);
    const [grant] = physical(state);
    expect(state.instances[grant.change.instance].status.created).toBe(true);
    state = play(state, side, initial.ids[side].hand[2]);
    expect(state.instances[grant.change.instance]).toBeUndefined();
    expect(physical(state)).toEqual([]);
    expect(state.floating.filter(effect => effect.change.kind === "materializeKeyword")).toHaveLength(1);
    matches({ state, decklists: ownedLists(initial.state), members: [] });
  });
});
