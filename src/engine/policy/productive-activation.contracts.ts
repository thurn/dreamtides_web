/** Greedy leaves renewable spark pumps while retaining finite useful activations. */
import { describe, expect, it } from "vitest";
import { parseAvatarId } from "../../types/identifiers";
import { AI } from "../../content/ai";
import { type EngineCardDefinition, type EngineFigmentDefinition } from "../catalog";
import { abandonCost, abandonSelfCost, activated, characterYouControl, enemyCharacter, event, exhaustSelf, self, stackItem, target } from "../dsl/builders";
import { onDusk, triggered, whenDissolved } from "../dsl/triggers";
import { dissolve, draw, gainEnergy, gainPoints, gainSpark, materializeFigments, prevent, sequence } from "../effects/primitives";
import { createEngine, type Engine } from "../engine";
import type { Action } from "../rules/actions";
import { cloneState } from "../state/clone";
import { stateHash } from "../state/hash";
import { battleSeed, opponent, parseFigmentId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource, NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { boardState } from "../testing/board";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { runPolicy, type PolicyRequest } from "./decide";
import { deck, entries } from "./policy.fixtures";

const cap = AI.enginePolicy.greedy.sparkValueCap;
const energyCap = AI.enginePolicy.greedy.energyValueCap;
const figment: EngineFigmentDefinition = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000007450"), subtype: SYNTHETIC.vanilla1.subtype, spark: 1, status: "vanilla", abilities: () => [] };
const pump: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x7451), spark: 0, status: "authored", abilities: () => [activated([abandonCost({ another: true })], gainSpark(self(), 2))] };
function fixture(side: Side, adverse = false, energy = false) {
  const renewer: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x7452), status: "authored", abilities: () => [triggered(whenDissolved(characterYouControl()), materializeFigments(figment.id)), ...(energy ? [triggered(whenDissolved(characterYouControl()), gainEnergy(1))] : []), ...(adverse ? [triggered(onDusk(), gainPoints(100, "opponent"))] : [])] };
  const engine = createEngine(testCatalog([pump, renewer], {}, [figment]));
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100, [side]: { back: [pump.id, renewer.id], figments: [{ slot: { rank: "back", index: 2 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }], deck }, [opponent(side)]: { deck } });
  const decklists = { [side]: entries([pump.id, renewer.id, ...deck]), [opponent(side)]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
  return { engine, initial: state, id: ids[side].back[0]!, decklists };
}
function request(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]): PolicyRequest {
  const decision = engine.decision(state);
  if (decision?.side !== side) throw new Error("wrong actor");
  return { policy: "greedy", side, key: `${state.version}:0:decision`, view: engine.view(state, side), decision: { kind: "topLevel", decision, legal: engine.legalActions(state, side) }, decklists, seed: battleSeed("productive-activation"), budget: { iterations: 256 } };
}
function deterministic(engine: Engine, state: BattleState, side: Side, decklists: PolicyRequest["decklists"]) {
  const input = request(engine, state, side, decklists), before = JSON.stringify({ state, input });
  const chosen = runPolicy(engine, input);
  expect(runPolicy(createEngine(engine.catalog), structuredClone(input))).toEqual(chosen);
  expect(JSON.stringify({ state, input })).toBe(before);
  expect(chosen.trace.used.iterations).toBeLessThanOrEqual(input.budget.iterations);
  if (chosen.choice.kind !== "action") throw new Error("not an action");
  expect(engine.legalActions(state, side)).toContainEqual(chosen.choice.action);
  return chosen.choice.action;
}

