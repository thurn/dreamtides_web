/** Complete abandonment branches match their player and effective departing character together. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, enemyCharacter, energy, self } from "../../../dsl/builders";
import { either, triggered, whenAbandon } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import * as p from "../index";

const card = (n: number, abilities: EngineCardDefinition["abilities"], subtype: EngineCardDefinition["subtype"] = "Warrior"): EngineCardDefinition => ({
  id: syntheticId(0x721000 + n), cardType: "character", costs: [energy(1)], spark: 1, subtype,
  speed: "standard", status: "authored", abilities,
});
const combined = (matches: boolean) => either(whenAbandon("you", matches ? { costAtMost: 1 } : { costAtLeast: 4 }),
  whenAbandon("opponent", matches ? { costAtLeast: 4 } : { costAtMost: 1 }));
const abandonSource = p.abandon("you", { subtype: "Warrior" });
function world(side: Side, cards: readonly EngineCardDefinition[], own: SideSetup, other: SideSetup = {}) {
  const engine = createEngine(testCatalog(cards));
  return { engine, ...boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { deck: [v.vanilla1.id], energy: 10, ...own }, [opponent(side)]: { deck: [v.vanilla1.id], energy: 10, ...other } }) };
}
type World = ReturnType<typeof world>;
function step(w: World, state: BattleState, action: Step) {
  const out = runStep(state, action, NO_PROMPTS, w.engine.catalog);
  if (out.kind !== "done") throw new Error("Unexpected synthetic prompt");
  return out;
}
function activate(w: World, source: InstanceId) {
  const paid = step(w, w.state, { kind: "activate", source, ability: 0 });
  return step(w, paid.state, { kind: "resolveTop" });
}
function finish(w: World, state: BattleState): BattleState {
  let current = deserializeState(serializeState(state));
  expect(stateHash(current)).toBe(stateHash(state));
  for (let count = 0; current.triggerQueue.length; count++) {
    if (count > 20) throw new Error("Unbounded synthetic queue");
    current = step(w, current, { kind: "resolveTrigger" }).state;
  }
  return current;
}
const queued = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "triggerQueued")
  .map(event => ({ source: event.source, subject: event.subject }));
const points = (state: BattleState, side: Side, amount: number) => {
  expect.soft(state.sides[side].score).toBe(amount);
  expect.soft(state.sides[opponent(side)].score).toBe(0);
};

describe("721 branch eligibility", () => {
  it.each(SIDES.flatMap(side => [false, true].flatMap(hidden => [false, true].map(matches => ({ side, hidden, matches })))))("complete leaf $side hidden=$hidden matches=$matches", ({ side, hidden, matches }) => {
    const sourceCard = card(0, () => [activated([], abandonSource)]);
    const watcher = card(1, () => [triggered(combined(matches), p.gainPoints(3), { zone: "any" })], "Explorer");
    const w = world(side, [sourceCard, watcher], { back: [sourceCard.id, ...hidden ? [] : [watcher.id]], hand: hidden ? [watcher.id] : [] });
    const source = w.ids[side].back[0]!, watch = hidden ? w.ids[side].hand[0] : w.ids[side].back[1]!;
    const out = activate(w, source);
    expect(out.state.instances[source].zone).toBe("void");
    expect.soft(queued(out.events)).toEqual(matches ? [{ source: watch, subject: source }] : []);
    points(finish(w, out.state), side, matches ? 3 : 0);
  });

  it.each(SIDES)("admits one %s occurrence when both whole OR leaves match", side => {
    const sourceCard = card(2, () => [activated([], abandonSource)]);
    const watcher = card(3, () => [triggered(either(whenAbandon("you", { costAtMost: 1 }),
      whenAbandon("you", { cardType: "character" })), p.gainPoints(3))], "Explorer");
    const w = world(side, [sourceCard, watcher], { back: [sourceCard.id, watcher.id] });
    const out = activate(w, w.ids[side].back[0]!);
    expect(queued(out.events)).toEqual([{ source: w.ids[side].back[1], subject: w.ids[side].back[0] }]);
    points(finish(w, out.state), side, 3);
  });

  it.each(SIDES.flatMap(side => (["allTypes", "spark"] as const).map(mode => ({ side, mode }))))("effective departure leaf $side $mode", ({ side, mode }) => {
    const change = mode === "allTypes" ? p.giveAllTypes(self(), "whileSourceInPlay") : p.gainSpark(self(), 4, "whileSourceInPlay");
    const sourceCard = card(4, () => [activated([], p.sequence(change, abandonSource))]);
    const filter = mode === "allTypes" ? { subtype: "Mage" as const } : { sparkAtLeast: 5 };
    const watcher = card(5, () => [triggered(either(whenAbandon("you", filter), whenAbandon("opponent", { costAtLeast: 4 })), p.gainPoints(3))], "Explorer");
    const w = world(side, [sourceCard, watcher], { back: [sourceCard.id, watcher.id] });
    const out = activate(w, w.ids[side].back[0]!);
    expect(queued(out.events)).toEqual([{ source: w.ids[side].back[1], subject: w.ids[side].back[0] }]);
    points(finish(w, out.state), side, 3);
  });

  it.each(SIDES)("uses %s actual abandoning control after public gainControl", side => {
    const target = card(6, () => []);
    const caster = card(7, () => [activated([], p.sequence(p.gainControl(all(enemyCharacter({ subtype: "Warrior" }))), abandonSource))], "Explorer");
    const watcher = card(8, () => [triggered(combined(true), p.gainPoints(3))], "Explorer");
    const ownerWatcher = card(9, () => [triggered(whenAbandon("you", { costAtMost: 1 }), p.gainPoints(30))], "Explorer");
    const w = world(side, [target, caster, watcher, ownerWatcher], { back: [caster.id, watcher.id] }, { back: [target.id, ownerWatcher.id] });
    const source = w.ids[opponent(side)].back[0]!, out = activate(w, w.ids[side].back[0]!);
    expect(out.events).toContainEqual(expect.objectContaining({ kind: "controlChanged", instance: source, from: opponent(side), to: side }));
    expect(out.events).toContainEqual({ kind: "abandoned", instance: source, side });
    expect(out.state.sides[opponent(side)].void).toContain(source);
    expect(queued(out.events)).toEqual([{ source: w.ids[side].back[1], subject: source }]);
    points(finish(w, out.state), side, 3);
  });

  it.each(SIDES.flatMap(side => [false, true].map(matches => ({ side, matches }))))("floating complete leaf $side matches=$matches", ({ side, matches }) => {
    const sourceCard = card(10, () => [activated([], p.sequence(p.floating(combined(matches), p.gainPoints(3), "whileSourceInPlay"), abandonSource))]);
    const w = world(side, [sourceCard], { back: [sourceCard.id] });
    const source = w.ids[side].back[0]!, out = activate(w, source);
    expect(out.state.floating.filter(effect => effect.change.kind === "trigger")).toEqual([]);
    expect.soft(queued(out.events)).toEqual(matches ? [{ source, subject: source }] : []);
    points(finish(w, out.state), side, matches ? 3 : 0);
  });
});
