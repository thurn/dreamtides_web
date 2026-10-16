import { describe, expect, it } from "vitest";
import { parseCardSubtype } from "../../types/card-identity";
import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import * as p from "../effects/primitives";
import type { ResolvingEffect } from "../effects/registry";
import type { ChooseTargetsPrompt } from "../prompts/types";
import { serializeState } from "../state/hash";
import { opponent, SIDES, type Side } from "../state/ids";
import { InlineSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { syntheticId } from "../testing/synthetic-cards";
import { passUntil } from "../testing/trigger-harness";
import { controls, energy, event, fromVoid, target } from "./builders";

const MAGE = parseCardSubtype("Mage"), WARRIOR = parseCardSubtype("Warrior");
const mage: EngineCardDefinition = {
  id: syntheticId(0x73101), cardType: "character", costs: [energy(3)], spark: 2,
  subtype: MAGE, speed: "standard", status: "vanilla", abilities: () => [],
};
const warrior = { ...mage, id: syntheticId(0x73102), subtype: WARRIOR };
function world(side: Side, body: ResolvingEffect) {
  const source: EngineCardDefinition = {
    ...mage, id: syntheticId(0x73100), cardType: "event", costs: [energy(1)], spark: null,
    subtype: parseCardSubtype(""), status: "authored", abilities: () => [event(body)],
  };
  const engine = createEngine(createCatalog([source, mage, warrior], []));
  const placed = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 1000,
    [side]: { hand: [{ cardId: source.id, typeRemap: MAGE }], back: [mage.id, mage.id],
      void: [mage.id, mage.id, warrior.id], energy: 10 },
    [opponent(side)]: { back: [mage.id, mage.id, warrior.id], energy: 10 },
  });
  return { engine, ...placed };
}
function play(w: ReturnType<typeof world>, side: Side, zone = false) {
  const candidates = zone ? w.ids[side].void : w.ids[opponent(side)].back.filter(id => id !== null);
  const selected = candidates[1], other = candidates[0];
  const targets: ChooseTargetsPrompt[] = [];
  const policy: ConstructorParameters<typeof InlineSource>[0]["player"] = prompt => {
    if (prompt.kind === "chooseTargets" && prompt.purpose.role === "target") {
      expect(prompt.side).toBe(side);
      expect(prompt.candidates).toEqual(expect.arrayContaining([selected, other]));
      targets.push(prompt);
      // A second independently offered choice names a different legal physical card.
      return [targets.length === 1 ? selected : other];
    }
    if (prompt.kind === "chooseMode" && prompt.purpose.role === "choosePlayer") return 0;
    throw new Error(`Unexpected synthetic prompt ${prompt.kind}`);
  };
  const answers = new InlineSource({ player: policy, enemy: policy });
  const before = serializeState(w.state);
  const played = w.engine.apply(w.state, side, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, answers);
  const settled = passUntil(w.engine, played.state, state => state.stack.length === 0 && state.triggerQueue.length === 0, answers);
  expect(serializeState(w.state)).toBe(before);
  expect(invariantViolations(settled.state, w.engine.catalog)).toEqual([]);
  expect(settled.state.sides[side].score).toBe(3);
  return { ...settled, targets, selected, other };
}

for (const side of SIDES) describe(`${side} remapped reference binding`, () => {
  for (const literal of [false, true]) it(`retains one shared character selection with literal=${String(literal)}`, () => {
    const t = target({ controller: "opponent", ...(literal ? { subtype: WARRIOR } : {}) });
    const w = world(side, p.sequence(p.exhaust(t), p.gainSpark(t, 1), p.gainPoints(3)));
    const out = play(w, side);
    expect(out.targets).toHaveLength(1);
    expect(out.state.instances[out.selected].status).toMatchObject({ exhausted: true, gainedSpark: 1 });
    expect(out.state.instances[out.other].status).toMatchObject({ exhausted: false, gainedSpark: 0 });
    if (literal) expect(out.targets[0].candidates).not.toContain(w.ids[opponent(side)].back[2]);
  });

  it("retains one shared void selection across materialization and the following zone check", () => {
    const z = fromVoid({ cardType: "character", subtype: WARRIOR });
    const w = world(side, p.sequence(p.materialize(z), p.returnFromVoid(z), p.gainPoints(3)));
    const out = play(w, side, true);
    expect(out.targets).toHaveLength(1);
    expect(out.state.instances[out.selected].zone).toBe("play");
    expect(out.state.instances[out.selected].controller).toBe(side);
    expect(out.state.sides[side].backRank).toContain(out.selected);
    expect(out.state.instances[out.other].zone).toBe("void");
    expect(out.state.sides[side].hand).not.toContain(out.other);
    expect(out.targets[0].candidates).not.toContain(w.ids[side].void[2]);
  });

  it("keeps independently authored equal character selections independent", () => {
    const first = target({ controller: "opponent", subtype: WARRIOR });
    const second = target({ controller: "opponent", subtype: WARRIOR });
    const out = play(world(side, p.sequence(p.exhaust(first), p.gainSpark(second, 1), p.gainPoints(3))), side);
    expect(out.targets).toHaveLength(2);
    expect(out.state.instances[out.selected].status).toMatchObject({ exhausted: true, gainedSpark: 0 });
    expect(out.state.instances[out.other].status).toMatchObject({ exhausted: false, gainedSpark: 1 });
  });

  it("keeps independently authored equal void selections independent", () => {
    const first = fromVoid({ cardType: "character", subtype: WARRIOR });
    const second = fromVoid({ cardType: "character", subtype: WARRIOR });
    const out = play(world(side, p.sequence(p.materialize(first), p.returnFromVoid(second), p.gainPoints(3))), side, true);
    expect(out.targets).toHaveLength(2);
    expect(out.state.instances[out.selected].zone).toBe("play");
    expect(out.state.instances[out.other].zone).toBe("hand");
    expect(out.state.sides[side].hand).toContain(out.other);
  });

  it("inherits the shared selection through deferred player and conditional branches", () => {
    const t = target({ controller: "opponent", subtype: WARRIOR });
    const body = p.sequence(p.exhaust(t), p.choosePlayer(() => p.ifThen(controls({ controller: "you" }, 2), p.gainSpark(t, 1))), p.gainPoints(3));
    const out = play(world(side, body), side);
    expect(out.targets).toHaveLength(1);
    expect(out.state.instances[out.selected].status).toMatchObject({ exhausted: true, gainedSpark: 1 });
    expect(out.state.instances[out.other].status).toMatchObject({ exhausted: false, gainedSpark: 0 });
  });
});