describe("productive activation selection", () => {
  for (const side of ["player", "enemy"] as const) {
    it.each([{ adverse: false, energy: false }, { adverse: true, energy: false }, { adverse: false, energy: true }, { adverse: true, energy: true }])(`leaves ${side}'s renewable pump (adverse: $adverse, energy: $energy)`, ({ adverse, energy }) => {
      const { engine, initial, id, decklists } = fixture(side, adverse, energy);
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      const source = new InlineSource(Object.fromEntries((["player", "enemy"] as const).map(actor => [actor, (prompt: Parameters<InlineSource["answer"]>[0], work: BattleState) => {
        const state = cloneState(work), base: PolicyRequest = { policy: "greedy" as const, side: actor, key: `${state.version}:0:decision`, view: engine.view(state, actor), decision: { kind: "prompt" as const, prompt }, decklists, seed: battleSeed("productive-answer"), budget: { iterations: 64 } };
        const choice = runPolicy(engine, base).choice;
        if (choice.kind !== "answer") throw new Error("not an answer");
        return choice.value;
      }])) as ConstructorParameters<typeof InlineSource>[0]);
      let current = initial, activations = 0, left = false;
      const apply = (actor: Side, action: Action) => { const next = engine.apply(current, actor, action, source); records.push({ side: actor, action, answers: next.answers }); current = next.state; };
      for (let count = 0; count < cap + energyCap + 4; count++) {
        const action = deterministic(engine, current, side, decklists);
        if (action.kind !== "activate" || action.source !== id) { left = true; break; }
        const previous = Object.values(current.instances).find(card => card.printing.kind === "figment")?.id;
        const previousEnergy = current.sides[side].currentEnergy;
        apply(side, action);
        while (engine.decision(current)?.kind === "respond") apply(engine.decision(current)!.side, { kind: "pass" });
        expect(current.instances[id].status.gainedSpark).toBeGreaterThan(0);
        if (energy) expect(current.sides[side].currentEnergy).toBeGreaterThan(previousEnergy);
        expect(Object.values(current.instances).some(card => card.printing.kind === "figment" && card.id !== previous)).toBe(true);
        activations++;
      }
      expect(activations).toBeGreaterThan(0);
      expect(left).toBe(true);
      expect(engine.legalActions(current, side)).toContainEqual({ kind: "activate", source: id, ability: 0 });
      if (adverse) {
        const passed = engine.apply(current, side, { kind: "pass" }, NO_PROMPTS).state;
        expect(passed.sides[opponent(side)].score).toBeGreaterThan(current.sides[opponent(side)].score);
      }
      let replay = cloneState(initial);
      for (const record of records) { const answers = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value)); replay = engine.apply(replay, record.side, record.action, answers).state; answers.assertExhausted(); }
      expect(stateHash(replay)).toBe(stateHash(current));
    });

    it.each(["spark", "energy", "draw", "points"] as const)(`keeps ${side}'s finite useful %s activation`, benefit => {
      const effect = benefit === "spark" ? gainSpark(self(), 1) : sequence(gainSpark(self(), 1), benefit === "energy" ? gainEnergy(1) : benefit === "draw" ? draw(1) : gainPoints(1));
      const card: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x7453), spark: benefit === "spark" ? 0 : cap, status: "authored", abilities: () => [activated([exhaustSelf()], effect)] };
      const engine = createEngine(testCatalog([card]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], deck }, [opponent(side)]: { deck } });
      const decklists = { [side]: entries([card.id, ...deck]), [opponent(side)]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
      const action = deterministic(engine, state, side, decklists);
      expect(action).toEqual({ kind: "activate", source: ids[side].back[0], ability: 0 });
      let after = engine.apply(state, side, action, NO_PROMPTS).state;
      while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(after.instances[ids[side].back[0]!].status.exhausted).toBe(true);
      expect(after.instances[ids[side].back[0]!].status.gainedSpark).toBe(1);
      if (benefit === "energy") expect(after.sides[side].currentEnergy).toBeGreaterThan(state.sides[side].currentEnergy);
      if (benefit === "draw") expect(after.sides[side].hand).toHaveLength(1);
      if (benefit === "points") expect(after.sides[side].score).toBeGreaterThan(state.sides[side].score);
    });

    it(`keeps ${side}'s finite source-departure and emblem activations`, () => {
      const departing: EngineCardDefinition = { ...SYNTHETIC.vanilla0, id: syntheticId(0x7456), status: "authored", abilities: () => [activated([abandonSelfCost()], gainEnergy(1))] };
      const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000007457"), status: "authored" as const, abilities: () => [activated([exhaustSelf()], gainEnergy(1))] };
      const engine = createEngine(testCatalog([departing], { avatars: [avatar] }));
      for (const emblem of [false, true]) {
        const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: emblem ? [] : [departing.id], ...(emblem ? { avatar: avatar.id } : {}), deck }, [opponent(side)]: { deck } });
        const decklists = { [side]: entries([...(emblem ? [] : [departing.id]), ...deck]), [opponent(side)]: entries(deck) } as Record<Side, ReturnType<typeof entries>>;
        const action = deterministic(engine, state, side, decklists);
        expect(action).toEqual({ kind: "activate", source: emblem ? { kind: "avatar", side } : ids[side].back[0], ability: 0 });
        let after = engine.apply(state, side, action, NO_PROMPTS).state;
        while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
        expect(after.sides[side].currentEnergy).toBe(1);
        if (emblem) expect(after.sides[side].avatar?.exhausted).toBe(true);
        else expect(after.instances[ids[side].back[0]!].zone).toBe("void");
      }
    });

    it(`keeps ${side}'s finite defensive spark activation against pending removal`, () => {
      const counter: EngineCardDefinition = { ...pump, id: syntheticId(0x7491), spark: 2, abilities: () => [activated([abandonCost({ another: true })], gainSpark(self(), 1), { speed: "interrupt" })] };
      const threat: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x7492), status: "authored", abilities: () => [event(dissolve(target(enemyCharacter({ sparkAtMost: 2 }))))] };
      const engine = createEngine(testCatalog([counter, threat], {}, [figment])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: other, phase: "day", [side]: { back: [counter.id], figments: [{ slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: figment.id, spark: 1 } }], deck }, [other]: { hand: [threat.id], deck } });
      const ownDeck = entries([counter.id, ...deck]), otherDeck = entries([threat.id, ...deck]);
      const decklists = side === "player" ? { player: ownDeck, enemy: otherDeck } : { player: otherDeck, enemy: ownDeck };
      const sourceId = ids[side].back[0]!, figmentId = ids[side].back[1]!;
      const records: { side: Side; action: Action; answers: readonly RecordedAnswer[] }[] = [];
      const source = new InlineSource({ player: () => [sourceId], enemy: () => [sourceId] });
      let current = state;
      const apply = (actor: Side, action: Action) => { const next = engine.apply(current, actor, action, source); records.push({ side: actor, action, answers: next.answers }); current = next.state; };
      apply(other, { kind: "play", card: ids[other].hand[0], from: "hand" });
      const pending = current;
      let passed = engine.apply(pending, side, { kind: "pass" }, NO_PROMPTS).state;
      while (engine.decision(passed)?.kind === "respond") passed = engine.apply(passed, engine.decision(passed)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(passed.instances[sourceId].zone).toBe("void");
      expect(passed.instances[figmentId].zone).toBe("play");
      const action = deterministic(engine, pending, side, decklists);
      expect(action).toEqual({ kind: "activate", source: sourceId, ability: 0 });
      apply(side, action);
      while (engine.decision(current)?.kind === "respond") apply(engine.decision(current)!.side, { kind: "pass" });
      expect(current.instances[figmentId]).toBeUndefined();
      expect(current.instances[sourceId].zone).toBe("play");
      expect(engine.view(current, side).instances[sourceId]?.characteristics.spark).toBe(3);
      expect(current.turn.phase).toBe(pending.turn.phase);
      expect(records.some(record => record.answers.some(answer => !answer.auto))).toBe(true);
      let replay = cloneState(state);
      for (const record of records) { const answers = new ScriptedSource(record.answers.filter(answer => !answer.auto).map(answer => answer.value)); replay = engine.apply(replay, record.side, record.action, answers).state; answers.assertExhausted(); }
      expect(stateHash(replay)).toBe(stateHash(current));
    });

    it(`keeps ${side}'s finite neutral counter against a damaging response horizon`, () => {
      const counter: EngineCardDefinition = { ...SYNTHETIC.vanilla1, id: syntheticId(0x7454), spark: cap, status: "authored", abilities: () => [activated([exhaustSelf()], prevent(stackItem({ controller: "opponent" })), { speed: "interrupt" })] };
      const threat: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x7455), status: "authored", abilities: () => [event(gainPoints(1))] };
      const engine = createEngine(testCatalog([counter, threat])), other = opponent(side);
      const { state, ids } = boardState(engine.catalog, { active: other, phase: "day", [side]: { back: [counter.id], deck }, [other]: { hand: [threat.id], deck } });
      const pending = engine.apply(state, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, NO_PROMPTS).state;
      const decklists = { [side]: entries([counter.id, ...deck]), [other]: entries([threat.id, ...deck]) } as Record<Side, ReturnType<typeof entries>>;
      const action = deterministic(engine, pending, side, decklists);
      expect(action).toEqual({ kind: "activate", source: ids[side].back[0], ability: 0 });
      let after = engine.apply(pending, side, action, NO_PROMPTS).state;
      while (engine.decision(after)?.kind === "respond") after = engine.apply(after, engine.decision(after)!.side, { kind: "pass" }, NO_PROMPTS).state;
      expect(after.instances[ids[other].hand[0]].zone).toBe("void");
      expect(after.sides[other].score).toBe(0);
    });
  }
});
